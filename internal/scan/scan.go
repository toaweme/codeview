// Package scan finds the git repositories under one folder.
package scan

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/toaweme/log"

	"github.com/toaweme/codeview/internal/git"
)

// DefaultMaxDepth bounds how many folders deep a scan looks, which also stops symlink cycles.
const DefaultMaxDepth = 5

type Config struct {
	// Dir is the folder holding the git repositories.
	Dir string
	// MaxDepth defaults to DefaultMaxDepth.
	MaxDepth int
	Logger   log.Logger
}

// Scanner walks Dir for bare repositories and working copies.
type Scanner struct {
	cfg Config
}

var _ git.Locator = (*Scanner)(nil)

func New(cfg Config) *Scanner {
	if cfg.MaxDepth == 0 {
		cfg.MaxDepth = DefaultMaxDepth
	}
	if cfg.Logger == nil {
		cfg.Logger = log.Discard()
	}
	return &Scanner{cfg: cfg}
}

type found struct {
	// rel is the slash-separated folder path under Dir.
	rel      string
	gitDir   string
	workTree bool
}

// Locate walks Dir, following symlinked folders, and names each repository after
// its origin remote, or after its folder when it has none or the name is taken.
func (s *Scanner) Locate(ctx context.Context) ([]git.Location, error) {
	var repos []found
	seenDirs := map[string]bool{}
	seenGit := map[string]bool{}
	var walk func(dir, rel string, depth int) error
	walk = func(dir, rel string, depth int) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		real, err := filepath.EvalSymlinks(dir)
		if err != nil {
			if depth == 0 {
				return err
			}
			s.cfg.Logger.Warn("scan.skipped", "path", dir, "error", err)
			return nil
		}
		if seenDirs[real] {
			return nil
		}
		seenDirs[real] = true
		entries, err := os.ReadDir(dir)
		if err != nil {
			if depth == 0 {
				return err
			}
			s.cfg.Logger.Warn("scan.skipped", "path", dir, "error", err)
			return nil
		}
		for _, e := range entries {
			name := e.Name()
			if strings.HasPrefix(name, ".") {
				continue
			}
			path := filepath.Join(dir, name)
			info, err := os.Stat(path)
			if err != nil || !info.IsDir() {
				continue
			}
			childRel := name
			if rel != "" {
				childRel = rel + "/" + name
			}
			gitDir, workTree, ok := repoAt(path)
			if ok {
				resolved, err := filepath.EvalSymlinks(gitDir)
				if err != nil || seenGit[resolved] {
					continue
				}
				seenGit[resolved] = true
				repos = append(repos, found{rel: childRel, gitDir: gitDir, workTree: workTree})
				continue
			}
			if isFile(filepath.Join(path, ".git")) || depth+1 >= s.cfg.MaxDepth {
				continue
			}
			if err := walk(path, childRel, depth+1); err != nil {
				return err
			}
		}
		return nil
	}
	if err := walk(s.cfg.Dir, "", 0); err != nil {
		return nil, fmt.Errorf("failed to scan repositories under %q: %w", s.cfg.Dir, err)
	}
	return s.name(repos), nil
}

func (s *Scanner) name(repos []found) []git.Location {
	taken := map[string]bool{}
	locs := make([]git.Location, 0, len(repos))
	for _, r := range repos {
		folder := strings.TrimSuffix(r.rel, ".git")
		origin := normaliseURL(originURL(filepath.Join(r.gitDir, "config")))
		name := ""
		switch {
		case origin != "" && git.ValidateRepoName(origin) == nil && !taken[origin]:
			name = origin
		case git.ValidateRepoName(folder) == nil && !taken[folder]:
			if origin != "" {
				s.cfg.Logger.Warn("scan.name_taken", "origin", origin, "path", folder)
			}
			name = folder
		default:
			s.cfg.Logger.Warn("scan.skipped", "path", folder, "reason", "no usable name")
			continue
		}
		taken[name] = true
		loc := git.Location{
			Name:     name,
			GitDir:   r.gitDir,
			WorkTree: r.workTree,
			Public:   exists(filepath.Join(r.gitDir, "git-daemon-export-ok")),
		}
		locs = append(locs, loc)
	}
	return locs
}

// repoAt reports the git dir of a working copy, whose .git is a folder, or of a bare repository.
func repoAt(path string) (string, bool, bool) {
	dotGit := filepath.Join(path, ".git")
	if info, err := os.Stat(dotGit); err == nil && info.IsDir() && isBare(dotGit) {
		return dotGit, true, true
	}
	if isBare(path) {
		return path, false, true
	}
	return "", false, false
}

func isBare(dir string) bool {
	return isFile(filepath.Join(dir, "HEAD")) &&
		isDir(filepath.Join(dir, "objects")) &&
		isDir(filepath.Join(dir, "refs"))
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func isFile(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.Mode().IsRegular()
}

func isDir(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

// originURL reads url from the [remote "origin"] section of a git config file.
func originURL(path string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	inOrigin := false
	for line := range strings.SplitSeq(string(b), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || line[0] == '#' || line[0] == ';' {
			continue
		}
		if line[0] == '[' {
			inOrigin = isOriginSection(line)
			continue
		}
		if !inOrigin {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok || !strings.EqualFold(strings.TrimSpace(key), "url") {
			continue
		}
		return strings.Trim(strings.TrimSpace(value), `"`)
	}
	return ""
}

func isOriginSection(line string) bool {
	end := strings.IndexByte(line, ']')
	if end < 0 {
		return false
	}
	section, sub, ok := strings.Cut(strings.TrimSpace(line[1:end]), " ")
	return ok && strings.EqualFold(section, "remote") && strings.TrimSpace(sub) == `"origin"`
}

// normaliseURL turns a remote URL into "host/owner/name", or "" for a local path.
// It drops the scheme, userinfo, port and ".git" suffix.
func normaliseURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	var host, path string
	if scheme, rest, ok := strings.Cut(raw, "://"); ok {
		if scheme == "file" {
			return ""
		}
		host, path, _ = strings.Cut(rest, "/")
	} else {
		// scp-like syntax, user@host:owner/name, needs a colon before any slash
		colon := strings.IndexByte(raw, ':')
		slash := strings.IndexByte(raw, '/')
		if colon < 0 || (slash >= 0 && slash < colon) {
			return ""
		}
		host, path = raw[:colon], raw[colon+1:]
	}
	if at := strings.LastIndexByte(host, '@'); at >= 0 {
		host = host[at+1:]
	}
	if h, _, ok := strings.Cut(host, ":"); ok {
		host = h
	}
	host = strings.ToLower(host)
	path = strings.TrimSuffix(strings.Trim(path, "/"), ".git")
	path = strings.TrimPrefix(path, "~")
	if host == "" || path == "" {
		return ""
	}
	return host + "/" + path
}
