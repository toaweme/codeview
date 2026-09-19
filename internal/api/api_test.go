package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/toaweme/http/server"
	"github.com/toaweme/log"

	"github.com/toaweme/codeview/internal/api"
	"github.com/toaweme/codeview/internal/git"
	"github.com/toaweme/codeview/internal/git/gittest"
	"github.com/toaweme/codeview/internal/markdown"
)

func newServer(t *testing.T) (gittest.Fixture, http.Handler) {
	t.Helper()
	f := gittest.New(t)
	store := git.NewCLIStore(git.Config{Root: f.Root})
	t.Cleanup(func() { _ = store.Close() })
	r := server.NewRouter()
	server.Register(r, api.New(store, markdown.NewGoldmark(), log.Discard()).Routes())
	return f, r
}

type params = map[string]string

func get(h http.Handler, path string, query params, header ...string) *httptest.ResponseRecorder {
	q := url.Values{}
	for k, v := range query {
		q.Set(k, v)
	}
	req := httptest.NewRequest(http.MethodGet, path+"?"+q.Encode(), nil)
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

func Test_API_NoStore(t *testing.T) {
	f, h := newServer(t)
	tests := []struct {
		name     string
		endpoint string
		params   map[string]string
		status   int
	}{
		{"repos", "/api/repos", nil, http.StatusOK},
		{"refs", "/api/refs", params{"repo": f.Name}, http.StatusOK},
		{"tree by branch", "/api/tree", params{"repo": f.Name, "ref": "main"}, http.StatusOK},
		{"tree by hash", "/api/tree", params{"repo": f.Name, "ref": f.Third}, http.StatusOK},
		{"blob", "/api/blob", params{"repo": f.Name, "ref": f.Third, "path": "README.md"}, http.StatusOK},
		{"raw", "/api/raw", params{"repo": f.Name, "ref": f.Third, "path": "README.md"}, http.StatusOK},
		{"render", "/api/render", params{"repo": f.Name, "ref": f.Third, "path": "README.md"}, http.StatusOK},
		{"log", "/api/log", params{"repo": f.Name, "ref": f.Third}, http.StatusOK},
		{"histogram", "/api/log/histogram", params{"repo": f.Name, "ref": f.Third}, http.StatusOK},
		{"bad request", "/api/tree", nil, http.StatusBadRequest},
		{"unknown endpoint", "/api/nope", nil, http.StatusNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := get(h, tt.endpoint, tt.params, "If-None-Match", "*")
			if rec.Code != tt.status {
				t.Fatalf("status = %d, want %d", rec.Code, tt.status)
			}
			if cc := rec.Header().Get("Cache-Control"); cc != "no-store" {
				t.Fatalf("cache-control = %q", cc)
			}
			if etag := rec.Header().Get("ETag"); etag != "" {
				t.Fatalf("etag = %q", etag)
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
			if body["binary"] != tt.binary ||
				body["content"] != tt.content ||
				body["truncated"] != false {
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

func Test_API_Summaries(t *testing.T) {
	_, h := newServer(t)
	repos := decode(t, get(h, "/api/repos", nil))["repos"].([]any)[0].(map[string]any)
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
				"defaultBranch",
				"lastCommit",
				"latestTag",
				"branchCount",
				"tagCount",
				"activity",
			},
		},
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
