package git_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/toaweme/codeview/internal/git"
	"github.com/toaweme/codeview/internal/git/gittest"
)

func openHistory(t *testing.T) (gittest.History, git.Repo) {
	t.Helper()
	h := gittest.NewHistory(t)
	store := git.NewCLIStore(git.Config{Root: h.Root})
	t.Cleanup(func() { _ = store.Close() })
	repo, err := store.Open(context.Background(), h.Name)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	return h, repo
}

func utc(s string) time.Time {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		panic(err)
	}
	return t
}

func Test_CLIRepo_LogFilter(t *testing.T) {
	h, repo := openHistory(t)
	january := git.LogFilter{Since: utc("2025-01-15T23:30:00Z"), Until: utc("2025-01-31T23:59:59Z")}
	february := git.LogFilter{
		Since: utc("2025-02-01T00:00:00Z"),
		Until: utc("2025-02-28T23:59:59Z"),
	}
	with := func(f git.LogFilter, field git.DateField) git.LogFilter {
		f.DateField = field
		return f
	}
	tests := []struct {
		name   string
		filter git.LogFilter
		path   string
		skip   int
		limit  int
		want   []string
	}{
		{
			name:   "no filter",
			filter: git.LogFilter{},
			want:   []string{h.Typo, h.Rebased, h.Docs, h.Parser, h.Initial},
		},
		{
			name:   "author dates with inclusive bounds",
			filter: with(january, git.DateAuthor),
			want:   []string{h.Rebased, h.Docs, h.Parser},
		},
		{
			name:   "author date is the default",
			filter: january,
			want:   []string{h.Rebased, h.Docs, h.Parser},
		},
		{
			name:   "committer dates with inclusive bounds",
			filter: with(january, git.DateCommitter),
			want:   []string{h.Docs, h.Parser},
		},
		{
			name:   "rebased commit by committer date",
			filter: with(february, git.DateCommitter),
			want:   []string{h.Rebased},
		},
		{
			name:   "rebased commit not by author date",
			filter: with(february, git.DateAuthor),
			want:   []string{},
		},
		{
			name: "bound one second past",
			filter: git.LogFilter{
				Since: utc("2025-02-01T00:00:00Z"),
				Until: utc("2025-03-05T07:59:59Z"),
			},
			want: []string{},
		},
		{
			name:   "offset date",
			filter: git.LogFilter{Since: utc("2025-03-05T08:00:00Z")},
			want:   []string{h.Typo},
		},
		{
			name:   "open lower bound",
			filter: git.LogFilter{Until: utc("2025-01-15T23:29:59Z")},
			want:   []string{h.Initial},
		},
		{
			name:   "author by name ignoring case",
			filter: git.LogFilter{Author: "bob"},
			want:   []string{h.Rebased, h.Parser},
		},
		{
			name:   "author by email",
			filter: git.LogFilter{Author: "BUILDER.dev"},
			want:   []string{h.Rebased, h.Parser},
		},
		{
			name:   "author is not a pattern",
			filter: git.LogFilter{Author: "a.a"},
			want:   []string{},
		},
		{
			name:   "grep ignoring case",
			filter: git.LogFilter{Grep: "FIX"},
			want:   []string{h.Typo, h.Parser},
		},
		{
			name:   "grep is not a pattern",
			filter: git.LogFilter{Grep: "(v2.0)"},
			want:   []string{h.Docs},
		},
		{
			name:   "author and grep",
			filter: git.LogFilter{Author: "bob", Grep: "fix"},
			want:   []string{h.Parser},
		},
		{
			name:   "author dates and path",
			filter: git.LogFilter{Since: utc("2025-01-01T00:00:00Z")},
			path:   "docs/guide.md",
			want:   []string{h.Typo, h.Docs},
		},
		{
			name:   "author dates paged",
			filter: git.LogFilter{Since: utc("2025-01-01T00:00:00Z")},
			skip:   1,
			limit:  2,
			want:   []string{h.Rebased, h.Docs},
		},
		{
			name:   "committer dates paged",
			filter: with(git.LogFilter{Since: utc("2025-01-01T00:00:00Z")}, git.DateCommitter),
			skip:   1,
			limit:  2,
			want:   []string{h.Rebased, h.Docs},
		},
		{
			name:   "author dates past the end",
			filter: git.LogFilter{Since: utc("2025-01-01T00:00:00Z")},
			skip:   5,
			limit:  2,
			want:   []string{},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := repo.Log(
				context.Background(),
				git.LogQuery{
					Commit: h.Typo,
					Path:   tt.path,
					Filter: tt.filter,
					Skip:   tt.skip,
					Limit:  tt.limit,
				},
			)
			if err != nil {
				t.Fatalf("log: %v", err)
			}
			hashes := []string{}
			for _, c := range got.Commits {
				hashes = append(hashes, c.Hash)
			}
			if strings.Join(hashes, ",") != strings.Join(tt.want, ",") {
				t.Fatalf("log = %v, want %v", hashes, tt.want)
			}
			if got.Partial {
				t.Fatal("log is partial")
			}
		})
	}
}

func Test_CLIRepo_LogFilterPartial(t *testing.T) {
	h, repo := openHistory(t)
	since := git.LogFilter{Since: utc("2025-01-01T00:00:00Z"), Until: utc("2025-01-31T23:59:59Z")}
	tests := []struct {
		name    string
		maxScan int
		want    []string
		partial bool
	}{
		// the scan reads Typo and Rebased, and Typo is outside the range
		{"cap hit", 2, []string{h.Rebased}, true},
		{"cap on the last commit", 5, []string{h.Rebased, h.Docs, h.Parser, h.Initial}, false},
		{"cap not hit", 0, []string{h.Rebased, h.Docs, h.Parser, h.Initial}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := repo.Log(
				context.Background(),
				git.LogQuery{Commit: h.Typo, Filter: since, MaxScan: tt.maxScan},
			)
			if err != nil {
				t.Fatalf("log: %v", err)
			}
			hashes := []string{}
			for _, c := range got.Commits {
				hashes = append(hashes, c.Hash)
			}
			if strings.Join(hashes, ",") != strings.Join(tt.want, ",") ||
				got.Partial != tt.partial {
				t.Fatalf(
					"log = %v partial %v, want %v partial %v",
					hashes,
					got.Partial,
					tt.want,
					tt.partial,
				)
			}
		})
	}
}

func Test_CLIRepo_LogFilterInvalid(t *testing.T) {
	h, repo := openHistory(t)
	tests := []struct {
		name   string
		filter git.LogFilter
	}{
		{
			name:   "unknown date field",
			filter: git.LogFilter{DateField: "tagger"},
		},
		{
			name: "reversed range",
			filter: git.LogFilter{
				Since: utc("2025-02-01T00:00:00Z"),
				Until: utc("2025-01-01T00:00:00Z"),
			},
		},
		{
			name:   "newline in author",
			filter: git.LogFilter{Author: "a\nb"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := repo.Log(
				context.Background(),
				git.LogQuery{Commit: h.Typo, Filter: tt.filter},
			)
			if !errors.Is(err, git.ErrInvalidArgument) {
				t.Fatalf("error = %v, want ErrInvalidArgument", err)
			}
		})
	}
}

func Test_CLIRepo_CommitTimes(t *testing.T) {
	h, repo := openHistory(t)
	tests := []struct {
		field git.DateField
		want  string
	}{
		{
			field: git.DateAuthor,
			want:  "2025-03-05T08:00:00Z,2025-01-20T12:00:00Z,2025-01-31T23:59:59Z,2025-01-15T23:30:00Z,2025-01-01T09:00:00Z",
		},
		{
			field: git.DateCommitter,
			want:  "2025-03-05T08:00:00Z,2025-02-10T08:00:00Z,2025-01-31T23:59:59Z,2025-01-15T23:30:00Z,2025-01-01T09:00:00Z",
		},
	}
	for _, tt := range tests {
		t.Run(string(tt.field), func(t *testing.T) {
			times, err := repo.CommitTimes(context.Background(), h.Typo, "", tt.field)
			if err != nil {
				t.Fatalf("commit times: %v", err)
			}
			got := []string{}
			for _, ts := range times {
				got = append(got, ts.Format(time.RFC3339))
			}
			if strings.Join(got, ",") != tt.want {
				t.Fatalf("times = %v, want %s", got, tt.want)
			}
		})
	}
}

func Test_CLIRepo_Log(t *testing.T) {
	f, repo := open(t)
	tests := []struct {
		name  string
		query git.LogQuery
		want  []string
	}{
		{"all", git.LogQuery{Commit: f.Feature}, []string{f.Feature, f.Third, f.Second, f.Initial}},
		{"page", git.LogQuery{Commit: f.Feature, Skip: 1, Limit: 2}, []string{f.Third, f.Second}},
		{"follows rename", git.LogQuery{Commit: f.Third, Path: "docs/b.txt"}, []string{f.Third, f.Initial}},
		{"directory", git.LogQuery{Commit: f.Feature, Path: "src"}, []string{f.Feature, f.Initial}},
		{"exclude", git.LogQuery{Commit: f.Feature, Exclude: f.Second}, []string{f.Feature, f.Third}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			history, err := repo.Log(context.Background(), tt.query)
			commits := history.Commits
			if err != nil {
				t.Fatalf("log: %v", err)
			}
			if len(commits) != len(tt.want) {
				t.Fatalf("got %d commits, want %d", len(commits), len(tt.want))
			}
			for i, c := range commits {
				if c.Hash != tt.want[i] {
					t.Fatalf("commit %d = %s, want %s", i, c.Hash, tt.want[i])
				}
			}
		})
	}
	c, err := repo.Commit(context.Background(), f.Initial[:10])
	if err != nil {
		t.Fatalf("commit: %v", err)
	}
	if c.Hash != f.Initial ||
		c.Subject != "initial commit" ||
		c.Body != "with a body line" ||
		len(c.Parents) != 0 ||
		c.Author.Name != "Ada Lovelace" ||
		c.Committer.Email != "charles@example.com" ||
		c.Author.Date.Format("2006-01-02T15:04:05Z07:00") != "2026-01-02T10:00:00+02:00" {
		t.Fatalf("commit = %+v", c)
	}
	if _, err := repo.Commit(context.Background(), "deadbeef"); !errors.Is(err, git.ErrNotFound) {
		t.Fatalf("missing commit error = %v", err)
	}
}
