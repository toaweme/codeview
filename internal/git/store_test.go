package git_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/toaweme/codeview/internal/git"
	"github.com/toaweme/codeview/internal/git/gittest"
	"github.com/toaweme/codeview/internal/scan"
)

func Test_CLIStore_Mode(t *testing.T) {
	tests := []struct {
		name     string
		mode     git.Mode
		exported bool
		want     []string
		openErr  error
	}{
		{"public hides a private repo", git.ModePublic, false, nil, git.ErrNotFound},
		{"public serves an exported repo", git.ModePublic, true, []string{"acme/widgets"}, nil},
		{"all serves a private repo", git.ModeAll, false, []string{"acme/widgets"}, nil},
		{"empty mode is public", "", false, nil, git.ErrNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := gittest.New(t)
			if tt.exported {
				ok := filepath.Join(f.Root, "acme", "widgets.git", "git-daemon-export-ok")
				if err := os.WriteFile(ok, nil, 0o644); err != nil {
					t.Fatal(err)
				}
			}
			store := git.NewCLIStore(git.Config{Locator: scan.New(scan.Config{Dir: f.Root}), Mode: tt.mode})
			defer store.Close()
			repos, err := store.List(context.Background())
			if err != nil {
				t.Fatalf("list: %v", err)
			}
			var names []string
			for _, r := range repos {
				names = append(names, r.Name)
			}
			if len(names) != len(tt.want) || len(names) > 0 && names[0] != tt.want[0] {
				t.Fatalf("names = %v, want %v", names, tt.want)
			}
			_, err = store.Open(context.Background(), f.Name)
			if tt.openErr == nil && err != nil || tt.openErr != nil && !errors.Is(err, tt.openErr) {
				t.Fatalf("Open = %v, want %v", err, tt.openErr)
			}
		})
	}
}

func Test_CLIStore_WorkTree(t *testing.T) {
	f := gittest.New(t)
	dir := t.TempDir()
	bare := filepath.Join(f.Root, "acme", "widgets.git")
	gittest.Run(t, dir, "clone", "-q", bare, "wc")
	wc := filepath.Join(dir, "wc")
	gittest.Run(t, wc, "checkout", "-q", "-b", "topic")
	gittest.Run(t, wc, "-c", "user.name=a", "-c", "user.email=a@example.com", "commit", "-q", "--allow-empty", "-m", "topic")
	gittest.Run(t, wc, "remote", "set-url", "origin", "git@github.com:acme/widgets.git")

	store := git.NewCLIStore(git.Config{Locator: scan.New(scan.Config{Dir: dir}), Mode: git.ModeAll})
	defer store.Close()
	ctx := context.Background()
	repos, err := store.List(ctx)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(repos) != 1 {
		t.Fatalf("got %d repos, want 1", len(repos))
	}
	r := repos[0]
	if r.Name != "github.com/acme/widgets" || !r.WorkTree || r.DefaultBranch != "main" {
		t.Fatalf("unexpected repo %+v", r)
	}
	repo, err := store.Open(ctx, r.Name)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	tests := []struct {
		name string
		got  func() (string, error)
		want string
	}{
		{"resolve empty rev", func() (string, error) { return repo.Resolve(ctx, "") }, f.Third},
		{"refs default", func() (string, error) {
			refs, err := repo.Refs(ctx)
			return refs.Default, err
		}, "main"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := tt.got()
			if err != nil || got != tt.want {
				t.Fatalf("got %q, %v, want %q", got, err, tt.want)
			}
		})
	}
}
