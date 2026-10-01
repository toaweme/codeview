package git

import (
	"context"
	"regexp"
	"slices"
	"strconv"
	"strings"
)

// versionTag matches the UI's version pattern, an optional module path then the version.
var versionTag = regexp.MustCompile(`^(?:(.+)/)?(v?\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.+-]+)?)$`)

type release struct {
	ActivityTag
	prefix  string
	version string
	// isVersion marks a tag named like a version.
	isVersion bool
}

func newRelease(tag ActivityTag) release {
	r := release{ActivityTag: tag, version: tag.Name}
	if m := versionTag.FindStringSubmatch(tag.Name); m != nil {
		r.prefix, r.version, r.isVersion = m[1], m[2], true
	}
	return r
}

// compareVersions orders a before b when it is the higher version, and a release before its prereleases.
func compareVersions(a, b string) int {
	parse := func(v string) ([]int, bool) {
		core := strings.TrimPrefix(v, "v")
		suffixed := false
		if i := strings.IndexAny(core, "-+"); i >= 0 {
			core, suffixed = core[:i], true
		}
		var nums []int
		for part := range strings.SplitSeq(core, ".") {
			n, _ := strconv.Atoi(part)
			nums = append(nums, n)
		}
		return nums, suffixed
	}
	x, xPre := parse(a)
	y, yPre := parse(b)
	for i := range max(len(x), len(y)) {
		var xi, yi int
		if i < len(x) {
			xi = x[i]
		}
		if i < len(y) {
			yi = y[i]
		}
		if d := yi - xi; d != 0 {
			return d
		}
	}
	switch {
	case xPre && !yPre:
		return 1
	case !xPre && yPre:
		return -1
	}
	return 0
}

// buildReleases sorts tags newest first and links each to the one before it on its track,
// the versions under one module path or every other tag.
func buildReleases(tags []ActivityTag) []release {
	list := make([]release, len(tags))
	for i, t := range tags {
		list[i] = newRelease(t)
	}
	slices.SortStableFunc(list, func(a, b release) int {
		if c := b.TaggedAt.Compare(a.TaggedAt); c != 0 {
			return c
		}
		if a.isVersion && b.isVersion && a.prefix == b.prefix {
			if c := compareVersions(a.version, b.version); c != 0 {
				return c
			}
		}
		return strings.Compare(a.Name, b.Name)
	})
	older := map[string]string{}
	for i := len(list) - 1; i >= 0; i-- {
		track := "other"
		if list[i].isVersion {
			track = "v:" + list[i].prefix
		}
		list[i].Previous = older[track]
		older[track] = list[i].Name
	}
	return list
}

// Releases merges the tags of the repositories q selects, newest first.
// Every page reads each repository's cached tag list, so it asks git nothing while refs stay put.
func (s *CLIStore) Releases(ctx context.Context, q FeedQuery) (ReleaseFeed, error) {
	cur, err := parseFeedCursor(q.Cursor)
	if err != nil {
		return ReleaseFeed{}, err
	}
	names, err := s.selected(ctx, q.Org, q.Repos)
	if err != nil {
		return ReleaseFeed{}, err
	}
	sums, failed, err := s.summaries(ctx, names)
	if err != nil {
		return ReleaseFeed{}, err
	}
	limit := feedLimit(q.Limit)
	feed := ReleaseFeed{Releases: []ActivityTag{}, Failed: failed}
	var items []feedItem[ActivityTag]
	for i, sum := range sums {
		if sum == nil {
			continue
		}
		taken := 0
		for _, r := range sum.releases {
			feed.Total++
			if r.isVersion {
				feed.Versions++
			}
		}
		keep := cur.after(names[i])
		for _, r := range sum.releases {
			if taken > limit {
				break
			}
			if q.Versions && !r.isVersion {
				continue
			}
			if !keep(r.TaggedAt, r.Name) {
				continue
			}
			items = append(items, feedItem[ActivityTag]{at: r.TaggedAt, repo: names[i], key: r.Name, index: taken, value: r.ActivityTag})
			taken++
		}
	}
	page, next := mergeFeed(items, limit)
	for _, it := range page {
		feed.Releases = append(feed.Releases, it.value)
	}
	feed.Next = next
	return feed, nil
}
