package git

import (
	"fmt"
	"time"
)

const (
	// MaxHistogramBuckets keeps the newest end of a longer window.
	MaxHistogramBuckets = 2000
	// DefaultDayBuckets bounds a day histogram with no Since.
	DefaultDayBuckets = 365
)

// BuildHistogram counts times per bucket in UTC. Weeks start on Monday.
func BuildHistogram(times []time.Time, q HistogramQuery) (Histogram, error) {
	switch q.Bucket {
	case BucketDay, BucketWeek, BucketMonth:
	default:
		return Histogram{}, fmt.Errorf(
			"bucket %q is not day, week or month: %w",
			q.Bucket,
			ErrInvalidArgument,
		)
	}
	if !q.Since.IsZero() && !q.Until.IsZero() && q.Until.Before(q.Since) {
		return Histogram{}, fmt.Errorf(
			"date range %s to %s ends before it starts: %w",
			q.Since.Format(time.RFC3339),
			q.Until.Format(time.RFC3339),
			ErrInvalidArgument,
		)
	}
	var oldest, newest time.Time
	for _, t := range times {
		if oldest.IsZero() || t.Before(oldest) {
			oldest = t
		}
		if newest.IsZero() || t.After(newest) {
			newest = t
		}
	}
	end := firstSet(q.Until, newest, q.Since)
	if end.IsZero() {
		return Histogram{Buckets: []HistogramBucket{}}, nil
	}
	start := firstSet(q.Since, oldest, end)
	if q.Since.IsZero() && q.Bucket == BucketDay {
		start = later(start, end.AddDate(0, 0, -(DefaultDayBuckets-1)))
	}
	first := bucketStart(q.Bucket, start)
	last := bucketStart(q.Bucket, end)
	if n := bucketCount(q.Bucket, first, last); n > MaxHistogramBuckets {
		first = nextBucket(q.Bucket, first, n-MaxHistogramBuckets)
		start = first
	}

	buckets := make([]HistogramBucket, 0, bucketCount(q.Bucket, first, last))
	index := map[time.Time]int{}
	for b := first; !b.After(last); b = nextBucket(q.Bucket, b, 1) {
		index[b] = len(buckets)
		buckets = append(buckets, HistogramBucket{Start: b})
	}
	h := Histogram{Buckets: buckets}
	for _, t := range times {
		if t.Before(start) || t.After(end) {
			continue
		}
		h.Buckets[index[bucketStart(q.Bucket, t)]].Count++
		if h.First == nil || t.Before(*h.First) {
			h.First = &t
		}
		if h.Last == nil || t.After(*h.Last) {
			h.Last = &t
		}
	}
	return h, nil
}

func firstSet(ts ...time.Time) time.Time {
	for _, t := range ts {
		if !t.IsZero() {
			return t
		}
	}
	return time.Time{}
}

func later(a, b time.Time) time.Time {
	if b.After(a) {
		return b
	}
	return a
}

func bucketStart(b Bucket, t time.Time) time.Time {
	t = t.UTC()
	y, m, d := t.Date()
	switch b {
	case BucketMonth:
		return time.Date(y, m, 1, 0, 0, 0, 0, time.UTC)
	case BucketWeek:
		back := (int(t.Weekday()) + 6) % 7
		return time.Date(y, m, d-back, 0, 0, 0, 0, time.UTC)
	default:
		return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
	}
}

func nextBucket(b Bucket, t time.Time, n int) time.Time {
	switch b {
	case BucketMonth:
		return t.AddDate(0, n, 0)
	case BucketWeek:
		return t.AddDate(0, 0, 7*n)
	default:
		return t.AddDate(0, 0, n)
	}
}

func bucketCount(b Bucket, first, last time.Time) int {
	switch b {
	case BucketMonth:
		return (last.Year()-first.Year())*12 + int(last.Month()-first.Month()) + 1
	case BucketWeek:
		return int(last.Sub(first).Hours()/24)/7 + 1
	default:
		return int(last.Sub(first).Hours()/24) + 1
	}
}
