package api_test

import (
	"encoding/json"
	"maps"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/toaweme/log"

	"github.com/toaweme/codeview/internal/api"
	"github.com/toaweme/codeview/internal/git"
	"github.com/toaweme/codeview/internal/git/gittest"
	"github.com/toaweme/codeview/internal/markdown"
	"github.com/toaweme/codeview/internal/scan"
)

func newServer(t *testing.T) (gittest.Fixture, http.Handler) {
	t.Helper()
	f := gittest.New(t)
	store := git.NewCLIStore(git.Config{Locator: scan.New(scan.Config{Dir: f.Root}), Mode: git.ModeAll})
	t.Cleanup(func() { _ = store.Close() })
	return f, api.New(store, markdown.NewGoldmark(), log.Discard(), "test")
}

type params = map[string]string

func get(h http.Handler, path string, query params, header ...string) *httptest.ResponseRecorder {
	q := url.Values{}
	for k, v := range query {
		q.Set(k, v)
	}
	req := httptest.NewRequest(http.MethodGet, path+"?"+q.Encode(), http.NoBody)
	for i := 0; i+1 < len(header); i += 2 {
		req.Header.Set(header[i], header[i+1])
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode %q: %v", rec.Body.String(), err)
	}
	return body
}

func Test_API_Status(t *testing.T) {
	f, h := newServer(t)
	tests := []struct {
		name   string
		path   string
		params map[string]string
		status int
	}{
		{"repos", "/api/repos", nil, 200},
		{"activity", "/api/activity", nil, 200},
		{"activity org", "/api/activity", params{"org": "acme", "limit": "5"}, 200},
		{"activity repo", "/api/activity", params{"repo": f.Name}, 200},
		{"activity bad limit", "/api/activity", params{"limit": "x"}, 400},
		{"activity zero limit", "/api/activity", params{"limit": "0"}, 400},
		{"refs", "/api/refs", params{"repo": f.Name}, 200},
		{"refs missing repo param", "/api/refs", nil, 400},
		{"refs unknown repo", "/api/refs", params{"repo": "acme/nope"}, 404},
		{"refs traversal", "/api/refs", params{"repo": "../acme/widgets"}, 400},
		{"tree", "/api/tree", params{"repo": f.Name}, 200},
		{"tree slash branch", "/api/tree", params{"repo": f.Name, "ref": "feature/x", "path": "src"}, 200},
		{"tree unknown ref", "/api/tree", params{"repo": f.Name, "ref": "nope"}, 404},
		{"tree bad ref", "/api/tree", params{"repo": f.Name, "ref": "main..x"}, 400},
		{"blob", "/api/blob", params{"repo": f.Name, "ref": "v1.0", "path": "README.md"}, 200},
		{"blob missing", "/api/blob", params{"repo": f.Name, "path": "nope"}, 404},
		{"render", "/api/render", params{"repo": f.Name, "path": "README.md"}, 200},
		{"render not markdown", "/api/render", params{"repo": f.Name, "path": "src/main.go"}, 400},
		{"render missing", "/api/render", params{"repo": f.Name, "path": "nope.md"}, 404},
		{"raw", "/api/raw", params{"repo": f.Name, "path": "logo.bin"}, 200},
		{"log", "/api/log", params{"repo": f.Name}, 200},
		{"log bad limit", "/api/log", params{"repo": f.Name, "limit": "x"}, 400},
		{"log bad cursor", "/api/log", params{"repo": f.Name, "cursor": "x"}, 400},
		{"commit", "/api/commit", params{"repo": f.Name, "hash": f.Second}, 200},
		{"commit missing hash", "/api/commit", params{"repo": f.Name}, 400},
		{"compare", "/api/compare", params{"repo": f.Name, "base": "main", "head": "feature/x"}, 200},
		{"blame", "/api/blame", params{"repo": f.Name, "path": "README.md"}, 200},
		{"unknown endpoint", "/api/nope", nil, 404},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := get(h, tt.path, tt.params)
			if rec.Code != tt.status {
				t.Fatalf("status = %d, want %d, body %s", rec.Code, tt.status, rec.Body.String())
			}
			if tt.status >= 400 {
				if body := decode(t, rec); body["error"] == "" || body["error"] == nil {
					t.Fatalf("error body = %v", body)
				}
			}
		})
	}
}

func Test_API_Tree(t *testing.T) {
	f, h := newServer(t)
	rec := get(h, "/api/tree", params{"repo": f.Name})
	body := decode(t, rec)
	if body["ref"] != "main" || body["commit"] != f.Third || body["path"] != "" {
		t.Fatalf("tree = %v", body)
	}
	readme, _ := body["readme"].(map[string]any)
	if readme["path"] != "README.md" ||
		!strings.Contains(readme["content"].(string), "hello world") {
		t.Fatalf("readme = %v", body["readme"])
	}
	html, _ := readme["html"].(string)
	if !strings.Contains(html, `<h1 id="widgets">widgets</h1>`) {
		t.Fatalf("readme html = %q", readme["html"])
	}
	entries := body["entries"].([]any)
	first := entries[0].(map[string]any)
	if first["type"] != "tree" || first["name"] != "docs" {
		t.Fatalf("first entry = %v", first)
	}
}

func Test_API_Revalidate(t *testing.T) {
	f, h := newServer(t)
	tests := []struct {
		name     string
		endpoint string
		params   map[string]string
		status   int
		tagged   bool
	}{
		{"repos", "/api/repos", nil, http.StatusOK, true},
		{"activity", "/api/activity", nil, http.StatusOK, true},
		{"activity commits", "/api/activity/commits", nil, http.StatusOK, true},
		{"activity releases", "/api/activity/releases", nil, http.StatusOK, true},
		{"refs", "/api/refs", params{"repo": f.Name}, http.StatusOK, true},
		{"tree by branch", "/api/tree", params{"repo": f.Name, "ref": "main"}, http.StatusOK, true},
		{"tree by hash", "/api/tree", params{"repo": f.Name, "ref": f.Third}, http.StatusOK, true},
		{"blob", "/api/blob", params{"repo": f.Name, "ref": f.Third, "path": "README.md"}, http.StatusOK, true},
		{"raw", "/api/raw", params{"repo": f.Name, "ref": f.Third, "path": "README.md"}, http.StatusOK, true},
		{"render", "/api/render", params{"repo": f.Name, "ref": f.Third, "path": "README.md"}, http.StatusOK, true},
		{"log", "/api/log", params{"repo": f.Name, "ref": f.Third}, http.StatusOK, true},
		{"histogram", "/api/log/histogram", params{"repo": f.Name, "ref": f.Third}, http.StatusOK, true},
		{"commit", "/api/commit", params{"repo": f.Name, "hash": f.Third}, http.StatusOK, true},
		{"compare", "/api/compare", params{"repo": f.Name, "base": "v1.0", "head": "feature/x"}, http.StatusOK, true},
		{"blame", "/api/blame", params{"repo": f.Name, "ref": f.Third, "path": "README.md"}, http.StatusOK, true},
		{"missing path", "/api/blob", params{"repo": f.Name, "ref": f.Third, "path": "nope"}, http.StatusNotFound, false},
		{"missing repo", "/api/tree", params{"repo": "acme/nope"}, http.StatusNotFound, false},
		{"bad request", "/api/tree", nil, http.StatusBadRequest, false},
		{"unknown endpoint", "/api/nope", nil, http.StatusNotFound, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			first := get(h, tt.endpoint, tt.params)
			if first.Code != tt.status {
				t.Fatalf("status = %d, want %d", first.Code, tt.status)
			}
			if cc := first.Header().Get("Cache-Control"); cc != "private, no-cache" {
				t.Fatalf("cache-control = %q", cc)
			}
			etag := first.Header().Get("ETag")
			if !tt.tagged {
				if etag != "" {
					t.Fatalf("etag = %q on a %d", etag, first.Code)
				}
				return
			}
			if !strings.HasPrefix(etag, `W/"`) {
				t.Fatalf("etag = %q, want a weak tag", etag)
			}
			strong := strings.TrimPrefix(etag, "W/")
			revalidations := []struct {
				header string
				status int
			}{
				{etag, http.StatusNotModified},
				{strong, http.StatusNotModified},
				{"*", http.StatusNotModified},
				{`"other", ` + etag, http.StatusNotModified},
				{`W/"other"`, tt.status},
			}
			for _, rv := range revalidations {
				rec := get(h, tt.endpoint, tt.params, "If-None-Match", rv.header)
				if rec.Code != rv.status {
					t.Fatalf("If-None-Match %s: status = %d, want %d", rv.header, rec.Code, rv.status)
				}
				if rv.status == http.StatusNotModified && rec.Body.Len() != 0 {
					t.Fatalf("If-None-Match %s: 304 has a body %q", rv.header, rec.Body.String())
				}
				if got := rec.Header().Get("ETag"); got != etag {
					t.Fatalf("If-None-Match %s: etag = %q, want %q", rv.header, got, etag)
				}
			}
		})
	}
}

func Test_API_RevalidateFollowsRefs(t *testing.T) {
	f, h := newServer(t)
	tests := []struct {
		name    string
		path    string
		params  map[string]string
		changes bool
	}{
		{"repos", "/api/repos", nil, true},
		{"releases", "/api/activity/releases", nil, true},
		{"refs", "/api/refs", params{"repo": f.Name}, true},
		{"tree by branch", "/api/tree", params{"repo": f.Name, "ref": "main"}, true},
		{"tree by hash", "/api/tree", params{"repo": f.Name, "ref": f.Third}, false},
		{"commit", "/api/commit", params{"repo": f.Name, "hash": f.Second}, false},
	}
	before := make([]string, len(tests))
	for i, tt := range tests {
		before[i] = get(h, tt.path, tt.params).Header().Get("ETag")
	}
	bare := filepath.Join(f.Root, filepath.FromSlash(f.Name)+".git")
	gittest.Run(t, bare, "--git-dir="+bare, "tag", "v2.0", f.Third)
	for i, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			after := get(h, tt.path, tt.params, "If-None-Match", before[i])
			if changed := after.Code != http.StatusNotModified; changed != tt.changes {
				t.Fatalf("status = %d, want a change %t", after.Code, tt.changes)
			}
		})
	}
}

func Test_API_Blob(t *testing.T) {
	f, h := newServer(t)
	tests := []struct {
		name    string
		path    string
		binary  bool
		content any
	}{
		{"text", "src/main.go", false, "package main\n\nfunc main() {\n\tprintln(\"hi\")\n}\n"},
		{"binary omits content", "logo.bin", true, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body := decode(t, get(h, "/api/blob", params{"repo": f.Name, "path": tt.path}))
			truncated, _ := body["truncated"].(bool)
			if body["binary"] != tt.binary ||
				body["content"] != tt.content ||
				truncated {
				t.Fatalf("blob = %v", body)
			}
		})
	}
}

func Test_API_Raw(t *testing.T) {
	f, h := newServer(t)
	tests := []struct {
		path  string
		ctype string
	}{
		{"logo.bin", "application/octet-stream"},
		{"README.md", "text/plain; charset=utf-8"},
	}
	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			rec := get(h, "/api/raw", params{"repo": f.Name, "path": tt.path})
			if got := rec.Header().Get("Content-Type"); got != tt.ctype {
				t.Fatalf("content-type = %q, want %q", got, tt.ctype)
			}
			if rec.Header().Get("X-Content-Type-Options") != "nosniff" {
				t.Fatalf("missing nosniff")
			}
		})
	}
}

func Test_API_LogPaging(t *testing.T) {
	f, h := newServer(t)
	var (
		seen   []string
		cursor string
	)
	for range 5 {
		params := params{"repo": f.Name, "ref": "feature/x", "limit": "3"}
		if cursor != "" {
			params["cursor"] = cursor
		}
		body := decode(t, get(h, "/api/log", params))
		for _, c := range body["commits"].([]any) {
			seen = append(seen, c.(map[string]any)["hash"].(string))
		}
		cursor, _ = body["next"].(string)
		if cursor == "" {
			break
		}
	}
	want := []string{f.Feature, f.Third, f.Second, f.Initial}
	if strings.Join(seen, ",") != strings.Join(want, ",") {
		t.Fatalf("paged history = %v, want %v", seen, want)
	}
}

func Test_API_CommitAndCompare(t *testing.T) {
	f, h := newServer(t)
	commit := decode(t, get(h, "/api/commit", params{"repo": f.Name, "hash": f.Third}))
	files := commit["files"].([]any)
	statuses := params{}
	for _, fd := range files {
		m := fd.(map[string]any)
		statuses[m["path"].(string)] = m["status"].(string)
	}
	if statuses["docs/b.txt"] != "renamed" || statuses["notes/with space.txt"] != "added" {
		t.Fatalf("commit files = %v", statuses)
	}

	query := params{"repo": f.Name, "base": "v1.0", "head": "feature/x"}
	cmp := decode(t, get(h, "/api/compare", query))
	if cmp["base"] != f.Second || cmp["head"] != f.Feature || cmp["merge_base"] != f.Second {
		t.Fatalf("compare = %v", cmp)
	}
	if n := len(cmp["commits"].([]any)); n != 2 {
		t.Fatalf("compare commits = %d", n)
	}
	var mainFile map[string]any
	for _, fd := range cmp["files"].([]any) {
		if m := fd.(map[string]any); m["path"] == "src/main.go" {
			mainFile = m
		}
	}
	hunk := mainFile["hunks"].([]any)[0].(map[string]any)
	for _, l := range hunk["lines"].([]any) {
		line := l.(map[string]any)
		if _, ok := line["old"]; !ok {
			t.Fatalf("line lacks old: %v", line)
		}
		if line["type"] == "add" && line["old"] != nil {
			t.Fatalf("added line has an old number: %v", line)
		}
	}
}

func Test_API_CompareMode(t *testing.T) {
	f, h := newServer(t)
	tests := []struct {
		name      string
		base      string
		head      string
		mode      string
		status    int
		files     int
		commits   int
		mergeBase string
		boundary  string
	}{
		{"merge base hides what base moved on", "feature/x", "v1.0", "", 200, 0, 0, f.Second, f.Second},
		{"direct shows every difference", "feature/x", "v1.0", "direct", 200, 3, 0, f.Second, f.Feature},
		{"direct keeps commits of head", "v1.0", "feature/x", "direct", 200, 3, 2, f.Second, f.Second},
		{"revision base", "main^", "feature/x", "", 200, 3, 2, f.Second, f.Second},
		{"revision of a hash", f.Third[:8] + "~2", "main~1", "direct", 200, 2, 1, f.Initial, f.Initial},
		{"range syntax is rejected", "main~1..x", "feature/x", "", 400, 0, 0, "", ""},
		{"unknown mode is rejected", "v1.0", "feature/x", "sideways", 400, 0, 0, "", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			params := params{"repo": f.Name, "base": tt.base, "head": tt.head}
			if tt.mode != "" {
				params["mode"] = tt.mode
			}
			rec := get(h, "/api/compare", params)
			if rec.Code != tt.status {
				t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
			}
			if tt.status != 200 {
				return
			}
			cmp := decode(t, rec)
			if cmp["merge_base"] != tt.mergeBase {
				t.Fatalf("merge_base = %v, want %s", cmp["merge_base"], tt.mergeBase)
			}
			if n := len(cmp["files"].([]any)); n != tt.files {
				t.Fatalf("files = %d, want %d", n, tt.files)
			}
			if n := len(cmp["commits"].([]any)); n != tt.commits {
				t.Fatalf("commits = %d, want %d", n, tt.commits)
			}
			if b := cmp["boundary"].(map[string]any); b["hash"] != tt.boundary {
				t.Fatalf("boundary = %v, want %s", b["hash"], tt.boundary)
			}
		})
	}
}

func Test_API_CompareDivergence(t *testing.T) {
	f, h := newServer(t)
	// hotfix forks from Second, so it and main diverge
	cmd := exec.Command(
		"git",
		"--git-dir="+filepath.Join(f.Root, "acme", "widgets.git"),
		"commit-tree",
		f.Third+"^{tree}",
		"-p", f.Second,
		"-m", "hotfix",
	)
	cmd.Env = append(
		cmd.Environ(),
		"GIT_AUTHOR_NAME=Ada",
		"GIT_AUTHOR_EMAIL=ada@example.com",
		"GIT_COMMITTER_NAME=Ada",
		"GIT_COMMITTER_EMAIL=ada@example.com",
	)
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("commit-tree: %v", err)
	}
	hotfix := strings.TrimSpace(string(out))
	tests := []struct {
		name     string
		base     string
		head     string
		ahead    float64
		behind   float64
		diverged bool
	}{
		{"linear tags", "v1.0", "light", 1, 0, false},
		{"linear to a branch", "v1.0", "feature/x", 2, 0, false},
		{"same ref", "main", "main", 0, 0, false},
		{"swapped linear", "feature/x", "v1.0", 0, 2, false},
		{"diverged", hotfix, "feature/x", 2, 1, true},
		{"diverged swapped", "feature/x", hotfix, 1, 2, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := get(h, "/api/compare", params{"repo": f.Name, "base": tt.base, "head": tt.head})
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d, body %s", rec.Code, rec.Body.String())
			}
			cmp := decode(t, rec)
			if cmp["ahead"] != tt.ahead ||
				cmp["behind"] != tt.behind ||
				cmp["diverged"] != tt.diverged {
				t.Fatalf(
					"ahead = %v, behind = %v, diverged = %v, want %v, %v, %v",
					cmp["ahead"],
					cmp["behind"],
					cmp["diverged"],
					tt.ahead,
					tt.behind,
					tt.diverged,
				)
			}
		})
	}
}

func Test_API_Blame(t *testing.T) {
	f, h := newServer(t)
	query := params{"repo": f.Name, "ref": "v1.0", "path": "README.md"}
	body := decode(t, get(h, "/api/blame", query))
	ranges := body["ranges"].([]any)
	if len(ranges) != 2 {
		t.Fatalf("ranges = %v", ranges)
	}
	last := ranges[1].(map[string]any)
	if last["start"] != float64(3) || last["commit"].(map[string]any)["hash"] != f.Second {
		t.Fatalf("last range = %v", last)
	}
}

func Test_API_Summaries(t *testing.T) {
	_, h := newServer(t)
	list := decode(t, get(h, "/api/repos", nil))
	repos := list["repos"].([]any)[0].(map[string]any)
	act := decode(t, get(h, "/api/activity", nil))
	tests := []struct {
		name string
		body map[string]any
		keys []string
	}{
		{
			name: "repo summary",
			body: repos,
			keys: []string{
				"name",
				"default_branch",
				"work_tree",
				"last_commit",
				"latest_tag",
				"branch_count",
				"tag_count",
				"activity",
			},
		},
		{"activity", act, []string{"commits", "tags", "branches"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for _, k := range tt.keys {
				if tt.body[k] == nil {
					t.Fatalf("%s is missing from %v", k, tt.body)
				}
			}
		})
	}
}

// twoRepos adds "acme/gadgets", a copy of the fixture with one more tag, "tools/v0.1" on the first commit.
func twoRepos(t *testing.T) (gittest.Fixture, http.Handler) {
	t.Helper()
	f, h := newServer(t)
	bare := filepath.Join(f.Root, filepath.FromSlash(f.Name)+".git")
	gadgets := filepath.Join(f.Root, "acme", "gadgets.git")
	gittest.Run(t, f.Root, "clone", "-q", "--bare", bare, gadgets)
	gittest.Run(t, gadgets, "--git-dir="+gadgets, "tag", "tools/v0.1", f.Initial)
	return f, h
}

// feedPages follows next from the first page and returns every page's items by key.
func feedPages(t *testing.T, h http.Handler, path, items string, query params) [][]string {
	t.Helper()
	var out [][]string
	for range 20 {
		rec := get(h, path, query)
		if rec.Code != http.StatusOK {
			t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
		}
		body := decode(t, rec)
		var page []string
		for _, it := range body[items].([]any) {
			m := it.(map[string]any)
			key := m["hash"]
			if key == nil {
				key = m["name"]
			}
			page = append(page, m["repo"].(string)+" "+key.(string))
		}
		out = append(out, page)
		next, _ := body["next"].(string)
		if next == "" {
			return out
		}
		query = maps.Clone(query)
		query["cursor"] = next
	}
	t.Fatalf("%s never reached its last page", path)
	return nil
}

func Test_API_ActivityCommits(t *testing.T) {
	f, h := twoRepos(t)
	g, w := "acme/gadgets ", "acme/widgets "
	tests := []struct {
		name  string
		query params
		want  [][]string
	}{
		{
			name:  "one per page",
			query: params{"limit": "1"},
			want: [][]string{
				{g + f.Third}, {w + f.Third}, {g + f.Second}, {w + f.Second}, {g + f.Initial}, {w + f.Initial},
			},
		},
		{
			name:  "uneven pages",
			query: params{"limit": "4"},
			want: [][]string{
				{g + f.Third, w + f.Third, g + f.Second, w + f.Second},
				{g + f.Initial, w + f.Initial},
			},
		},
		{
			name:  "one repository",
			query: params{"repo": "acme/widgets"},
			want:  [][]string{{w + f.Third, w + f.Second, w + f.Initial}},
		},
		{
			name:  "since a day",
			query: params{"since": "2026-01-03", "limit": "3"},
			want:  [][]string{{g + f.Third, w + f.Third, g + f.Second}, {w + f.Second}},
		},
		{
			name:  "other org",
			query: params{"org": "other"},
			want:  [][]string{nil},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := feedPages(t, h, "/api/activity/commits", "commits", tt.query)
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("pages = %v, want %v", got, tt.want)
			}
		})
	}
}

func Test_API_ActivityReleases(t *testing.T) {
	_, h := twoRepos(t)
	g, w := "acme/gadgets ", "acme/widgets "
	tests := []struct {
		name  string
		query params
		want  [][]string
	}{
		{
			name:  "two per page",
			query: params{"limit": "2"},
			want: [][]string{
				{g + "light", w + "light"},
				{g + "v1.0", w + "v1.0"},
				{g + "tools/v0.1"},
			},
		},
		{
			name:  "versions",
			query: params{"versions": "true"},
			want:  [][]string{{g + "v1.0", w + "v1.0", g + "tools/v0.1"}},
		},
		{
			name:  "picked repositories",
			query: params{"repo": "acme/widgets"},
			want:  [][]string{{w + "light", w + "v1.0"}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := feedPages(t, h, "/api/activity/releases", "releases", tt.query)
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("pages = %v, want %v", got, tt.want)
			}
		})
	}
	body := decode(t, get(h, "/api/activity/releases", params{"limit": "1"}))
	if body["total"] != float64(5) || body["versions"] != float64(3) {
		t.Fatalf("total = %v, versions = %v, want 5 and 3", body["total"], body["versions"])
	}
}

func Test_API_ActivityFeedInvalid(t *testing.T) {
	_, h := newServer(t)
	tests := []struct {
		name  string
		path  string
		query params
	}{
		{"cursor", "/api/activity/commits", params{"cursor": "!!"}},
		{"cursor fields", "/api/activity/releases", params{"cursor": "YWJj"}},
		{"limit", "/api/activity/commits", params{"limit": "0"}},
		{"since", "/api/activity/commits", params{"since": "yesterday"}},
		{"versions", "/api/activity/releases", params{"versions": "maybe"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if rec := get(h, tt.path, tt.query); rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400", rec.Code)
			}
		})
	}
}

func Test_API_ActivityCommitsFiltered(t *testing.T) {
	f, h := twoRepos(t)
	g, w := "acme/gadgets ", "acme/widgets "
	tests := []struct {
		name  string
		query params
		want  [][]string
	}{
		{"message ignores case", params{"message": "LOGO"}, [][]string{{g + f.Second, w + f.Second}}},
		{"message is literal", params{"message": "logo|docs"}, [][]string{nil}},
		{"author", params{"author": "lovelace", "repo": "acme/widgets", "limit": "2"}, [][]string{{w + f.Third, w + f.Second}, {w + f.Initial}}},
		{"author misses", params{"author": "babbage"}, [][]string{nil}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := feedPages(t, h, "/api/activity/commits", "commits", tt.query)
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("pages = %v, want %v", got, tt.want)
			}
		})
	}
	if rec := get(h, "/api/activity/commits", params{"author": "a\nb"}); rec.Code != http.StatusBadRequest {
		t.Fatalf("control character: status = %d, want 400", rec.Code)
	}
}

func Test_API_ActivitySkipsUnreadable(t *testing.T) {
	f, h := twoRepos(t)
	packed := filepath.Join(f.Root, "acme", "gadgets.git", "packed-refs")
	if err := os.WriteFile(packed, []byte("not a ref line\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/api/activity", "/api/activity/commits", "/api/activity/releases"} {
		t.Run(path, func(t *testing.T) {
			rec := get(h, path, nil)
			if rec.Code != http.StatusOK {
				t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
			}
			failed := decode(t, rec)["failed"].([]any)
			want := []any{map[string]any{"repo": "acme/gadgets", "error": "repository could not be read"}}
			if !reflect.DeepEqual(failed, want) {
				t.Fatalf("failed = %v, want %v", failed, want)
			}
		})
	}
}

func Test_API_ReposKeepsUnreadable(t *testing.T) {
	f, h := twoRepos(t)
	packed := filepath.Join(f.Root, "acme", "gadgets.git", "packed-refs")
	if err := os.WriteFile(packed, []byte("not a ref line\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	rec := get(h, "/api/repos", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("ETag") == "" {
		t.Fatal("the listing lost its etag over one unreadable repository")
	}
	repos := decode(t, rec)["repos"].([]any)
	tests := []struct {
		name string
		err  any
	}{
		{"acme/gadgets", "repository could not be read"},
		{"acme/widgets", nil},
	}
	if len(repos) != len(tests) {
		t.Fatalf("repos = %v", repos)
	}
	for i, tt := range tests {
		r := repos[i].(map[string]any)
		if r["name"] != tt.name || r["error"] != tt.err {
			t.Fatalf("repo %d = %v, want %s with error %v", i, r, tt.name, tt.err)
		}
	}
	if strings.Contains(rec.Body.String(), f.Root) {
		t.Fatal("the listing names a filesystem path")
	}
}
