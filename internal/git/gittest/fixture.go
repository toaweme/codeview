// Package gittest builds throwaway repositories for tests with the git CLI.
package gittest

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// Fixture holds "acme/widgets.git" and the hashes of its commits.
type Fixture struct {
	Root    string
	Name    string
	Initial string
	Second  string
	Third   string
	Feature string
}

// New skips the test when git is absent.
func New(t testing.TB) Fixture {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	base := t.TempDir()
	work := filepath.Join(base, "work")
	root := filepath.Join(base, "repos")
	f := Fixture{Root: root, Name: "acme/widgets"}

	date := "2026-01-02T10:00:00+02:00"
	run := func(args ...string) string {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = work
		cmd.Env = append(
			cleanEnv(),
			"GIT_CONFIG_NOSYSTEM=1",
			"GIT_CONFIG_GLOBAL="+os.DevNull,
			"GIT_AUTHOR_NAME=Ada Lovelace",
			"GIT_AUTHOR_EMAIL=ada@example.com",
			"GIT_COMMITTER_NAME=Charles Babbage",
			"GIT_COMMITTER_EMAIL=charles@example.com",
			"GIT_AUTHOR_DATE="+date,
			"GIT_COMMITTER_DATE="+date,
		)
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
		}
		return strings.TrimSpace(string(out))
	}
	write := func(path, content string) {
		t.Helper()
		full := filepath.Join(work, filepath.FromSlash(path))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.MkdirAll(work, 0o755); err != nil {
		t.Fatal(err)
	}

	run("init", "-q", "-b", "main")
	write("README.md", "# widgets\n\nhello\n")
	write("src/main.go", "package main\n\nfunc main() {\n\tprintln(\"hi\")\n}\n")
	write("docs/a.txt", "alpha\nbeta\ngamma\ndelta\nepsilon\n")
	run("add", ".")
	run("commit", "-q", "-m", "initial commit", "-m", "with a body line")
	f.Initial = run("rev-parse", "HEAD")

	date = "2026-01-03T10:00:00+02:00"
	write("README.md", "# widgets\n\nhello world\n")
	write("logo.bin", "\x89PNG\x00\x01\x02\x03binary")
	run("add", ".")
	run("commit", "-q", "-m", "add logo")
	f.Second = run("rev-parse", "HEAD")
	run("tag", "-a", "v1.0", "-m", "release 1.0")

	date = "2026-01-04T10:00:00+02:00"
	run("mv", "docs/a.txt", "docs/b.txt")
	write("notes/with space.txt", "spaced\n")
	run("add", ".")
	run("commit", "-q", "-m", "rename docs")
	f.Third = run("rev-parse", "HEAD")
	run("tag", "light")

	date = "2026-01-05T10:00:00+02:00"
	run("checkout", "-q", "-b", "feature/x")
	write("src/main.go", "package main\n\nfunc main() {\n\tprintln(\"hello\")\n}\n")
	run("commit", "-q", "-am", "greet louder")
	f.Feature = run("rev-parse", "HEAD")
	run("checkout", "-q", "main")

	bare := filepath.Join(root, "acme", "widgets.git")
	if err := os.MkdirAll(filepath.Dir(bare), 0o755); err != nil {
		t.Fatal(err)
	}
	run("clone", "-q", "--bare", work, bare)
	description := filepath.Join(bare, "description")
	if err := os.WriteFile(description, []byte("Widget factory\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	return f
}

func cleanEnv() []string {
	var env []string
	for _, kv := range os.Environ() {
		if !strings.HasPrefix(kv, "GIT_") {
			env = append(env, kv)
		}
	}
	return env
}
