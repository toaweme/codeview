package gittest

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// Init creates an empty repository at dir, bare or as a working copy, with origin
// as its origin remote unless origin is empty. It returns the git dir and skips
// the test when git is absent.
func Init(tb testing.TB, dir string, bare bool, origin string) string {
	tb.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		tb.Skip("git is not installed")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		tb.Fatal(err)
	}
	args := []string{"init", "-q", "-b", "main"}
	gitDir := filepath.Join(dir, ".git")
	if bare {
		args = append(args, "--bare")
		gitDir = dir
	}
	Run(tb, dir, args...)
	if origin != "" {
		Run(tb, dir, "--git-dir="+gitDir, "remote", "add", "origin", origin)
	}
	return gitDir
}

// Run runs git in dir and fails the test when it fails.
func Run(tb testing.TB, dir string, args ...string) {
	tb.Helper()
	cmd := exec.CommandContext(tb.Context(), "git", args...)
	cmd.Dir = dir
	cmd.Env = append(cleanEnv(), "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL="+os.DevNull)
	if out, err := cmd.CombinedOutput(); err != nil {
		tb.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
	}
}
