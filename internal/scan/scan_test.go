package scan

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/toaweme/codeview/internal/git/gittest"
)

func Test_normaliseURL(t *testing.T) {
	tests := []struct {
		raw  string
		want string
	}{
		{"git@github.com:toaweme/cli.git", "github.com/toaweme/cli"},
		{"github.com:toaweme/cli", "github.com/toaweme/cli"},
		{"ssh://git@github.com:22/toaweme/cli.git", "github.com/toaweme/cli"},
		{"ssh://git@example.com/~alice/repo.git", "example.com/alice/repo"},
		{"https://github.com/toaweme/cli.git", "github.com/toaweme/cli"},
		{"https://x-access-token:secret@GitHub.com/toaweme/cli/", "github.com/toaweme/cli"},
		{"http://localhost:23232/seed/chi.git", "localhost/seed/chi"},
		{"git://git.example.org/group/sub/name.git", "git.example.org/group/sub/name"},
		{"file:///srv/git/cli.git", ""},
		{"/srv/git/cli.git", ""},
		{"../cli", ""},
		{"", ""},
	}
	for _, tt := range tests {
		t.Run(tt.raw, func(t *testing.T) {
			if got := normaliseURL(tt.raw); got != tt.want {
				t.Fatalf("normaliseURL(%q) = %q, want %q", tt.raw, got, tt.want)
			}
		})
	}
}

type want struct {
	name     string
	workTree bool
	public   bool
}

func touch(t *testing.T, path string) {
	t.Helper()
	if err := os.WriteFile(path, nil, 0o644); err != nil {
		t.Fatal(err)
	}
}

func symlink(t *testing.T, target, link string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
}

func Test_Scanner_Locate(t *testing.T) {
	tests := []struct {
		name     string
		maxDepth int
		setup    func(t *testing.T, dir, outside string)
		want     []want
	}{
		{
			name: "bare without origin takes its folder path",
			setup: func(t *testing.T, dir, _ string) {
				gittest.Init(t, filepath.Join(dir, "seed", "chi.git"), true, "")
			},
			want: []want{{name: "seed/chi"}},
		},
		{
			name: "working copy takes its origin",
			setup: func(t *testing.T, dir, _ string) {
				gittest.Init(t, filepath.Join(dir, "gopath", "cli"), false, "git@github.com:toaweme/cli.git")
			},
			want: []want{{name: "github.com/toaweme/cli", workTree: true}},
		},
		{
			name: "public comes from git-daemon-export-ok",
			setup: func(t *testing.T, dir, _ string) {
				gitDir := gittest.Init(t, filepath.Join(dir, "log.git"), true, "https://github.com/toaweme/log")
				touch(t, filepath.Join(gitDir, "git-daemon-export-ok"))
			},
			want: []want{{name: "github.com/toaweme/log", public: true}},
		},
		{
			name: "a .git file is skipped with everything under it",
			setup: func(t *testing.T, dir, _ string) {
				sub := filepath.Join(dir, "worktree")
				if err := os.MkdirAll(sub, 0o755); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(filepath.Join(sub, ".git"), []byte("gitdir: /elsewhere\n"), 0o644); err != nil {
					t.Fatal(err)
				}
				gittest.Init(t, filepath.Join(sub, "nested.git"), true, "")
			},
			want: nil,
		},
		{
			name: "scanning stops at a repository",
			setup: func(t *testing.T, dir, _ string) {
				outer := filepath.Join(dir, "outer")
				gittest.Init(t, outer, false, "")
				gittest.Init(t, filepath.Join(outer, "vendor", "inner"), false, "")
			},
			want: []want{{name: "outer", workTree: true}},
		},
		{
			name: "dot folders are skipped",
			setup: func(t *testing.T, dir, _ string) {
				gittest.Init(t, filepath.Join(dir, ".cache", "x.git"), true, "")
			},
			want: nil,
		},
		{
			name: "symlinked folders are followed once",
			setup: func(t *testing.T, dir, outside string) {
				gittest.Init(t, filepath.Join(outside, "repos", "seed", "chi.git"), true, "")
				symlink(t, filepath.Join(outside, "repos"), filepath.Join(dir, "a"))
				symlink(t, filepath.Join(outside, "repos"), filepath.Join(dir, "b"))
				symlink(t, dir, filepath.Join(dir, "loop"))
			},
			want: []want{{name: "a/seed/chi"}},
		},
		{
			name: "a clashing origin falls back to the folder path",
			setup: func(t *testing.T, dir, _ string) {
				origin := "git@github.com:toaweme/cli.git"
				gittest.Init(t, filepath.Join(dir, "a", "cli"), false, origin)
				gittest.Init(t, filepath.Join(dir, "b", "cli.git"), true, origin)
			},
			want: []want{
				{name: "github.com/toaweme/cli", workTree: true},
				{name: "b/cli"},
			},
		},
		{
			name: "an invalid origin falls back to the folder path",
			setup: func(t *testing.T, dir, _ string) {
				gittest.Init(t, filepath.Join(dir, "odd"), false, "https://example.com/owner/.hidden")
			},
			want: []want{{name: "odd", workTree: true}},
		},
		{
			name:     "the depth cap bounds the walk",
			maxDepth: 2,
			setup: func(t *testing.T, dir, _ string) {
				gittest.Init(t, filepath.Join(dir, "a", "shallow.git"), true, "")
				gittest.Init(t, filepath.Join(dir, "a", "b", "deep.git"), true, "")
			},
			want: []want{{name: "a/shallow"}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dir := filepath.Join(t.TempDir(), "view")
			outside := t.TempDir()
			if err := os.MkdirAll(dir, 0o755); err != nil {
				t.Fatal(err)
			}
			tt.setup(t, dir, outside)
			locs, err := New(Config{Dir: dir, MaxDepth: tt.maxDepth}).Locate(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			got := make([]want, len(locs))
			for i, loc := range locs {
				got[i] = want{
					name:     loc.Name,
					workTree: loc.WorkTree,
					public:   loc.Public,
				}
			}
			if len(got) != len(tt.want) {
				t.Fatalf("got %+v, want %+v", got, tt.want)
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Fatalf("repo %d = %+v, want %+v", i, got[i], tt.want[i])
				}
			}
		})
	}
}

func Test_Scanner_Locate_MissingDir(t *testing.T) {
	_, err := New(Config{Dir: filepath.Join(t.TempDir(), "absent")}).Locate(context.Background())
	if err == nil {
		t.Fatal("expected an error for a missing folder")
	}
}
