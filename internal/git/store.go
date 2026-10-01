package git

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

// DefaultRescan is how long a Store trusts its last scan before locating repositories again.
const DefaultRescan = 30 * time.Second

// Config configures a CLIStore. Binary is the git executable and defaults to "git".
type Config struct {
	Locator Locator
	// Mode defaults to ModePublic.
	Mode        Mode
	Binary      string
	IdleTimeout time.Duration
	// Rescan defaults to DefaultRescan.
	Rescan time.Duration
	Now    func() time.Time
	// Warm summarizes every served repository in the background on Warm and after each rescan,
	// so the first visitor of a day does not wait for every repository to be read.
	Warm bool
}

// CLIStore reads the repositories its Locator finds with the git CLI.
type CLIStore struct {
	cfg Config

	locMu     sync.Mutex
	locs      map[string]Location
	names     []string
	scannedAt time.Time

	mu    sync.Mutex
	repos map[string]*cliRepo

	cacheMu sync.Mutex
	cache   map[string]cachedSummary
	calls   map[string]*summaryCall

	// workers bounds the summaries running at once across requests and warming.
	workers chan struct{}

	warmMu  sync.Mutex
	warming bool
	closed  bool
	// stop cancels a warm in flight when the store closes.
	stop  chan struct{}
	warms sync.WaitGroup
}

var _ Store = (*CLIStore)(nil)

// NewCLIStore returns a Store that reads repositories through the git executable.
func NewCLIStore(cfg Config) *CLIStore {
	if cfg.Binary == "" {
		cfg.Binary = "git"
	}
	if cfg.Mode == "" {
		cfg.Mode = ModePublic
	}
	if cfg.IdleTimeout == 0 {
		cfg.IdleTimeout = 5 * time.Minute
	}
	if cfg.Rescan == 0 {
		cfg.Rescan = DefaultRescan
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	return &CLIStore{
		cfg:     cfg,
		repos:   map[string]*cliRepo{},
		cache:   map[string]cachedSummary{},
		calls:   map[string]*summaryCall{},
		workers: make(chan struct{}, summaryWorkers),
		stop:    make(chan struct{}),
	}
}

// Warm summarizes every served repository in the background when Config.Warm is set.
// It returns at once and does nothing while a warm is already running or once the store is closed.
func (s *CLIStore) Warm() {
	if !s.cfg.Warm {
		return
	}
	s.warmMu.Lock()
	defer s.warmMu.Unlock()
	if s.warming || s.closed {
		return
	}
	s.warming = true
	s.warms.Go(func() {
		defer func() {
			s.warmMu.Lock()
			s.warming = false
			s.warmMu.Unlock()
		}()
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		go func() {
			select {
			case <-s.stop:
				cancel()
			case <-ctx.Done():
			}
		}()
		_, names, err := s.located(ctx)
		if err != nil {
			return
		}
		end := activityEnd(s.cfg.Now())
		// a repository that fails here fails again for the request that needs it, which reports it
		_ = s.each(ctx, len(names), func(i int) {
			_, _ = s.summary(ctx, names[i], end)
		})
	})
}

// List summarizes every repository the store serves. A repository that cannot be read
// stays in the list with Error set, so one broken mirror never hides the rest.
func (s *CLIStore) List(ctx context.Context) ([]RepoSummary, error) {
	locs, names, err := s.located(ctx)
	if err != nil {
		return nil, err
	}
	summaries, failed, err := s.summaries(ctx, names)
	if err != nil {
		return nil, err
	}
	failures := make(map[string]RepoFailure, len(failed))
	for _, f := range failed {
		failures[f.Repo] = f
	}
	list := make([]RepoSummary, len(summaries))
	for i, sum := range summaries {
		if sum != nil {
			list[i] = sum.summary
		} else {
			f := failures[names[i]]
			list[i] = RepoSummary{
				RepoInfo:     RepoInfo{Name: names[i]},
				Activity:     make([]int, ActivityWeeks),
				Contributors: []string{},
				Error:        f.Error,
				Cause:        f.Cause,
			}
		}
		list[i].WorkTree = locs[names[i]].WorkTree
	}
	return list, nil
}

// located returns the repositories the mode serves, locating them again once the last scan is stale.
func (s *CLIStore) located(ctx context.Context) (map[string]Location, []string, error) {
	s.locMu.Lock()
	defer s.locMu.Unlock()
	if !s.scannedAt.IsZero() && time.Since(s.scannedAt) < s.cfg.Rescan {
		return s.locs, s.names, nil
	}
	if s.cfg.Locator == nil {
		return nil, nil, fmt.Errorf("failed to locate repositories: %w", errNoLocator)
	}
	found, err := s.cfg.Locator.Locate(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to locate repositories: %w", err)
	}
	locs := make(map[string]Location, len(found))
	names := make([]string, 0, len(found))
	for _, loc := range found {
		if s.cfg.Mode != ModeAll && !loc.Public {
			continue
		}
		if _, ok := locs[loc.Name]; ok {
			continue
		}
		locs[loc.Name] = loc
		names = append(names, loc.Name)
	}
	sort.Strings(names)
	for name := range s.locs {
		if next, ok := locs[name]; !ok || next.GitDir != s.locs[name].GitDir {
			s.forget(name)
		}
	}
	s.locs, s.names, s.scannedAt = locs, names, time.Now()
	// the warm reads the scan this call just stored, once locMu is released
	s.Warm() //nolint:contextcheck // the warm outlives the request whose call rescanned
	return locs, names, nil
}

var errNoLocator = errors.New("no locator configured")

// Open returns the repository called name, or ErrNotFound when the store does not serve it.
func (s *CLIStore) Open(ctx context.Context, name string) (Repo, error) {
	return s.open(ctx, name)
}

func (s *CLIStore) open(ctx context.Context, name string) (*cliRepo, error) {
	if err := ValidateRepoName(name); err != nil {
		return nil, err
	}
	locs, _, err := s.located(ctx)
	if err != nil {
		return nil, err
	}
	loc, ok := locs[name]
	if !ok {
		return nil, fmt.Errorf("repository %q does not exist: %w", name, ErrNotFound)
	}
	if _, err := os.Stat(filepath.Join(loc.GitDir, "HEAD")); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			s.forget(name)
			return nil, fmt.Errorf("repository %q does not exist: %w", name, ErrNotFound)
		}
		return nil, fmt.Errorf("failed to stat repository %q: %w", name, err)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if r, ok := s.repos[name]; ok && r.dir == loc.GitDir {
		return r, nil
	} else if ok {
		r.cat.Close()
	}
	r := newCLIRepo(name, loc.GitDir, s.cfg.Binary, s.cfg.IdleTimeout) //nolint:contextcheck // its cat-file process outlives the request and stops on the idle timeout
	s.repos[name] = r
	return r, nil
}

func (s *CLIStore) forget(name string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if r, ok := s.repos[name]; ok {
		r.cat.Close()
		delete(s.repos, name)
	}
	s.cacheMu.Lock()
	delete(s.cache, name)
	s.cacheMu.Unlock()
}

// Close cancels a warm in flight, waits for it and stops every git process the store keeps open.
func (s *CLIStore) Close() error {
	s.warmMu.Lock()
	if !s.closed {
		s.closed = true
		close(s.stop)
	}
	s.warmMu.Unlock()
	s.warms.Wait()
	s.mu.Lock()
	defer s.mu.Unlock()
	for name, r := range s.repos {
		r.cat.Close()
		delete(s.repos, name)
	}
	return nil
}
