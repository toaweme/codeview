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

// MaxActivityLimit caps an ActivityQuery's Limit, and DefaultActivityLimit applies when it is zero.
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
	summary RepoSummary
	// tip is the default branch's commit the summary was read at.
	tip      string
	commits  []ActivityCommit
	tags     []ActivityTag
	branches []ActivityBranch
	// releases holds every tag, where tags keeps only the newest.
	releases []release
}

// summaryCall lets concurrent readers of one repository share a single summarize.
type summaryCall struct {
	done chan struct{}
	sum  *repoSummary
	err  error
}

// Activity merges the recent commits, tags and branches of the repositories q selects.
func (s *CLIStore) Activity(ctx context.Context, q ActivityQuery) (Activity, error) {
	var repos []string
	if q.Repo != "" {
		repos = []string{q.Repo}
	}
	names, err := s.selected(ctx, q.Org, repos)
	if err != nil {
		return Activity{}, err
	}
	limit := q.Limit
	if limit <= 0 {
		limit = DefaultActivityLimit
	}
	limit = min(limit, MaxActivityLimit)
	summaries, failed, err := s.summaries(ctx, names)
	if err != nil {
		return Activity{}, err
	}
	act := Activity{
		Failed:   failed,
		Commits:  []ActivityCommit{},
		Tags:     []ActivityTag{},
		Branches: []ActivityBranch{},
	}
	for _, sum := range summaries {
		if sum == nil {
			continue
		}
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

// summaries leaves a nil summary for every repository it reports as failed,
// and fails as a whole only when ctx ends.
func (s *CLIStore) summaries(ctx context.Context, names []string) ([]*repoSummary, []RepoFailure, error) {
	end := activityEnd(s.cfg.Now())
	out := make([]*repoSummary, len(names))
	errs := make([]error, len(names))
	err := s.each(ctx, len(names), func(i int) {
		out[i], errs[i] = s.summary(ctx, names[i], end)
	})
	if err == nil {
		err = ctx.Err()
	}
	if err != nil {
		return nil, nil, fmt.Errorf("failed to summarize repositories: %w", err)
	}
	failed := []RepoFailure{}
	for i, err := range errs {
		if err != nil {
			out[i] = nil
			failed = append(failed, repoFailure(names[i], fmt.Errorf("failed to summarize repository %q: %w", names[i], err)))
		}
	}
	return out, failed, nil
}

// repoFailure keeps the cause for the log and tells readers only what kind of failure it was.
func repoFailure(name string, err error) RepoFailure {
	msg := "repository could not be read"
	if errors.Is(err, ErrNotFound) {
		msg = "repository not found"
	}
	return RepoFailure{Repo: name, Error: msg, Cause: err}
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
	flight := name + "\x00" + key
	for {
		s.cacheMu.Lock()
		if cached, ok := s.cache[name]; ok && cached.key == key {
			s.cacheMu.Unlock()
			return cached.sum, nil
		}
		call, waiting := s.calls[flight]
		if !waiting {
			call = &summaryCall{done: make(chan struct{})}
			s.calls[flight] = call
		}
		s.cacheMu.Unlock()
		if !waiting {
			call.sum, call.err = repo.summarize(ctx, end)
			s.cacheMu.Lock()
			if call.err == nil {
				s.cache[name] = cachedSummary{key: key, sum: call.sum}
			}
			delete(s.calls, flight)
			s.cacheMu.Unlock()
			close(call.done)
			return call.sum, call.err
		}
		select {
		case <-call.done:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		// a leader whose own request went away fails for that reason alone, so try again
		if call.err != nil && isContextErr(call.err) && ctx.Err() == nil {
			continue
		}
		return call.sum, call.err
	}
}

func isContextErr(err error) bool {
	return errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded)
}

// each runs fn for every index up to n on the store's shared summary workers,
// so requests and background warming together never run more than summaryWorkers at once.
func (s *CLIStore) each(ctx context.Context, n int, fn func(i int)) error {
	var wg sync.WaitGroup
	defer wg.Wait()
	for i := range n {
		select {
		case s.workers <- struct{}{}:
		case <-ctx.Done():
			return ctx.Err()
		}
		wg.Go(func() {
			defer func() { <-s.workers }()
			fn(i)
		})
	}
	return nil
}

func activityEnd(now time.Time) time.Time {
	return now.UTC().Truncate(24 * time.Hour).Add(24 * time.Hour)
}

// Fingerprint stats the refs and description of the repository called name.
func (s *CLIStore) Fingerprint(ctx context.Context, name string) (string, error) {
	repo, err := s.open(ctx, name)
	if err != nil {
		return "", err
	}
	key, err := fingerprint(repo.dir)
	if err != nil {
		return "", fmt.Errorf("failed to fingerprint repository %q: %w", name, err)
	}
	return key, nil
}

// ListFingerprint combines the fingerprints of every served repository with the day
// the weekly activity buckets end on, since a listing changes with either.
func (s *CLIStore) ListFingerprint(ctx context.Context) (string, error) {
	locs, names, err := s.located(ctx)
	if err != nil {
		return "", err
	}
	h := fnv.New64a()
	fmt.Fprintf(h, "%s\x00", activityEnd(s.cfg.Now()).Format(time.DateOnly))
	for _, name := range names {
		loc := locs[name]
		key, err := fingerprint(loc.GitDir)
		if err != nil {
			// an unreadable repository is listed with an error, so it tags the listing the same way
			key = "unreadable"
		}
		fmt.Fprintf(h, "%s\x00%s\x00%t\x00%s\x00", name, loc.GitDir, loc.WorkTree, key)
	}
	return strconv.FormatUint(h.Sum64(), 16), nil
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
	walk := func(path string, d fs.DirEntry, err error) error {
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
	}
	// a reftable repository keeps its refs under reftable/ and leaves refs/ as a stub
	for _, sub := range []string{"refs", "reftable"} {
		if err := filepath.WalkDir(filepath.Join(dir, sub), walk); err != nil {
			return "", fmt.Errorf("failed to walk %s: %w", sub, err)
		}
	}
	return strconv.FormatUint(h.Sum64(), 16), nil
}

const summaryRefFormat = "%(refname)%00%(objectname)%00%(*objectname)%00%(creatordate:iso-strict)%00%(contents:subject)"

func (r *cliRepo) summarize(ctx context.Context, end time.Time) (*repoSummary, error) {
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
	var all []ActivityTag
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
			all = append(all, ActivityTag{Repo: r.name, Name: name, Commit: commit, TaggedAt: when})
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
	sum.releases = buildReleases(all)
	sum.tip = tip
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
		sum.commits = append(sum.commits, activityCommit(r.name, info.DefaultBranch, c))
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
