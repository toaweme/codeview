package git_test

import (
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/toaweme/codeview/internal/git"
)

func Test_BuildHistogram(t *testing.T) {
	times := []time.Time{
		utc("2025-03-05T08:00:00Z"),
		utc("2025-01-20T12:00:00Z"),
		utc("2025-01-31T23:59:59Z"),
		utc("2025-01-15T23:30:00Z"),
		utc("2025-01-01T09:00:00Z"),
	}
	tests := []struct {
		name  string
		times []time.Time
		query git.HistogramQuery
		want  string
		first string
		last  string
	}{
		{
			name:  "months",
			times: times,
			query: git.HistogramQuery{Bucket: git.BucketMonth},
			want:  "2025-01-01:4 2025-02-01:0 2025-03-01:1",
			first: "2025-01-01T09:00:00Z",
			last:  "2025-03-05T08:00:00Z",
		},
		{
			// 2025-01-01 is a Wednesday, so its week starts on Monday 2024-12-30
			name:  "weeks start on monday",
			times: times[1:],
			query: git.HistogramQuery{Bucket: git.BucketWeek},
			want:  "2024-12-30:1 2025-01-06:0 2025-01-13:1 2025-01-20:1 2025-01-27:1",
			first: "2025-01-01T09:00:00Z",
			last:  "2025-01-31T23:59:59Z",
		},
		{
			name:  "days in a window",
			times: times,
			query: git.HistogramQuery{
				Bucket: git.BucketDay,
				Since:  utc("2025-01-30T00:00:00Z"),
				Until:  utc("2025-02-01T23:59:59Z"),
			},
			want:  "2025-01-30:0 2025-01-31:1 2025-02-01:0",
			first: "2025-01-31T23:59:59Z",
			last:  "2025-01-31T23:59:59Z",
		},
		{
			name:  "window cuts inside a bucket",
			times: times,
			query: git.HistogramQuery{
				Bucket: git.BucketMonth,
				Since:  utc("2025-01-16T00:00:00Z"),
				Until:  utc("2025-01-31T00:00:00Z"),
			},
			want:  "2025-01-01:1",
			first: "2025-01-20T12:00:00Z",
			last:  "2025-01-20T12:00:00Z",
		},
		{"empty", nil, git.HistogramQuery{Bucket: git.BucketWeek}, "", "", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h, err := git.BuildHistogram(tt.times, tt.query)
			if err != nil {
				t.Fatalf("histogram: %v", err)
			}
			got := []string{}
			for _, b := range h.Buckets {
				got = append(got, fmt.Sprintf("%s:%d", b.Start.Format(time.DateOnly), b.Count))
			}
			if strings.Join(got, " ") != tt.want {
				t.Fatalf("buckets = %v, want %s", got, tt.want)
			}
			format := func(p *time.Time) string {
				if p == nil {
					return ""
				}
				return p.Format(time.RFC3339)
			}
			if format(h.First) != tt.first || format(h.Last) != tt.last {
				t.Fatalf(
					"first, last = %s, %s, want %s, %s",
					format(h.First),
					format(h.Last),
					tt.first,
					tt.last,
				)
			}
		})
	}
}

func Test_BuildHistogram_DayWindow(t *testing.T) {
	times := []time.Time{utc("2025-06-30T10:00:00Z"), utc("2020-01-01T10:00:00Z")}
	h, err := git.BuildHistogram(times, git.HistogramQuery{Bucket: git.BucketDay})
	if err != nil {
		t.Fatalf("histogram: %v", err)
	}
	if len(h.Buckets) != git.DefaultDayBuckets {
		t.Fatalf("got %d day buckets, want %d", len(h.Buckets), git.DefaultDayBuckets)
	}
	if h.First == nil || !h.First.Equal(times[0]) {
		t.Fatalf("first = %v, want the only commit inside the window", h.First)
	}
	_, err = git.BuildHistogram(times, git.HistogramQuery{Bucket: "hour"})
	if !errors.Is(err, git.ErrInvalidArgument) {
		t.Fatalf("error = %v, want ErrInvalidArgument", err)
	}
}
