package git

import (
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"
)

func Test_TallyCommits(t *testing.T) {
	end := time.Date(2026, 3, 1, 0, 0, 0, 0, time.UTC)
	line := func(ago time.Duration, email string) string {
		return fmt.Sprintf("%d\x00%s", end.Add(-ago).Unix(), email)
	}
	weeks := func(last map[int]int) []int {
		out := make([]int, ActivityWeeks)
		for i, n := range last {
			out[ActivityWeeks-1-i] = n
		}
		return out
	}
	tests := []struct {
		name         string
		lines        []string
		counts       []int
		contributors []string
	}{
		{
			name:         "empty",
			counts:       weeks(nil),
			contributors: []string{},
		},
		{
			name: "dedupes emails case-insensitively and sorts them",
			lines: []string{
				line(time.Hour, "Bob@Example.com"),
				line(2*time.Hour, "ada@example.com"),
				line(3*time.Hour, "bob@example.com"),
			},
			counts:       weeks(map[int]int{0: 3}),
			contributors: []string{"ada@example.com", "bob@example.com"},
		},
		{
			name: "counts older weeks but only recent contributors",
			lines: []string{
				line(time.Hour, "ada@example.com"),
				line(3*week+time.Hour, "cy@example.com"),
				line(5*week+time.Hour, "old@example.com"),
				line(11*week+time.Hour, "old@example.com"),
			},
			counts:       weeks(map[int]int{0: 1, 3: 1, 5: 1, 11: 1}),
			contributors: []string{"ada@example.com", "cy@example.com"},
		},
		{
			name: "skips commits outside the window and malformed lines",
			lines: []string{
				line(-time.Hour, "future@example.com"),
				line(12*week+time.Hour, "ancient@example.com"),
				"garbage",
				line(time.Hour, ""),
			},
			counts:       weeks(map[int]int{0: 1}),
			contributors: []string{},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			counts, contributors := tallyCommits(strings.Join(tt.lines, "\n"), end)
			if !reflect.DeepEqual(counts, tt.counts) {
				t.Fatalf("counts = %v, want %v", counts, tt.counts)
			}
			if !reflect.DeepEqual(contributors, tt.contributors) {
				t.Fatalf("contributors = %v, want %v", contributors, tt.contributors)
			}
		})
	}
}
