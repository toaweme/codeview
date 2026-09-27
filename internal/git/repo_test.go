package git_test

import (
	"context"
	"errors"
	"io"
	"testing"

	"github.com/toaweme/codeview/internal/git"
	"github.com/toaweme/codeview/internal/git/gittest"
	"github.com/toaweme/codeview/internal/scan"
)

func open(t *testing.T) (gittest.Fixture, git.Repo) {
	t.Helper()
	f := gittest.New(t)
	store := git.NewCLIStore(git.Config{Locator: scan.New(scan.Config{Dir: f.Root}), Mode: git.ModeAll})
	t.Cleanup(func() { _ = store.Close() })
	repo, err := store.Open(context.Background(), f.Name)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	return f, repo
}

func Test_CLIStore_List(t *testing.T) {
	f := gittest.New(t)
	store := git.NewCLIStore(git.Config{Locator: scan.New(scan.Config{Dir: f.Root}), Mode: git.ModeAll})
	defer store.Close()
	repos, err := store.List(context.Background())
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(repos) != 1 {
		t.Fatalf("got %d repos, want 1", len(repos))
	}
	r := repos[0]
	if r.Name != "acme/widgets" || r.Description != "Widget factory" || r.DefaultBranch != "main" {
		t.Fatalf("unexpected repo %+v", r)
	}
	if got := r.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"); got != "2026-01-04T10:00:00+02:00" {
		t.Fatalf("updatedAt = %s", got)
	}
}

func Test_CLIStore_Open(t *testing.T) {
	f := gittest.New(t)
	store := git.NewCLIStore(git.Config{Locator: scan.New(scan.Config{Dir: f.Root}), Mode: git.ModeAll})
	defer store.Close()
	tests := []struct {
		name string
		err  error
	}{
		{"acme/widgets", nil},
		{"acme/missing", git.ErrNotFound},
		{"../repos/acme/widgets", git.ErrInvalidArgument},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := store.Open(context.Background(), tt.name)
			if tt.err == nil && err != nil || tt.err != nil && !errors.Is(err, tt.err) {
				t.Fatalf("Open(%q) = %v, want %v", tt.name, err, tt.err)
			}
		})
	}
}

func Test_CLIRepo_Resolve(t *testing.T) {
	f, repo := open(t)
	tests := []struct {
		rev  string
		want string
		err  error
	}{
		{"", f.Third, nil},
		{"main", f.Third, nil},
		{"feature/x", f.Feature, nil},
		{"v1.0", f.Second, nil},
		{"light", f.Third, nil},
		{f.Initial, f.Initial, nil},
		{f.Initial[:8], f.Initial, nil},
		{"refs/heads/feature/x", f.Feature, nil},
		{"nope", "", git.ErrNotFound},
		{"main^", f.Second, nil},
		{"main~2", f.Initial, nil},
		{"main~1^", f.Initial, nil},
		{"HEAD~1", f.Second, nil},
		{"feature/x~1", f.Third, nil},
		{"v1.0^", f.Initial, nil},
		{f.Third[:8] + "^", f.Second, nil},
		{f.Third + "~2", f.Initial, nil},
		{"main~9", "", git.ErrNotFound},
		{"main^2", "", git.ErrNotFound},
		{"main^{tree}", "", git.ErrInvalidArgument},
		{"-main~1", "", git.ErrInvalidArgument},
		{"main~1..feature/x", "", git.ErrInvalidArgument},
		{"main..feature/x", "", git.ErrInvalidArgument},
		{"--all", "", git.ErrInvalidArgument},
		{"main:README.md", "", git.ErrInvalidArgument},
		{"main\nHEAD", "", git.ErrInvalidArgument},
	}
	for _, tt := range tests {
		t.Run(tt.rev, func(t *testing.T) {
			got, err := repo.Resolve(context.Background(), tt.rev)
			if tt.err != nil {
				if !errors.Is(err, tt.err) {
					t.Fatalf("Resolve(%q) error = %v, want %v", tt.rev, err, tt.err)
				}
				return
			}
			if err != nil || got != tt.want {
				t.Fatalf("Resolve(%q) = %q, %v, want %q", tt.rev, got, err, tt.want)
			}
		})
	}
}

func Test_CLIRepo_Refs(t *testing.T) {
	f, repo := open(t)
	refs, err := repo.Refs(context.Background())
	if err != nil {
		t.Fatalf("refs: %v", err)
	}
	if refs.Default != "main" || len(refs.Branches) != 2 || len(refs.Tags) != 2 {
		t.Fatalf("unexpected refs %+v", refs)
	}
	if refs.Branches[0].Name != "feature/x" || refs.Branches[0].Commit != f.Feature {
		t.Fatalf("newest branch = %+v", refs.Branches[0])
	}
	tags := map[string]string{}
	for _, tag := range refs.Tags {
		tags[tag.Name] = tag.Commit
		if tag.UpdatedAt.IsZero() {
			t.Fatalf("tag %s has no date", tag.Name)
		}
	}
	if tags["v1.0"] != f.Second || tags["light"] != f.Third {
		t.Fatalf("tags = %v", tags)
	}
}

func Test_CLIRepo_Tree(t *testing.T) {
	f, repo := open(t)
	tests := []struct {
		name  string
		path  string
		want  []string
		types []git.EntryType
		err   error
	}{
		{
			name: "root",
			path: "",
			want: []string{"docs", "notes", "src", "logo.bin", "README.md"},
			types: []git.EntryType{
				git.EntryTree,
				git.EntryTree,
				git.EntryTree,
				git.EntryBlob,
				git.EntryBlob,
			},
		},
		{"subdir", "/docs/", []string{"docs/b.txt"}, []git.EntryType{git.EntryBlob}, nil},
		{"spaced", "notes", []string{"notes/with space.txt"}, []git.EntryType{git.EntryBlob}, nil},
		{"missing", "nope", nil, nil, git.ErrNotFound},
		{"file", "README.md", nil, nil, git.ErrInvalidArgument},
		{"traversal", "../x", nil, nil, git.ErrInvalidArgument},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			entries, err := repo.Tree(context.Background(), f.Third, tt.path)
			if tt.err != nil {
				if !errors.Is(err, tt.err) {
					t.Fatalf("error = %v, want %v", err, tt.err)
				}
				return
			}
			if err != nil {
				t.Fatalf("tree: %v", err)
			}
			if len(entries) != len(tt.want) {
				t.Fatalf("got %+v", entries)
			}
			for i, e := range entries {
				want := tt.want[i]
				if e.Path != want && e.Name != want {
					t.Fatalf("entry %d = %+v, want %s", i, e, want)
				}
				if e.Type != tt.types[i] {
					t.Fatalf("entry %s type = %s, want %s", e.Path, e.Type, tt.types[i])
				}
			}
		})
	}
	entries, _ := repo.Tree(context.Background(), f.Third, "")
	for _, e := range entries {
		if e.Name == "README.md" &&
			(e.Size != int64(len("# widgets\n\nhello world\n")) || e.Mode != "100644") {
			t.Fatalf("README entry = %+v", e)
		}
	}
}

func Test_CLIRepo_Blob(t *testing.T) {
	f, repo := open(t)
	tests := []struct {
		name      string
		path      string
		limit     int64
		content   string
		binary    bool
		truncated bool
		err       error
	}{
		{"text", "README.md", 1 << 20, "# widgets\n\nhello world\n", false, false, nil},
		{"truncated", "README.md", 4, "# wi", false, true, nil},
		{"binary", "logo.bin", 1 << 20, "", true, false, nil},
		{"missing", "nope.txt", 1 << 20, "", false, false, git.ErrNotFound},
		{"directory", "docs", 1 << 20, "", false, false, git.ErrInvalidArgument},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			b, err := repo.Blob(context.Background(), f.Third, tt.path, tt.limit)
			if tt.err != nil {
				if !errors.Is(err, tt.err) {
					t.Fatalf("error = %v, want %v", err, tt.err)
				}
				return
			}
			if err != nil {
				t.Fatalf("blob: %v", err)
			}
			if b.Binary != tt.binary || b.Truncated != tt.truncated {
				t.Fatalf("blob flags = %+v", b)
			}
			if !tt.binary && string(b.Data) != tt.content {
				t.Fatalf("content = %q, want %q", b.Data, tt.content)
			}
		})
	}
	// the shared cat-file process must stay in sync after a truncated read
	b, err := repo.Blob(context.Background(), f.Third, "src/main.go", 1<<20)
	if err != nil || string(b.Data[:12]) != "package main" {
		t.Fatalf("blob after truncation = %q, %v", b.Data, err)
	}
	rc, size, err := repo.OpenBlob(context.Background(), f.Third, "logo.bin")
	if err != nil {
		t.Fatalf("open blob: %v", err)
	}
	data, _ := io.ReadAll(rc)
	_ = rc.Close()
	if int64(len(data)) != size || size != 14 {
		t.Fatalf("raw blob = %d bytes, size %d", len(data), size)
	}
}

func Test_CLIRepo_Diff(t *testing.T) {
	f, repo := open(t)
	tests := []struct {
		name  string
		base  string
		head  string
		check func(t *testing.T, files []git.FileDiff)
	}{
		{"root", "", f.Initial, func(t *testing.T, files []git.FileDiff) {
			if len(files) != 3 {
				t.Fatalf("got %d files", len(files))
			}
			for _, fd := range files {
				if fd.Status != git.StatusAdded ||
					fd.OldPath != "" ||
					fd.Deletions != 0 ||
					fd.Additions == 0 {
					t.Fatalf("root file = %+v", fd)
				}
			}
		}},
		{"binary and modify", f.Initial, f.Second, func(t *testing.T, files []git.FileDiff) {
			byPath := map[string]git.FileDiff{}
			for _, fd := range files {
				byPath[fd.Path] = fd
			}
			if !byPath["logo.bin"].Binary || byPath["logo.bin"].Status != git.StatusAdded {
				t.Fatalf("logo = %+v", byPath["logo.bin"])
			}
			readme := byPath["README.md"]
			if readme.Status != git.StatusModified ||
				readme.Additions != 1 ||
				readme.Deletions != 1 ||
				len(readme.Hunks) != 1 {
				t.Fatalf("readme = %+v", readme)
			}
			lines := readme.Hunks[0].Lines
			if lines[len(lines)-1].Type != git.LineAdd ||
				*lines[len(lines)-1].New != 3 ||
				lines[len(lines)-1].Old != nil {
				t.Fatalf("last line = %+v", lines[len(lines)-1])
			}
		}},
		{"rename and spaced add", f.Second, f.Third, func(t *testing.T, files []git.FileDiff) {
			byPath := map[string]git.FileDiff{}
			for _, fd := range files {
				byPath[fd.Path] = fd
			}
			ren := byPath["docs/b.txt"]
			if ren.Status != git.StatusRenamed || ren.OldPath != "docs/a.txt" {
				t.Fatalf("rename = %+v", ren)
			}
			if byPath["notes/with space.txt"].Status != git.StatusAdded {
				t.Fatalf("files = %+v", files)
			}
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			files, err := repo.Diff(context.Background(), tt.base, tt.head)
			if err != nil {
				t.Fatalf("diff: %v", err)
			}
			tt.check(t, files)
		})
	}
	base, err := repo.MergeBase(context.Background(), f.Second, f.Feature)
	if err != nil || base != f.Second {
		t.Fatalf("merge base = %s, %v", base, err)
	}
}

func Test_CLIRepo_Blame(t *testing.T) {
	f, repo := open(t)
	ranges, err := repo.Blame(context.Background(), f.Second, "README.md")
	if err != nil {
		t.Fatalf("blame: %v", err)
	}
	want := []struct {
		start, end int
		hash       string
	}{{1, 2, f.Initial}, {3, 3, f.Second}}
	if len(ranges) != len(want) {
		t.Fatalf("ranges = %+v", ranges)
	}
	for i, w := range want {
		r := ranges[i]
		if r.Start != w.start ||
			r.End != w.end ||
			r.Commit.Hash != w.hash ||
			r.Commit.Author.Name != "Ada Lovelace" ||
			r.Commit.Subject == "" {
			t.Fatalf("range %d = %+v", i, r)
		}
	}
	_, err = repo.Blame(context.Background(), f.Second, "docs")
	if !errors.Is(err, git.ErrInvalidArgument) {
		t.Fatalf("blame of a directory = %v", err)
	}
}
