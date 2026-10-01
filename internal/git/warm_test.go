package git

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/toaweme/codeview/internal/git/gittest"
)

type fixedLocator []Location

var _ Locator = fixedLocator(nil)

func (l fixedLocator) Locate(context.Context) ([]Location, error) { return l, nil }

func Test_CLIStore_Warm(t *testing.T) {
	f := gittest.New(t)
	locs := fixedLocator{{Name: f.Name, GitDir: filepath.Join(f.Root, "acme", "widgets.git"), Public: true}}
	tests := []struct {
		name   string
		warm   bool
		cached bool
	}{
		{"enabled", true, true},
		{"disabled", false, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := NewCLIStore(Config{Locator: locs, Warm: tt.warm})
			s.Warm()
			// a second call while the first runs must not start another
			s.Warm()
			var cached bool
			for deadline := time.Now().Add(10 * time.Second); time.Now().Before(deadline); {
				s.cacheMu.Lock()
				_, cached = s.cache[f.Name]
				s.cacheMu.Unlock()
				s.warmMu.Lock()
				warming := s.warming
				s.warmMu.Unlock()
				if cached || !warming {
					break
				}
				time.Sleep(10 * time.Millisecond)
			}
			if err := s.Close(); err != nil {
				t.Fatalf("close: %v", err)
			}
			s.cacheMu.Lock()
			_, cached = s.cache[f.Name]
			s.cacheMu.Unlock()
			if cached != tt.cached {
				t.Fatalf("cached = %t, want %t", cached, tt.cached)
			}
			s.Warm()
			s.warmMu.Lock()
			defer s.warmMu.Unlock()
			if s.warming {
				t.Fatal("a closed store started warming")
			}
		})
	}
}

func Test_CLIStore_WarmStopsOnClose(t *testing.T) {
	f := gittest.New(t)
	locs := fixedLocator{{Name: f.Name, GitDir: filepath.Join(f.Root, "acme", "widgets.git"), Public: true}}
	s := NewCLIStore(Config{Locator: locs, Warm: true})
	// every worker busy keeps the warm waiting until Close cancels it
	for range summaryWorkers {
		s.workers <- struct{}{}
	}
	s.Warm()
	done := make(chan error, 1)
	go func() { done <- s.Close() }()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("close: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("close waited on a warm that should have been canceled")
	}
}

func Test_BuildReleases(t *testing.T) {
	day := func(d int) time.Time { return time.Date(2026, 1, d, 0, 0, 0, 0, time.UTC) }
	tags := []ActivityTag{
		{Name: "v1.0.0", TaggedAt: day(1)},
		{Name: "tools/v0.1", TaggedAt: day(2)},
		{Name: "nightly", TaggedAt: day(3)},
		{Name: "v1.1.0", TaggedAt: day(4)},
		{Name: "v1.2.0-rc1", TaggedAt: day(5)},
		{Name: "v1.2.0", TaggedAt: day(5)},
		{Name: "tools/v0.2", TaggedAt: day(6)},
		{Name: "latest", TaggedAt: day(7)},
	}
	tests := []struct {
		name, previous string
		version        bool
	}{
		{"latest", "nightly", false},
		{"tools/v0.2", "tools/v0.1", true},
		{"v1.2.0", "v1.2.0-rc1", true},
		{"v1.2.0-rc1", "v1.1.0", true},
		{"v1.1.0", "v1.0.0", true},
		{"nightly", "", false},
		{"tools/v0.1", "", true},
		{"v1.0.0", "", true},
	}
	got := buildReleases(tags)
	if len(got) != len(tests) {
		t.Fatalf("got %d releases, want %d", len(got), len(tests))
	}
	for i, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := got[i]
			if r.Name != tt.name || r.Previous != tt.previous || r.isVersion != tt.version {
				t.Fatalf("release %d = %s after %q version %t, want %s after %q version %t",
					i, r.Name, r.Previous, r.isVersion, tt.name, tt.previous, tt.version)
			}
		})
	}
}

func Test_CompareVersions(t *testing.T) {
	tests := []struct {
		a, b string
		sign int
	}{
		{"v1.2.0", "v1.10.0", 1},
		{"1.10", "1.2", -1},
		{"v2.0.0", "v2.0.0-rc1", -1},
		{"v2.0.0-rc1", "v2.0.0", 1},
		{"v1.0", "v1.0.0", 0},
	}
	for _, tt := range tests {
		t.Run(tt.a+" "+tt.b, func(t *testing.T) {
			got := compareVersions(tt.a, tt.b)
			if (got > 0) != (tt.sign > 0) || (got < 0) != (tt.sign < 0) {
				t.Fatalf("compareVersions = %d, want the sign of %d", got, tt.sign)
			}
		})
	}
}
