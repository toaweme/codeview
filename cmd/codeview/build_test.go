package main

import (
	"testing"
	"time"
)

func Test_BuildID(t *testing.T) {
	started := time.Unix(0, 1_000_000)
	dev := "dev-lfls"
	tests := []struct {
		name, version, commit, want string
	}{
		{"release", "v1.2.0", "abc123", "v1.2.0+abc123"},
		{"dev default", "dev", "", dev},
		{"no commit", "v1.2.0", "", dev},
		{"dev with commit", "dev", "abc123", dev},
		{"empty", "", "", dev},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := buildID(tt.version, tt.commit, started); got != tt.want {
				t.Fatalf("buildID = %q, want %q", got, tt.want)
			}
		})
	}
}
