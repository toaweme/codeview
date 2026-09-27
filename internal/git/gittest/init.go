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
func Init(t testing.TB, dir string, bare bool, origin string) string {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git is not installed")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	args := []string{"init", "-q", "-b", "main"}
	gitDir := filepath.Join(dir, ".git")
	if bare {
		args = append(args, "--bare")
		gitDir = dir
	}
	Run(t, dir, args...)
	if origin != "" {
		Run(t, dir, "--git-dir="+gitDir, "remote", "add", "origin", origin)
	}
	return gitDir
}

// Run runs git in dir and fails the test when it fails.
func Run(t testing.TB, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	cmd.Env = append(cleanEnv(), "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL="+os.DevNull)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
	}
}
