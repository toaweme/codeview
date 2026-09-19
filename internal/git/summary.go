package git

import (
	"context"
	"errors"
	"fmt"
	"hash/fnv"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	MaxActivityLimit = 50
	summaryWorkers   = 8
	week             = 7 * 24 * time.Hour
)

type cachedSummary struct {
	key string
	sum *repoSummary
}

type repoSummary struct {
	summary RepoSummary
}

func (s *CLIStore) summaries(ctx context.Context, names []string) ([]*repoSummary, error) {
	end := activityEnd(s.cfg.Now())
	out := make([]*repoSummary, len(names))
	errs := make([]error, len(names))
	sem := make(chan struct{}, summaryWorkers)
	var wg sync.WaitGroup
	for i, name := range names {
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			out[i], errs[i] = s.summary(ctx, name, end)
		}()
	}
	wg.Wait()
	for i, err := range errs {
		if err != nil {
			return nil, fmt.Errorf("failed to summarise repository %q: %w", names[i], err)
		}
	}
	return out, nil
}

func (s *CLIStore) summary(ctx context.Context, name string, end time.Time) (*repoSummary, error) {
	repo, err := s.open(name)
	if err != nil {
		return nil, err
	}
	key, err := fingerprint(repo.dir)
	if err != nil {
		return nil, err
	}
	// the weekly buckets shift with the day
	key += "@" + end.Format(time.DateOnly)
	s.cacheMu.Lock()
	cached, ok := s.cache[name]
	s.cacheMu.Unlock()
	if ok && cached.key == key {
		return cached.sum, nil
	}
	sum, err := repo.summarise(ctx, end)
	if err != nil {
		return nil, err
	}
	s.cacheMu.Lock()
	s.cache[name] = cachedSummary{key: key, sum: sum}
	s.cacheMu.Unlock()
	return sum, nil
}

func activityEnd(now time.Time) time.Time {
	return now.UTC().Truncate(24 * time.Hour).Add(24 * time.Hour)
}

// fingerprint stats what ref updates and description edits touch, far cheaper than asking git.
func fingerprint(dir string) (string, error) {
	h := fnv.New64a()
	stat := func(path string, info fs.FileInfo) {
		fmt.Fprintf(h, "%s\x00%d\x00%d\x00", path, info.Size(), info.ModTime().UnixNano())
	}
	for _, file := range []string{"HEAD", "packed-refs", "description"} {
		info, err := os.Stat(filepath.Join(dir, file))
		if errors.Is(err, fs.ErrNotExist) {
			continue
		}
		if err != nil {
			return "", fmt.Errorf("failed to stat %q: %w", file, err)
		}
		stat(file, info)
	}
	refs := filepath.Join(dir, "refs")
	err := filepath.WalkDir(refs, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				return nil
			}
			return err
		}
		info, err := d.Info()
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				return nil
			}
			return err
		}
		stat(path, info)
		return nil
	})
	if err != nil {
		return "", fmt.Errorf("failed to walk refs: %w", err)
	}
	return strconv.FormatUint(h.Sum64(), 16), nil
}

const summaryRefFormat = "%(refname)%00%(objectname)%00%(*objectname)%00%(creatordate:iso-strict)%00%(contents:subject)"

func (r *cliRepo) summarise(ctx context.Context, end time.Time) (*repoSummary, error) {
	info, err := r.Info(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to read repository info: %w", err)
	}
	sum := &repoSummary{
		summary: RepoSummary{RepoInfo: info, Activity: make([]int, ActivityWeeks)},
	}
	out, err := r.run(
		ctx,
		"for-each-ref",
		"--sort=-creatordate",
		"--format="+summaryRefFormat,
		"refs/heads",
		"refs/tags",
	)
	if err != nil {
		return nil, fmt.Errorf("failed to list refs: %w", err)
	}
	var tip string
	var tags []Tag
	for line := range strings.SplitSeq(string(out), "\n") {
		f := strings.Split(line, "\x00")
		if len(f) != 5 {
			continue
		}
		commit := f[1]
		if f[2] != "" {
			commit = f[2]
		}
		when := parseISO(f[3])
		if name, ok := strings.CutPrefix(f[0], "refs/heads/"); ok {
			sum.summary.BranchCount++
			if name == info.DefaultBranch {
				tip = commit
			}
		} else if name, ok := strings.CutPrefix(f[0], "refs/tags/"); ok {
			sum.summary.TagCount++
			if len(tags) <= MaxActivityLimit {
				tags = append(tags, Tag{Name: name, Commit: commit, TaggedAt: when})
			}
		}
	}
	if len(tags) > 0 {
		sum.summary.LatestTag = &tags[0]
	}
	if tip == "" {
		return sum, nil
	}
	recent, err := r.Log(ctx, LogQuery{Commit: tip, Limit: MaxActivityLimit})
	if err != nil {
		return nil, fmt.Errorf("failed to read recent history: %w", err)
	}
	if len(recent.Commits) > 0 {
		c := recent.Commits[0]
		sum.summary.LastCommit = &CommitSummary{Hash: c.Hash, Subject: c.Subject, Author: c.Author}
	}
	sum.summary.Activity, err = r.weeklyCommits(ctx, tip, end)
	if err != nil {
		return nil, err
	}
	return sum, nil
}

func (r *cliRepo) weeklyCommits(ctx context.Context, tip string, end time.Time) ([]int, error) {
	start := end.Add(-ActivityWeeks * week)
	out, err := r.run(
		ctx,
		"log",
		"--format=%ct",
		"--since="+start.Format(time.RFC3339),
		"--end-of-options",
		tip,
		"--",
	)
	if err != nil {
		return nil, fmt.Errorf("failed to count recent commits: %w", err)
	}
	counts := make([]int, ActivityWeeks)
	for line := range strings.FieldsSeq(string(out)) {
		sec, err := strconv.ParseInt(line, 10, 64)
		if err != nil {
			continue
		}
		t := time.Unix(sec, 0)
		if t.Before(start) || !t.Before(end) {
			continue
		}
		counts[int(t.Sub(start)/week)]++
	}
	return counts, nil
}
