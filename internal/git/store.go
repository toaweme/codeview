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
	return &CLIStore{cfg: cfg, repos: map[string]*cliRepo{}, cache: map[string]cachedSummary{}}
}

// List summarizes every repository the store serves.
func (s *CLIStore) List(ctx context.Context) ([]RepoSummary, error) {
	locs, names, err := s.located(ctx)
	if err != nil {
		return nil, err
	}
	summaries, err := s.summaries(ctx, names)
	if err != nil {
		return nil, err
	}
	list := make([]RepoSummary, len(summaries))
	for i, sum := range summaries {
		list[i] = sum.summary
		loc := locs[names[i]]
		list[i].WorkTree = loc.WorkTree
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

// Close stops every git process the store keeps open.
func (s *CLIStore) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for name, r := range s.repos {
		r.cat.Close()
		delete(s.repos, name)
	}
	return nil
}
