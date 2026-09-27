package api_test

import (
	"fmt"
	"maps"
	"net/http"
	"strings"
	"testing"

	"github.com/toaweme/log"

	"github.com/toaweme/codeview/internal/api"
	"github.com/toaweme/codeview/internal/git"
	"github.com/toaweme/codeview/internal/git/gittest"
	"github.com/toaweme/codeview/internal/markdown"
	"github.com/toaweme/codeview/internal/scan"
)

func newHistoryServer(t *testing.T) (gittest.History, http.Handler) {
	t.Helper()
	f := gittest.NewHistory(t)
	store := git.NewCLIStore(git.Config{Locator: scan.New(scan.Config{Dir: f.Root}), Mode: git.ModeAll})
	t.Cleanup(func() { _ = store.Close() })
	return f, api.New(store, markdown.NewGoldmark(), log.Discard())
}

func pages(t *testing.T, h http.Handler, filter params) []string {
	t.Helper()
	var seen []string
	cursor := ""
	for range 10 {
		p := params{"cursor": cursor}
		maps.Copy(p, filter)
		rec := get(h, "/api/log", p)
		if rec.Code != http.StatusOK {
			t.Fatalf("log %v = %d %s", p, rec.Code, rec.Body.String())
		}
		body := decode(t, rec)
		for _, c := range body["commits"].([]any) {
			seen = append(seen, c.(map[string]any)["hash"].(string))
		}
		cursor, _ = body["next"].(string)
		if cursor == "" {
			return seen
		}
	}
	t.Fatal("history did not end within 10 pages")
	return nil
}

func Test_API_LogFilter(t *testing.T) {
	f, h := newHistoryServer(t)
	tests := []struct {
		name   string
		params map[string]string
		want   []string
	}{
		{
			name:   "until date covers the whole day",
			params: params{"since": "2025-01-15", "until": "2025-01-31"},
			want:   []string{f.Rebased, f.Docs, f.Parser},
		},
		{
			name:   "committer dates",
			params: params{"since": "2025-01-15", "until": "2025-01-31", "dateField": "committer"},
			want:   []string{f.Docs, f.Parser},
		},
		{
			name: "rfc3339 bounds with offset",
			params: params{
				"since": "2025-03-05T09:00:00+02:00",
				"until": "2025-03-05T10:00:00+02:00",
			},
			want: []string{f.Typo},
		},
		{
			name:   "author",
			params: params{"author": "bob"},
			want:   []string{f.Rebased, f.Parser},
		},
		{
			name:   "grep",
			params: params{"grep": "fix"},
			want:   []string{f.Typo, f.Parser},
		},
		{
			name:   "paged author dates",
			params: params{"since": "2025-01-01", "limit": "1"},
			want:   []string{f.Typo, f.Rebased, f.Docs, f.Parser, f.Initial},
		},
		{
			name:   "paged committer dates",
			params: params{"until": "2025-02-28", "dateField": "committer", "limit": "2"},
			want:   []string{f.Rebased, f.Docs, f.Parser, f.Initial},
		},
		{
			name:   "paged author",
			params: params{"author": "ada", "limit": "2"},
			want:   []string{f.Typo, f.Docs, f.Initial},
		},
		{
			name:   "path with dates",
			params: params{"path": "docs/guide.md", "since": "2025-01-01", "limit": "1"},
			want:   []string{f.Typo, f.Docs},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.params["repo"] = f.Name
			got := pages(t, h, tt.params)
			if strings.Join(got, ",") != strings.Join(tt.want, ",") {
				t.Fatalf("history = %v, want %v", got, tt.want)
			}
		})
	}
}

func Test_API_LogFilterInvalid(t *testing.T) {
	f, h := newHistoryServer(t)
	query := params{"repo": f.Name, "author": "ada", "limit": "1"}
	body := decode(t, get(h, "/api/log", query))
	cursor := body["next"].(string)
	tests := []struct {
		name   string
		params map[string]string
	}{
		{"cursor under other filters", params{"author": "bob", "limit": "1", "cursor": cursor}},
		{"cursor without filters", params{"limit": "1", "cursor": cursor}},
		{"cursor in the old form", params{"cursor": f.Typo + ".1"}},
		{"bad since", params{"since": "last week"}},
		{"bad date field", params{"dateField": "tagger"}},
		{"reversed range", params{"since": "2025-02-01", "until": "2025-01-01"}},
		{"bad bucket", params{"bucket": "hour"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.params["repo"] = f.Name
			path := "/api/log"
			if _, ok := tt.params["bucket"]; ok {
				path = "/api/log/histogram"
			}
			if rec := get(h, path, tt.params); rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400: %s", rec.Code, rec.Body.String())
			}
		})
	}
	query = params{"repo": f.Name, "author": "ada", "limit": "1", "cursor": cursor}
	rec := get(h, "/api/log", query)
	if rec.Code != http.StatusOK {
		t.Fatalf("cursor under its own filters = %d", rec.Code)
	}
}

func Test_API_Histogram(t *testing.T) {
	f, h := newHistoryServer(t)
	tests := []struct {
		name   string
		params map[string]string
		want   string
	}{
		{
			name:   "author months",
			params: params{"bucket": "month"},
			want:   "2025-01-01:4 2025-02-01:0 2025-03-01:1",
		},
		{
			name:   "committer months",
			params: params{"bucket": "month", "dateField": "committer"},
			want:   "2025-01-01:3 2025-02-01:1 2025-03-01:1",
		},
		{
			name:   "weeks by default",
			params: params{"since": "2025-01-27", "until": "2025-02-16"},
			want:   "2025-01-27:1 2025-02-03:0 2025-02-10:0",
		},
		{
			name:   "file history",
			params: params{"bucket": "month", "path": "docs/guide.md"},
			want:   "2025-01-01:1 2025-02-01:0 2025-03-01:1",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.params["repo"] = f.Name
			for round := range 2 {
				rec := get(h, "/api/log/histogram", tt.params)
				if rec.Code != http.StatusOK {
					t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
				}
				got := []string{}
				for _, b := range decode(t, rec)["buckets"].([]any) {
					b := b.(map[string]any)
					got = append(got, fmt.Sprintf("%s:%v", b["start"].(string)[:10], b["count"]))
				}
				if strings.Join(got, " ") != tt.want {
					t.Fatalf("round %d buckets = %v, want %s", round, got, tt.want)
				}
			}
		})
	}
}
