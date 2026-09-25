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

func Test_CLIStore_Activity(t *testing.T) {
	f, store := summaryStore(t)
	light := git.ActivityTag{Repo: f.Name, Name: "light", Commit: f.Third, Previous: "v1.0"}
	featureX := git.ActivityBranch{
		Repo:    f.Name,
		Name:    "feature/x",
		Commit:  f.Feature,
		Subject: "greet louder",
		Ahead:   1,
	}
	tests := []struct {
		name     string
		q        git.ActivityQuery
		commits  []string
		tags     []git.ActivityTag
		branches []git.ActivityBranch
	}{
		{
			name:    "all",
			q:       git.ActivityQuery{},
			commits: []string{f.Third, f.Second, f.Initial},
			tags: []git.ActivityTag{
				light,
				{Repo: f.Name, Name: "v1.0", Commit: f.Second},
			},
			branches: []git.ActivityBranch{featureX},
		},
		{
			name:     "limited",
			q:        git.ActivityQuery{Org: "acme", Limit: 1},
			commits:  []string{f.Third},
			tags:     []git.ActivityTag{light},
			branches: []git.ActivityBranch{featureX},
		},
		{
			name:     "one repo",
			q:        git.ActivityQuery{Repo: f.Name, Limit: 1},
			commits:  []string{f.Third},
			tags:     []git.ActivityTag{light},
			branches: []git.ActivityBranch{featureX},
		},
		{
			name:     "other repo",
			q:        git.ActivityQuery{Repo: "acme/missing"},
			commits:  []string{},
			tags:     []git.ActivityTag{},
			branches: []git.ActivityBranch{},
		},
		{
			name:     "other org",
			q:        git.ActivityQuery{Org: "other"},
			commits:  []string{},
			tags:     []git.ActivityTag{},
			branches: []git.ActivityBranch{},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			act, err := store.Activity(context.Background(), tt.q)
			if err != nil {
				t.Fatalf("activity: %v", err)
			}
			commits := []string{}
			for _, c := range act.Commits {
				if c.Repo != f.Name || c.Ref != "main" {
					t.Fatalf("commit %+v has the wrong repo or ref", c)
				}
				commits = append(commits, c.Hash)
			}
			if !reflect.DeepEqual(commits, tt.commits) {
				t.Fatalf("commits = %v, want %v", commits, tt.commits)
			}
			for i := range act.Tags {
				act.Tags[i].TaggedAt = time.Time{}
			}
			if !reflect.DeepEqual(act.Tags, tt.tags) {
				t.Fatalf("tags = %+v, want %+v", act.Tags, tt.tags)
			}
			for i := range act.Branches {
				act.Branches[i].UpdatedAt = time.Time{}
			}
			if !reflect.DeepEqual(act.Branches, tt.branches) {
				t.Fatalf("branches = %+v, want %+v", act.Branches, tt.branches)
			}
		})
	}
}
