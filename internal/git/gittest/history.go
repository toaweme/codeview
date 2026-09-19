package gittest

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// History holds "acme/history.git" for testing date, author and message filters.
type History struct {
	Root    string
	Name    string
	Initial string
	Parser  string
	Docs    string
	// Rebased has an author date older than its committer date.
	Rebased string
	Typo    string
}

// NewHistory skips the test when git is absent.
func NewHistory(t testing.TB) History {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	base := t.TempDir()
	work := filepath.Join(base, "work")
	h := History{Root: filepath.Join(base, "repos"), Name: "acme/history"}
	if err := os.MkdirAll(work, 0o755); err != nil {
		t.Fatal(err)
	}
	git := func(env []string, args ...string) string {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = work
		cmd.Env = append(
			append(cleanEnv(), "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL="+os.DevNull),
			env...,
		)
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
		}
		return strings.TrimSpace(string(out))
	}
	type who struct{ name, email string }
	ada := who{"Ada Lovelace", "ada@example.com"}
	bob := who{"Bob Builder", "bob@builder.dev"}
	commit := func(author who, authored, committed, path, content, message string) string {
		t.Helper()
		full := filepath.Join(work, filepath.FromSlash(path))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
		env := []string{
			"GIT_AUTHOR_NAME=" + author.name,
			"GIT_AUTHOR_EMAIL=" + author.email,
			"GIT_AUTHOR_DATE=" + authored,
			"GIT_COMMITTER_NAME=Charles Babbage",
			"GIT_COMMITTER_EMAIL=charles@example.com",
			"GIT_COMMITTER_DATE=" + committed,
		}
		git(env, "add", ".")
		git(env, "commit", "-q", "-m", message)
		return git(nil, "rev-parse", "HEAD")
	}

	git(nil, "init", "-q", "-b", "main")
	h.Initial = commit(
		ada,
		"2025-01-01T09:00:00Z",
		"2025-01-01T09:00:00Z",
		"README.md",
		"history\n",
		"initial setup",
	)
	h.Parser = commit(
		bob,
		"2025-01-15T23:30:00Z",
		"2025-01-15T23:30:00Z",
		"src/parse.go",
		"package src\n",
		"Fix parser bug",
	)
	h.Docs = commit(
		ada,
		"2025-01-31T23:59:59Z",
		"2025-01-31T23:59:59Z",
		"docs/guide.md",
		"guide\n",
		"add docs (v2.0)",
	)
	h.Rebased = commit(
		bob,
		"2025-01-20T12:00:00Z",
		"2025-02-10T08:00:00Z",
		"src/feature.go",
		"package src\n",
		"Rebased feature",
	)
	h.Typo = commit(
		ada,
		"2025-03-05T10:00:00+02:00",
		"2025-03-05T10:00:00+02:00",
		"docs/guide.md",
		"guide, fixed\n",
		"fix typo in docs",
	)

	bare := filepath.Join(h.Root, "acme", "history.git")
	if err := os.MkdirAll(filepath.Dir(bare), 0o755); err != nil {
		t.Fatal(err)
	}
	git(nil, "clone", "-q", "--bare", work, bare)
	return h
}
