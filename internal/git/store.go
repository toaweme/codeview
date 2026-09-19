package git

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type Config struct {
	// Root is soft-serve's "<data>/repos", where repositories may nest as "org/name.git".
	Root        string
	Binary      string
	IdleTimeout time.Duration
	Now         func() time.Time
}

// CLIStore reads bare repositories under a root directory with the git CLI.
type CLIStore struct {
	cfg Config

	mu    sync.Mutex
	repos map[string]*cliRepo

	cacheMu sync.Mutex
	cache   map[string]cachedSummary
}

var _ Store = (*CLIStore)(nil)

func NewCLIStore(cfg Config) *CLIStore {
	if cfg.Binary == "" {
		cfg.Binary = "git"
	}
	if cfg.IdleTimeout == 0 {
		cfg.IdleTimeout = 5 * time.Minute
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	return &CLIStore{cfg: cfg, repos: map[string]*cliRepo{}, cache: map[string]cachedSummary{}}
}

func (s *CLIStore) List(ctx context.Context) ([]RepoSummary, error) {
	names, err := s.discover()
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
	}
	return list, nil
}

func (s *CLIStore) discover() ([]string, error) {
	var names []string
	err := filepath.WalkDir(s.cfg.Root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			if path == s.cfg.Root && errors.Is(err, fs.ErrNotExist) {
				return fs.SkipAll
			}
			return err
		}
		if !d.IsDir() || path == s.cfg.Root {
			return nil
		}
		if strings.HasPrefix(d.Name(), ".") {
			return fs.SkipDir
		}
		if !strings.HasSuffix(d.Name(), ".git") {
			return nil
		}
		if _, err := os.Stat(filepath.Join(path, "HEAD")); err == nil {
			rel, err := filepath.Rel(s.cfg.Root, path)
			if err != nil {
				return err
			}
			name := strings.TrimSuffix(filepath.ToSlash(rel), ".git")
			if ValidateRepoName(name) == nil {
				names = append(names, name)
			}
		}
		return fs.SkipDir
	})
	if err != nil {
		return nil, fmt.Errorf("failed to scan repositories under %q: %w", s.cfg.Root, err)
	}
	sort.Strings(names)
	return names, nil
}

func (s *CLIStore) Open(_ context.Context, name string) (Repo, error) {
	return s.open(name)
}

func (s *CLIStore) open(name string) (*cliRepo, error) {
	if err := ValidateRepoName(name); err != nil {
		return nil, err
	}
	dir := filepath.Join(s.cfg.Root, filepath.FromSlash(name)+".git")
	if _, err := os.Stat(filepath.Join(dir, "HEAD")); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			s.forget(name)
			return nil, fmt.Errorf("repository %q does not exist: %w", name, ErrNotFound)
		}
		return nil, fmt.Errorf("failed to stat repository %q: %w", name, err)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if r, ok := s.repos[name]; ok {
		return r, nil
	}
	r := newCLIRepo(name, dir, s.cfg.Binary, s.cfg.IdleTimeout)
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

func (s *CLIStore) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for name, r := range s.repos {
		r.cat.Close()
		delete(s.repos, name)
	}
	return nil
}
