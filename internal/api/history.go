package api

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/toaweme/http/server"

	"github.com/toaweme/codeview/internal/git"
)

const maxCachedHistograms = 256

func parseDate(name, s string, endOfDay bool) (time.Time, error) {
	if s == "" {
		return time.Time{}, nil
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, nil
	}
	t, err := time.Parse(time.DateOnly, s)
	if err != nil {
		return time.Time{}, fmt.Errorf(
			"%s %q is not an RFC3339 time or a YYYY-MM-DD date: %w",
			name,
			s,
			git.ErrInvalidArgument,
		)
	}
	if endOfDay {
		t = t.AddDate(0, 0, 1).Add(-time.Second)
	}
	return t, nil
}

func parseFilter(q url.Values) (git.LogFilter, error) {
	since, err := parseDate("since", q.Get("since"), false)
	if err != nil {
		return git.LogFilter{}, err
	}
	until, err := parseDate("until", q.Get("until"), true)
	if err != nil {
		return git.LogFilter{}, err
	}
	f := git.LogFilter{
		Since:     since,
		Until:     until,
		DateField: git.DateField(q.Get("dateField")),
		Author:    strings.TrimSpace(q.Get("author")),
		Grep:      strings.TrimSpace(q.Get("grep")),
	}
	switch f.DateField {
	case "":
		f.DateField = git.DateAuthor
	case git.DateAuthor, git.DateCommitter:
	default:
		return git.LogFilter{}, fmt.Errorf(
			"date field %q is not author or committer: %w",
			f.DateField,
			git.ErrInvalidArgument,
		)
	}
	if !since.IsZero() && !until.IsZero() && until.Before(since) {
		return git.LogFilter{}, fmt.Errorf(
			"date range %q to %q ends before it starts: %w",
			q.Get("since"),
			q.Get("until"),
			git.ErrInvalidArgument,
		)
	}
	return f, nil
}

// filterKey stops a cursor from being reused under different filters.
func filterKey(path string, f git.LogFilter) string {
	var since, until int64
	if !f.Since.IsZero() {
		since = f.Since.Unix()
	}
	if !f.Until.IsZero() {
		until = f.Until.Unix()
	}
	fields := fmt.Appendf(
		nil,
		"%s\x00%d\x00%d\x00%s\x00%s\x00%s",
		path,
		since,
		until,
		f.DateField,
		f.Author,
		f.Grep,
	)
	sum := sha256.Sum256(fields)
	return hex.EncodeToString(sum[:4])
}

// logCursor pins pages to the first page's commit so they hold while the branch moves.
type logCursor struct {
	start string
	skip  int
	key   string
}

func (c logCursor) String() string {
	return c.start + "." + strconv.Itoa(c.skip) + "." + c.key
}

func parseCursor(cursor string) (logCursor, error) {
	parts := strings.Split(cursor, ".")
	if len(parts) != 3 {
		return logCursor{}, fmt.Errorf("cursor %q is malformed: %w", cursor, git.ErrInvalidArgument)
	}
	skip, err := strconv.Atoi(parts[1])
	if err != nil || skip < 0 || parts[0] == "" {
		return logCursor{}, fmt.Errorf("cursor %q is malformed: %w", cursor, git.ErrInvalidArgument)
	}
	return logCursor{start: parts[0], skip: skip, key: parts[2]}, nil
}

func (h *handler) log(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit := defaultLogLimit
	if s := q.Get("limit"); s != "" {
		n, err := strconv.Atoi(s)
		if err != nil || n <= 0 {
			h.fail(
				w,
				r,
				fmt.Errorf("limit %q is not a positive number: %w", s, git.ErrInvalidArgument),
			)
			return
		}
		limit = min(n, maxLogLimit)
	}
	filter, err := parseFilter(q)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	key := filterKey(q.Get("path"), filter)
	var (
		res  resolved
		skip int
	)
	if raw := q.Get("cursor"); raw != "" {
		cursor, err := parseCursor(raw)
		if err != nil {
			h.fail(w, r, err)
			return
		}
		if cursor.key != key {
			h.fail(
				w,
				r,
				fmt.Errorf("cursor %q belongs to other filters: %w", raw, git.ErrInvalidArgument),
			)
			return
		}
		repo, err := h.openRepo(r)
		if err != nil {
			h.fail(w, r, err)
			return
		}
		commit, err := repo.Resolve(r.Context(), cursor.start)
		if err != nil {
			h.fail(w, r, fmt.Errorf("failed to resolve cursor %q: %w", raw, err))
			return
		}
		res = resolved{repo: repo, ref: cursor.start, commit: commit}
		skip = cursor.skip
	} else if res, err = h.resolve(r); err != nil {
		h.fail(w, r, err)
		return
	}
	query := git.LogQuery{
		Commit: res.commit,
		Path:   q.Get("path"),
		Filter: filter,
		Skip:   skip,
		Limit:  limit + 1,
	}
	history, err := res.repo.Log(r.Context(), query)
	if err != nil {
		h.fail(w, r, fmt.Errorf("failed to read the history of %q: %w", res.ref, err))
		return
	}
	resp := logResponse{Commits: history.Commits, Partial: history.Partial}
	if len(history.Commits) > limit {
		resp.Commits = history.Commits[:limit]
		resp.Next = logCursor{start: res.commit, skip: skip + limit, key: key}.String()
	}
	server.WriteJSON(w, http.StatusOK, resp)
}

func (h *handler) histogram(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	filter, err := parseFilter(q)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	bucket := git.Bucket(q.Get("bucket"))
	if bucket == "" {
		bucket = git.BucketWeek
	}
	res, err := h.resolve(r)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	path := q.Get("path")
	keyParts := []string{
		res.repo.Name(),
		res.commit,
		path,
		string(bucket),
		string(filter.DateField),
		q.Get("since"),
		q.Get("until"),
	}
	key := strings.Join(keyParts, "\x00")
	if hist, ok := h.histograms.get(key); ok {
		server.WriteJSON(w, http.StatusOK, hist)
		return
	}
	times, err := res.repo.CommitTimes(r.Context(), res.commit, path, filter.DateField)
	if err != nil {
		h.fail(w, r, fmt.Errorf("failed to read the commit dates of %q: %w", res.ref, err))
		return
	}
	hist, err := git.BuildHistogram(
		times,
		git.HistogramQuery{Bucket: bucket, Since: filter.Since, Until: filter.Until},
	)
	if err != nil {
		h.fail(w, r, fmt.Errorf("failed to count the commits of %q: %w", res.ref, err))
		return
	}
	h.histograms.put(key, hist)
	server.WriteJSON(w, http.StatusOK, hist)
}

type histogramCache struct {
	mu      sync.Mutex
	entries map[string]git.Histogram
}

func newHistogramCache() *histogramCache {
	return &histogramCache{entries: map[string]git.Histogram{}}
}

func (c *histogramCache) get(key string) (git.Histogram, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	hist, ok := c.entries[key]
	return hist, ok
}

func (c *histogramCache) put(key string, hist git.Histogram) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.entries) >= maxCachedHistograms {
		clear(c.entries)
	}
	c.entries[key] = hist
}
