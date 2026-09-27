package webui_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/toaweme/codeview/internal/webui"
)

func Test_Handler(t *testing.T) {
	built := fstest.MapFS{
		"index.html":      {Data: []byte("<html>app</html>")},
		"assets/app-1.js": {Data: []byte("console.log(1)")},
		"favicon.svg":     {Data: []byte("<svg/>")},
	}
	tests := []struct {
		name   string
		files  fstest.MapFS
		path   string
		status int
		body   string
		cache  string
	}{
		{"index", built, "/", 200, "<html>app</html>", "no-store"},
		{"index by name", built, "/index.html", 200, "<html>app</html>", "no-store"},
		{"client route", built, "/acme/widgets/tree/main/src", 200, "<html>app</html>", "no-store"},
		{"asset", built, "/assets/app-1.js", 200, "console.log(1)", "public, max-age=31536000, immutable"},
		{"static file", built, "/favicon.svg", 200, "<svg/>", ""},
		{"not built", fstest.MapFS{}, "/", 503, "task build", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			webui.Handler(tt.files).ServeHTTP(
				rec,
				httptest.NewRequest(http.MethodGet, tt.path, nil),
			)
			if rec.Code != tt.status || !strings.Contains(rec.Body.String(), tt.body) {
				t.Fatalf("got %d %q", rec.Code, rec.Body.String())
			}
			if rec.Header().Get("Cache-Control") != tt.cache {
				t.Fatalf("cache-control = %q", rec.Header().Get("Cache-Control"))
			}
		})
	}
}
