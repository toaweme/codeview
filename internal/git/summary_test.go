package git_test

import (
	"context"
	"os/exec"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/toaweme/codeview/internal/git"
	"github.com/toaweme/codeview/internal/git/gittest"
)

func summaryStore(t *testing.T) (gittest.Fixture, *git.CLIStore) {
	t.Helper()
	f := gittest.New(t)
	now := time.Date(2026, 1, 6, 12, 0, 0, 0, time.UTC)
	store := git.NewCLIStore(git.Config{Root: f.Root, Now: func() time.Time { return now }})
	t.Cleanup(func() { _ = store.Close() })
	return f, store
}

func Test_CLIStore_List_Summary(t *testing.T) {
	f, store := summaryStore(t)
	repos, err := store.List(context.Background())
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(repos) != 1 {
		t.Fatalf("got %d repos, want 1", len(repos))
	}
	r := repos[0]
	week := make([]int, git.ActivityWeeks)
	week[git.ActivityWeeks-1] = 3
	tests := []struct {
		name string
		got  any
		want any
	}{
		{"last commit hash", r.LastCommit.Hash, f.Third},
		{"last commit subject", r.LastCommit.Subject, "rename docs"},
		{"last commit author", r.LastCommit.Author.Name, "Ada Lovelace"},
		{"latest tag", r.LatestTag.Name, "light"},
		{"latest tag commit", r.LatestTag.Commit, f.Third},
		{"branch count", r.BranchCount, 2},
		{"tag count", r.TagCount, 2},
		{"activity", r.Activity, week},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if !reflect.DeepEqual(tt.got, tt.want) {
				t.Fatalf("got %v, want %v", tt.got, tt.want)
			}
		})
	}
}

func Test_CLIStore_List_CacheFollowsRefs(t *testing.T) {
	f, store := summaryStore(t)
	ctx := context.Background()
	if _, err := store.List(ctx); err != nil {
		t.Fatalf("list: %v", err)
	}
	bare := filepath.Join(f.Root, "acme", "widgets.git")
	updateRef := exec.Command("git", "--git-dir="+bare, "update-ref", "refs/heads/extra", f.Initial)
	if out, err := updateRef.CombinedOutput(); err != nil {
		t.Fatalf("update-ref: %v\n%s", err, out)
	}
	repos, err := store.List(ctx)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if got := repos[0].BranchCount; got != 3 {
		t.Fatalf("branch count = %d after adding a branch, want 3", got)
	}
}
