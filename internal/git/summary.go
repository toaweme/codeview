package git

import (
	"context"
	"errors"
	"fmt"
	"hash/fnv"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	MaxActivityLimit     = 50
	DefaultActivityLimit = 30
	summaryWorkers       = 8
	week                 = 7 * 24 * time.Hour
)

type cachedSummary struct {
	key string
	sum *repoSummary
}

type repoSummary struct {
	summary  RepoSummary
	commits  []ActivityCommit
	tags     []ActivityTag
	branches []ActivityBranch
}

func (s *CLIStore) Activity(ctx context.Context, q ActivityQuery) (Activity, error) {
	_, names, err := s.located(ctx)
	if err != nil {
		return Activity{}, err
	}
	org := strings.Trim(q.Org, "/")
	repo := strings.Trim(q.Repo, "/")
	if org != "" || repo != "" {
		kept := names[:0:0]
		for _, name := range names {
			if (org == "" || strings.HasPrefix(name, org+"/")) && (repo == "" || name == repo) {
				kept = append(kept, name)
			}
		}
		names = kept
	}
	limit := q.Limit
	if limit <= 0 {
		limit = DefaultActivityLimit
	}
	limit = min(limit, MaxActivityLimit)
	summaries, err := s.summaries(ctx, names)
	if err != nil {
		return Activity{}, err
	}
	act := Activity{
		Commits:  []ActivityCommit{},
		Tags:     []ActivityTag{},
		Branches: []ActivityBranch{},
	}
	for _, sum := range summaries {
		act.Commits = append(act.Commits, sum.commits...)
		act.Tags = append(act.Tags, sum.tags...)
		act.Branches = append(act.Branches, sum.branches...)
	}
	sort.SliceStable(act.Commits, func(i, j int) bool {
		return act.Commits[i].CommittedAt.After(act.Commits[j].CommittedAt)
	})
	sort.SliceStable(act.Tags, func(i, j int) bool {
		return act.Tags[i].TaggedAt.After(act.Tags[j].TaggedAt)
	})
	sort.SliceStable(act.Branches, func(i, j int) bool {
		return act.Branches[i].UpdatedAt.After(act.Branches[j].UpdatedAt)
	})
	act.Commits = act.Commits[:min(limit, len(act.Commits))]
	act.Tags = act.Tags[:min(limit, len(act.Tags))]
	act.Branches = act.Branches[:min(limit, len(act.Branches))]
	return act, nil
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
	repo, err := s.open(ctx, name)
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
		summary: RepoSummary{
			RepoInfo:     info,
			Activity:     make([]int, ActivityWeeks),
			Contributors: []string{},
		},
		commits:  []ActivityCommit{},
		tags:     []ActivityTag{},
		branches: []ActivityBranch{},
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
				continue
			}
			if len(sum.branches) < MaxActivityLimit {
				branch := ActivityBranch{
					Repo:      r.name,
					Name:      name,
					Commit:    commit,
					Subject:   f[4],
					UpdatedAt: when,
				}
				sum.branches = append(sum.branches, branch)
			}
		} else if name, ok := strings.CutPrefix(f[0], "refs/tags/"); ok {
			sum.summary.TagCount++
			if len(tags) <= MaxActivityLimit {
				tags = append(tags, Tag{Name: name, Commit: commit, TaggedAt: when})
			}
		}
	}
	for i, tag := range tags[:min(len(tags), MaxActivityLimit)] {
		at := ActivityTag{Repo: r.name, Name: tag.Name, Commit: tag.Commit, TaggedAt: tag.TaggedAt}
		if i+1 < len(tags) {
			at.Previous = tags[i+1].Name
		}
		sum.tags = append(sum.tags, at)
	}
	if len(tags) > 0 {
		sum.summary.LatestTag = &tags[0]
	}
	if tip == "" {
		return sum, nil
	}
	for i := range sum.branches {
		b := &sum.branches[i]
		b.Ahead, b.Behind, err = r.aheadBehind(ctx, tip, b.Commit)
		if err != nil {
			return nil, fmt.Errorf(
				"failed to compare branch %q with %q: %w",
				b.Name,
				info.DefaultBranch,
				err,
			)
		}
	}
	recent, err := r.Log(ctx, LogQuery{Commit: tip, Limit: MaxActivityLimit})
	if err != nil {
		return nil, fmt.Errorf("failed to read recent history: %w", err)
	}
	for _, c := range recent.Commits {
		commit := ActivityCommit{
			Repo:        r.name,
			Hash:        c.Hash,
			Subject:     c.Subject,
			Author:      c.Author,
			CommittedAt: c.Committer.Date,
			Ref:         info.DefaultBranch,
		}
		sum.commits = append(sum.commits, commit)
	}
	if len(recent.Commits) > 0 {
		c := recent.Commits[0]
		sum.summary.LastCommit = &CommitSummary{Hash: c.Hash, Subject: c.Subject, Author: c.Author}
	}
	sum.summary.Activity, sum.summary.Contributors, err = r.weeklyCommits(ctx, tip, end)
	if err != nil {
		return nil, err
	}
	return sum, nil
}

func (r *cliRepo) aheadBehind(ctx context.Context, base, head string) (int, int, error) {
	out, err := r.run(
		ctx,
		"rev-list",
		"--left-right",
		"--count",
		"--end-of-options",
		base+"..."+head,
		"--",
	)
	if err != nil {
		return 0, 0, err
	}
	f := strings.Fields(string(out))
	if len(f) != 2 {
		return 0, 0, fmt.Errorf("failed to parse rev-list counts %q: %w", out, io.ErrUnexpectedEOF)
	}
	behind, errB := strconv.Atoi(f[0])
	ahead, errA := strconv.Atoi(f[1])
	if err := errors.Join(errB, errA); err != nil {
		return 0, 0, fmt.Errorf("failed to parse rev-list counts %q: %w", out, err)
	}
	return ahead, behind, nil
}

func (r *cliRepo) weeklyCommits(ctx context.Context, tip string, end time.Time) ([]int, []string, error) {
	start := end.Add(-ActivityWeeks * week)
	out, err := r.run(
		ctx,
		"log",
		"--format=%ct%x00%ae",
		"--since="+start.Format(time.RFC3339),
		"--end-of-options",
		tip,
		"--",
	)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to count recent commits: %w", err)
	}
	counts, contributors := tallyCommits(string(out), end)
	return counts, contributors, nil
}

// tallyCommits buckets "unix-seconds NUL author-email" lines into weeks ending at end
// and collects the distinct lowercased author emails of the last ContributorWeeks.
func tallyCommits(out string, end time.Time) ([]int, []string) {
	start := end.Add(-ActivityWeeks * week)
	recent := end.Add(-ContributorWeeks * week)
	counts := make([]int, ActivityWeeks)
	seen := map[string]bool{}
	contributors := []string{}
	for line := range strings.SplitSeq(out, "\n") {
		stamp, email, _ := strings.Cut(strings.TrimSpace(line), "\x00")
		sec, err := strconv.ParseInt(stamp, 10, 64)
		if err != nil {
			continue
		}
		t := time.Unix(sec, 0)
		if t.Before(start) || !t.Before(end) {
			continue
		}
		counts[int(t.Sub(start)/week)]++
		email = strings.ToLower(strings.TrimSpace(email))
		if email == "" || t.Before(recent) || seen[email] {
			continue
		}
		seen[email] = true
		contributors = append(contributors, email)
	}
	sort.Strings(contributors)
	return counts, contributors
}
