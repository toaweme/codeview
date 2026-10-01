package git_test

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/toaweme/codeview/internal/git"
	"github.com/toaweme/codeview/internal/git/gittest"
	"github.com/toaweme/codeview/internal/scan"
)

// deepRepo writes a linear main branch of n commits through fast-import,
// giving commits 2k and 2k+1 the same committer time so pages must split ties.
func deepRepo(t *testing.T, dir string, n int, base int64) {
	t.Helper()
	deepRepoWith(t, dir, n, base, func(i int) string { return fmt.Sprintf("commit %d", i) })
}

func deepRepoWith(t *testing.T, dir string, n int, base int64, message func(i int) string) {
	t.Helper()
	gittest.Init(t, dir, true, "")
	var stream strings.Builder
	for i := 1; i <= n; i++ {
		msg := message(i)
		fmt.Fprintf(&stream, "commit refs/heads/main\nmark :%d\n", i)
		fmt.Fprintf(&stream, "committer Ada <ada@example.com> %d +0000\n", base+int64(i/2)*60)
		fmt.Fprintf(&stream, "data %d\n%s\n", len(msg), msg)
		if i > 1 {
			fmt.Fprintf(&stream, "from :%d\n", i-1)
		}
	}
	cmd := exec.CommandContext(t.Context(), "git", "--git-dir="+dir, "fast-import", "--quiet")
	cmd.Env = append(os.Environ(), "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL="+os.DevNull)
	cmd.Stdin = strings.NewReader(stream.String())
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("fast-import: %v\n%s", err, out)
	}
}

func Test_CLIStore_Commits_DeepHistory(t *testing.T) {
	root := t.TempDir()
	base := time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC).Unix()
	// more commits than the summary caches, so later pages ask git
	deepRepo(t, filepath.Join(root, "deep", "a.git"), 70, base)
	deepRepo(t, filepath.Join(root, "deep", "b.git"), 64, base)
	store := git.NewCLIStore(git.Config{Locator: scan.New(scan.Config{Dir: root}), Mode: git.ModeAll})
	t.Cleanup(func() { _ = store.Close() })
	ctx := context.Background()

	history := map[string][]git.Commit{}
	for _, name := range []string{"deep/a", "deep/b"} {
		repo, err := store.Open(ctx, name)
		if err != nil {
			t.Fatalf("open %s: %v", name, err)
		}
		tip, err := repo.Resolve(ctx, "main")
		if err != nil {
			t.Fatalf("resolve %s: %v", name, err)
		}
		h, err := repo.Log(ctx, git.LogQuery{Commit: tip, Limit: 500})
		if err != nil {
			t.Fatalf("log %s: %v", name, err)
		}
		history[name] = h.Commits
	}
	// newest first, repositories by name within a time, walk order within a repository
	var want []string
	for at := base + 35*60; at >= base; at -= 60 {
		for _, name := range []string{"deep/a", "deep/b"} {
			for _, c := range history[name] {
				if c.Committer.Date.Unix() == at {
					want = append(want, name+" "+c.Hash)
				}
			}
		}
	}
	if len(want) != 134 {
		t.Fatalf("expected 134 commits, built %d", len(want))
	}

	tests := []struct {
		name  string
		limit int
	}{
		{"one per page", 1},
		{"pages ending inside a tie", 7},
		{"pages wider than the cache", 100},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got []string
			q := git.FeedQuery{Limit: tt.limit}
			for range 200 {
				feed, err := store.Commits(ctx, q)
				if err != nil {
					t.Fatalf("commits: %v", err)
				}
				if len(feed.Commits) > tt.limit {
					t.Fatalf("page holds %d commits, limit %d", len(feed.Commits), tt.limit)
				}
				for _, c := range feed.Commits {
					got = append(got, c.Repo+" "+c.Hash)
				}
				if feed.Next == "" {
					break
				}
				q.Cursor = feed.Next
			}
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("got %d commits, want %d in order\ngot  %v\nwant %v", len(got), len(want), got, want)
			}
		})
	}
}

func Test_CLIStore_Fingerprint(t *testing.T) {
	f, store := summaryStore(t)
	ctx := context.Background()
	repo, err := store.Fingerprint(ctx, f.Name)
	if err != nil {
		t.Fatalf("fingerprint: %v", err)
	}
	list, err := store.ListFingerprint(ctx)
	if err != nil {
		t.Fatalf("list fingerprint: %v", err)
	}
	bare := filepath.Join(f.Root, "acme", "widgets.git")
	gittest.Run(t, bare, "--git-dir="+bare, "update-ref", "refs/heads/extra", f.Initial)
	tests := []struct {
		name   string
		before string
		read   func() (string, error)
	}{
		{"repository", repo, func() (string, error) { return store.Fingerprint(ctx, f.Name) }},
		{"listing", list, func() (string, error) { return store.ListFingerprint(ctx) }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			after, err := tt.read()
			if err != nil {
				t.Fatalf("fingerprint: %v", err)
			}
			if after == tt.before {
				t.Fatalf("fingerprint %q held after a new branch", after)
			}
			again, err := tt.read()
			if err != nil || again != after {
				t.Fatalf("fingerprint = %q, %v, want a stable %q", again, err, after)
			}
		})
	}
	if _, err := store.Fingerprint(ctx, "acme/nope"); err == nil {
		t.Fatal("fingerprint of a missing repository succeeded")
	}
}

// pageAll follows Next from q and returns every commit as "repo hash", with the Partial flag of each page.
func pageAll(ctx context.Context, t *testing.T, store *git.CLIStore, q git.FeedQuery) ([]string, []bool) {
	t.Helper()
	var got []string
	var partial []bool
	for range 500 {
		feed, err := store.Commits(ctx, q)
		if err != nil {
			t.Fatalf("commits: %v", err)
		}
		if len(feed.Commits) > feedLimitOf(q) {
			t.Fatalf("page holds %d commits, limit %d", len(feed.Commits), q.Limit)
		}
		for _, c := range feed.Commits {
			got = append(got, c.Repo+" "+c.Hash)
		}
		partial = append(partial, feed.Partial)
		if feed.Next == "" {
			return got, partial
		}
		q.Cursor = feed.Next
	}
	t.Fatal("the feed never reached its last page")
	return nil, nil
}

func feedLimitOf(q git.FeedQuery) int {
	if q.Limit <= 0 {
		return git.DefaultFeedLimit
	}
	return q.Limit
}

func Test_CLIStore_Commits_Filtered(t *testing.T) {
	root := t.TempDir()
	base := time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC).Unix()
	deepRepo(t, filepath.Join(root, "deep", "a.git"), 70, base)
	deepRepo(t, filepath.Join(root, "deep", "b.git"), 64, base)
	store := git.NewCLIStore(git.Config{Locator: scan.New(scan.Config{Dir: root}), Mode: git.ModeAll})
	t.Cleanup(func() { _ = store.Close() })
	all, _ := pageAll(t.Context(), t, store, git.FeedQuery{Limit: 100})
	subjects := map[string]string{}
	for _, name := range []string{"deep/a", "deep/b"} {
		repo, err := store.Open(context.Background(), name)
		if err != nil {
			t.Fatalf("open: %v", err)
		}
		tip, err := repo.Resolve(context.Background(), "")
		if err != nil {
			t.Fatalf("resolve: %v", err)
		}
		h, err := repo.Log(context.Background(), git.LogQuery{Commit: tip, Limit: 500})
		if err != nil {
			t.Fatalf("log: %v", err)
		}
		for _, c := range h.Commits {
			subjects[name+" "+c.Hash] = c.Subject
		}
	}
	matching := func(substr string) []string {
		var out []string
		for _, key := range all {
			if strings.Contains(subjects[key], substr) {
				out = append(out, key)
			}
		}
		return out
	}
	tests := []struct {
		name string
		q    git.FeedQuery
		want []string
	}{
		{"message across pages", git.FeedQuery{Message: "COMMIT 1", Limit: 3}, matching("commit 1")},
		{"message literal", git.FeedQuery{Message: "commit 6.", Limit: 5}, nil},
		{"author email", git.FeedQuery{Author: "ADA@example", Limit: 50}, all},
		{"author and message", git.FeedQuery{Author: "ada", Message: "commit 7", Limit: 4}, matching("commit 7")},
		{"nobody", git.FeedQuery{Author: "nobody"}, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, partial := pageAll(t.Context(), t, store, tt.q)
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("got %d commits, want %d\ngot  %v\nwant %v", len(got), len(tt.want), got, tt.want)
			}
			for i, p := range partial {
				if p {
					t.Fatalf("page %d reports a partial scan of a short history", i)
				}
			}
		})
	}
}

func Test_CLIStore_Commits_FilterScanCap(t *testing.T) {
	root := t.TempDir()
	base := time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC).Unix()
	// only the oldest commit matches, so the first page stops at the scan cap
	deepRepoWith(t, filepath.Join(root, "deep", "a.git"), 2600, base, func(i int) string {
		if i == 1 {
			return "the needle"
		}
		return fmt.Sprintf("hay %d", i)
	})
	store := git.NewCLIStore(git.Config{Locator: scan.New(scan.Config{Dir: root}), Mode: git.ModeAll})
	t.Cleanup(func() { _ = store.Close() })
	first, err := store.Commits(t.Context(), git.FeedQuery{Message: "needle"})
	if err != nil {
		t.Fatalf("commits: %v", err)
	}
	if first.Scanned != 2000 || len(first.Commits) != 0 || !first.Partial {
		t.Fatalf("first page scanned %d with %d commits partial %t, want 2000, 0, true", first.Scanned, len(first.Commits), first.Partial)
	}
	got, partial := pageAll(t.Context(), t, store, git.FeedQuery{Message: "needle"})
	if len(got) != 1 {
		t.Fatalf("got %v, want the one needle", got)
	}
	want := []bool{true, false}
	if !reflect.DeepEqual(partial, want) {
		t.Fatalf("partial pages = %v, want %v", partial, want)
	}
}

func Test_CLIStore_Feeds_SkipUnreadable(t *testing.T) {
	f := gittest.New(t)
	widgets := filepath.Join(f.Root, "acme", "widgets.git")
	gadgets := filepath.Join(f.Root, "acme", "gadgets.git")
	gittest.Run(t, f.Root, "clone", "-q", "--bare", widgets, gadgets)
	// garbled packed-refs keep the repository listed but fail every ref read
	packed := filepath.Join(gadgets, "packed-refs")
	refs, err := os.ReadFile(packed)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(packed, []byte("not a ref line\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	store := git.NewCLIStore(git.Config{Locator: scan.New(scan.Config{Dir: f.Root}), Mode: git.ModeAll})
	t.Cleanup(func() { _ = store.Close() })
	ctx := context.Background()
	w := "acme/widgets "

	read := []struct {
		name   string
		run    func() (any, []git.RepoFailure, error)
		want   any
		render func(any) any
	}{
		{
			name: "commits",
			run: func() (any, []git.RepoFailure, error) {
				feed, err := store.Commits(ctx, git.FeedQuery{})
				return feed.Commits, feed.Failed, err
			},
			want: []string{w + f.Third, w + f.Second, w + f.Initial},
			render: func(v any) any {
				var out []string
				for _, c := range v.([]git.ActivityCommit) {
					out = append(out, c.Repo+" "+c.Hash)
				}
				return out
			},
		},
		{
			name: "releases",
			run: func() (any, []git.RepoFailure, error) {
				feed, err := store.Releases(ctx, git.FeedQuery{})
				return feed.Releases, feed.Failed, err
			},
			want: []string{w + "light", w + "v1.0"},
			render: func(v any) any {
				var out []string
				for _, r := range v.([]git.ActivityTag) {
					out = append(out, r.Repo+" "+r.Name)
				}
				return out
			},
		},
		{
			name: "activity",
			run: func() (any, []git.RepoFailure, error) {
				act, err := store.Activity(ctx, git.ActivityQuery{})
				return act.Tags, act.Failed, err
			},
			want: []string{w + "light", w + "v1.0"},
			render: func(v any) any {
				var out []string
				for _, r := range v.([]git.ActivityTag) {
					out = append(out, r.Repo+" "+r.Name)
				}
				return out
			},
		},
	}
	for _, tt := range read {
		t.Run(tt.name, func(t *testing.T) {
			got, failed, err := tt.run()
			if err != nil {
				t.Fatalf("read: %v", err)
			}
			if !reflect.DeepEqual(tt.render(got), tt.want) {
				t.Fatalf("got %v, want %v", tt.render(got), tt.want)
			}
			if len(failed) != 1 || failed[0].Repo != "acme/gadgets" || failed[0].Cause == nil {
				t.Fatalf("failed = %+v, want acme/gadgets", failed)
			}
			if strings.Contains(failed[0].Error, f.Root) {
				t.Fatalf("failure %q names a filesystem path", failed[0].Error)
			}
		})
	}

	t.Run("list", func(t *testing.T) {
		repos, err := store.List(ctx)
		if err != nil {
			t.Fatalf("list: %v", err)
		}
		if _, err := store.ListFingerprint(ctx); err != nil {
			t.Fatalf("list fingerprint: %v", err)
		}
		got := map[string]git.RepoSummary{}
		for _, r := range repos {
			got[r.Name] = r
		}
		tests := []struct {
			name, err string
			readable  bool
		}{
			{"acme/gadgets", "repository could not be read", false},
			{"acme/widgets", "", true},
		}
		for _, tt := range tests {
			r, ok := got[tt.name]
			if !ok {
				t.Fatalf("%s is missing from %v", tt.name, repos)
			}
			if r.Error != tt.err || (r.Cause != nil) == tt.readable || (r.LastCommit != nil) != tt.readable {
				t.Fatalf("%s = error %q cause %v last commit %v", tt.name, r.Error, r.Cause, r.LastCommit)
			}
			if len(r.Activity) != git.ActivityWeeks || r.Contributors == nil {
				t.Fatalf("%s activity %v contributors %v, want zeroed slices", tt.name, r.Activity, r.Contributors)
			}
		}
	})

	t.Run("resumes at the cursor", func(t *testing.T) {
		first, err := store.Commits(ctx, git.FeedQuery{Limit: 2})
		if err != nil || len(first.Failed) != 1 || first.Next == "" {
			t.Fatalf("first page = %+v, %v", first, err)
		}
		if err := os.WriteFile(packed, refs, 0o600); err != nil {
			t.Fatal(err)
		}
		rest, _ := pageAll(ctx, t, store, git.FeedQuery{Limit: 2, Cursor: first.Next})
		// gadgets' commits newer than the cursor went by while it was unreadable
		want := []string{"acme/gadgets " + f.Initial, w + f.Initial}
		if !reflect.DeepEqual(rest, want) {
			t.Fatalf("rest = %v, want %v", rest, want)
		}
	})
}
