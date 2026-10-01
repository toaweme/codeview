package git

import (
	"cmp"
	"context"
	"encoding/base64"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"
)

// feedCursor is the last item of a page. Pages order items by time, newest first,
// then by repository name, then by each repository's own order,
// so the cursor holds without the server keeping any state per reader.
type feedCursor struct {
	at   time.Time
	repo string
	key  string
	set  bool
}

func (c feedCursor) String() string {
	raw := strconv.FormatInt(c.at.UnixNano(), 10) + "\x00" + c.repo + "\x00" + c.key
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func parseFeedCursor(s string) (feedCursor, error) {
	if s == "" {
		return feedCursor{}, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return feedCursor{}, fmt.Errorf("cursor %q is malformed: %w", s, ErrInvalidArgument)
	}
	parts := strings.Split(string(raw), "\x00")
	if len(parts) != 3 || parts[1] == "" || parts[2] == "" {
		return feedCursor{}, fmt.Errorf("cursor %q is malformed: %w", s, ErrInvalidArgument)
	}
	nano, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return feedCursor{}, fmt.Errorf("cursor %q is malformed: %w", s, ErrInvalidArgument)
	}
	return feedCursor{at: time.Unix(0, nano), repo: parts[1], key: parts[2], set: true}, nil
}

// after returns a filter that must see one repository's items in that repository's order,
// since among items sharing the cursor's time and repository only those past its key come after it.
func (c feedCursor) after(repo string) func(at time.Time, key string) bool {
	passed := false
	return func(at time.Time, key string) bool {
		switch {
		case !c.set || at.Before(c.at):
			return true
		case at.After(c.at):
			return false
		case repo != c.repo:
			return repo > c.repo
		case passed:
			return true
		}
		passed = key == c.key
		return false
	}
}

type feedItem[T any] struct {
	at    time.Time
	repo  string
	key   string
	index int
	value T
}

// mergeFeed orders items the way feedCursor expects and cuts the page,
// returning the cursor of its last item when more follow.
func mergeFeed[T any](items []feedItem[T], limit int) ([]feedItem[T], string) {
	slices.SortStableFunc(items, func(a, b feedItem[T]) int {
		if c := b.at.Compare(a.at); c != 0 {
			return c
		}
		if c := strings.Compare(a.repo, b.repo); c != 0 {
			return c
		}
		return cmp.Compare(a.index, b.index)
	})
	if len(items) <= limit {
		return items, ""
	}
	last := items[limit-1]
	return items[:limit], feedCursor{at: last.at, repo: last.repo, key: last.key, set: true}.String()
}

func feedLimit(n int) int {
	if n <= 0 {
		return DefaultFeedLimit
	}
	return min(n, MaxFeedLimit)
}

// selected returns the served repositories under org, narrowed to repos when it is not empty.
func (s *CLIStore) selected(ctx context.Context, org string, repos []string) ([]string, error) {
	_, names, err := s.located(ctx)
	if err != nil {
		return nil, err
	}
	org = strings.Trim(org, "/")
	wanted := map[string]bool{}
	for _, r := range repos {
		if r = strings.Trim(r, "/"); r != "" {
			wanted[r] = true
		}
	}
	if org == "" && len(wanted) == 0 {
		return names, nil
	}
	kept := []string{}
	for _, name := range names {
		if (org == "" || strings.HasPrefix(name, org+"/")) && (len(wanted) == 0 || wanted[name]) {
			kept = append(kept, name)
		}
	}
	return kept, nil
}

// feedScanCap bounds the commits an author or message filter reads per repository and page,
// and feedScanChunk is how many it asks git for at a time.
const (
	feedScanCap   = 2000
	feedScanChunk = 250
)

// repoPage is one repository's share of a commit page. A non-nil stop marks a filter scan
// that hit feedScanCap at that commit, so nothing older than it is known yet.
type repoPage struct {
	commits []ActivityCommit
	stop    *feedCursor
	scanned int
}

// Commits merges the default-branch history of the repositories q selects, newest first.
// Unfiltered pages read each repository's cached recent commits and ask git only for older history.
// Filtered pages always walk git, matching in Go so the scan can be bounded.
// A repository that cannot be read is reported in Failed and skipped,
// and it resumes at the cursor once it reads again.
func (s *CLIStore) Commits(ctx context.Context, q FeedQuery) (CommitFeed, error) {
	cur, err := parseFeedCursor(q.Cursor)
	if err != nil {
		return CommitFeed{}, err
	}
	names, err := s.selected(ctx, q.Org, q.Repos)
	if err != nil {
		return CommitFeed{}, err
	}
	limit := feedLimit(q.Limit)
	end := activityEnd(s.cfg.Now())
	match := commitMatcher(q.Author, q.Message)
	pages := make([]repoPage, len(names))
	errs := make([]error, len(names))
	err = s.each(ctx, len(names), func(i int) {
		// one more than the page shows tells whether another page follows
		pages[i], errs[i] = s.repoCommits(ctx, names[i], cur, q.Since, match, limit+1, end)
	})
	if err == nil {
		err = ctx.Err()
	}
	if err != nil {
		return CommitFeed{}, fmt.Errorf("failed to read recent history: %w", err)
	}
	feed := CommitFeed{Commits: []ActivityCommit{}, Failed: []RepoFailure{}}
	var items []feedItem[ActivityCommit]
	var stop *feedCursor
	for i, page := range pages {
		if errs[i] != nil {
			feed.Failed = append(feed.Failed, repoFailure(names[i], fmt.Errorf("failed to read the history of %q: %w", names[i], errs[i])))
			continue
		}
		feed.Scanned += page.scanned
		for j, c := range page.commits {
			items = append(items, feedItem[ActivityCommit]{at: c.CommittedAt, repo: names[i], key: c.Hash, index: j, value: c})
		}
		if page.stop != nil && (stop == nil || page.stop.before(*stop)) {
			stop = page.stop
		}
	}
	if stop != nil {
		// nothing past the earliest unfinished scan is known to be complete
		kept := items[:0]
		for _, it := range items {
			if it.at.After(stop.at) || (it.at.Equal(stop.at) && it.repo <= stop.repo) {
				kept = append(kept, it)
			}
		}
		items = kept
	}
	page, next := mergeFeed(items, limit)
	if next == "" && stop != nil {
		next, feed.Partial = stop.String(), true
	}
	feed.Next = next
	for _, it := range page {
		feed.Commits = append(feed.Commits, it.value)
	}
	return feed, nil
}

// before reports whether c comes earlier in feed order than o.
func (c feedCursor) before(o feedCursor) bool {
	if !c.at.Equal(o.at) {
		return c.at.After(o.at)
	}
	return c.repo < o.repo
}

// commitMatcher returns nil when neither filter is set. It follows git's --author and --grep
// with --regexp-ignore-case and --fixed-strings, the author against "name <email>"
// and the message against the subject and body.
func commitMatcher(author, message string) func(Commit) bool {
	author = strings.ToLower(strings.TrimSpace(author))
	message = strings.ToLower(strings.TrimSpace(message))
	if author == "" && message == "" {
		return nil
	}
	return func(c Commit) bool {
		who := strings.ToLower(c.Author.Name + " <" + c.Author.Email + ">")
		what := strings.ToLower(c.Subject + "\n\n" + c.Body)
		return strings.Contains(who, author) && strings.Contains(what, message)
	}
}

// repoCommits returns up to want commits of one repository past cur, in walk order.
// Commits dated after a descendant, which clock skew causes, can fall between pages.
func (s *CLIStore) repoCommits(
	ctx context.Context,
	name string,
	cur feedCursor,
	since time.Time,
	match func(Commit) bool,
	want int,
	end time.Time,
) (repoPage, error) {
	sum, err := s.summary(ctx, name, end)
	if err != nil {
		return repoPage{}, err
	}
	if sum.tip == "" {
		return repoPage{}, nil
	}
	if match == nil {
		keep := cur.after(name)
		out := []ActivityCommit{}
		for i, c := range sum.commits {
			if !since.IsZero() && c.CommittedAt.Before(since) {
				continue
			}
			if keep(c.CommittedAt, c.Hash) {
				out = append(out, c)
				if len(out) == want {
					return repoPage{commits: out, scanned: i + 1}, nil
				}
			}
		}
		// a cached prefix shorter than the cap already holds the whole history
		if len(sum.commits) < MaxActivityLimit {
			return repoPage{commits: out, scanned: len(sum.commits)}, nil
		}
	}
	repo, err := s.open(ctx, name)
	if err != nil {
		return repoPage{}, err
	}
	filter := LogFilter{Since: since, DateField: DateCommitter}
	if cur.set {
		filter.Until = cur.at
	}
	keep := cur.after(name)
	page := repoPage{commits: []ActivityCommit{}}
	chunk, scanned := want, 0
	if match != nil {
		chunk = feedScanChunk
	}
	var last Commit
	for match == nil || scanned < feedScanCap {
		h, err := repo.Log(ctx, LogQuery{Commit: sum.tip, Filter: filter, Skip: scanned, Limit: chunk})
		if err != nil {
			return repoPage{}, fmt.Errorf("failed to read older history: %w", err)
		}
		for _, c := range h.Commits {
			scanned++
			last = c
			// keep must see every commit, matching or not, to find the cursor's key
			if !keep(c.Committer.Date, c.Hash) || (match != nil && !match(c)) {
				continue
			}
			page.commits = append(page.commits, activityCommit(name, sum.summary.DefaultBranch, c))
			if len(page.commits) == want {
				page.scanned = scanned
				return page, nil
			}
		}
		if len(h.Commits) < chunk {
			page.scanned = scanned
			return page, nil
		}
	}
	page.scanned = scanned
	page.stop = &feedCursor{at: last.Committer.Date, repo: name, key: last.Hash, set: true}
	return page, nil
}

func activityCommit(repo, ref string, c Commit) ActivityCommit {
	return ActivityCommit{
		Repo:        repo,
		Hash:        c.Hash,
		Subject:     c.Subject,
		Author:      c.Author,
		CommittedAt: c.Committer.Date,
		Ref:         ref,
	}
}
