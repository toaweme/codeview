// Package webui serves the single-page UI.
package webui

import (
	"errors"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

const notBuilt = "the UI is not built, run `task build`\n"

// FS returns the UI build under ui/dist inside embedded.
func FS(embedded fs.FS) (fs.FS, error) {
	return fs.Sub(embedded, "ui/dist")
}

// Handler serves files and falls back to index.html for client routes.
func Handler(files fs.FS) http.Handler {
	fileServer := http.FileServerFS(files)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if name != "" && name != "index.html" {
			if st, err := fs.Stat(files, name); err == nil && !st.IsDir() {
				if strings.HasPrefix(name, "assets/") {
					// vite fingerprints everything under assets/
					w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				}
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		index, err := fs.ReadFile(files, "index.html")
		if errors.Is(err, fs.ErrNotExist) {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(notBuilt))
			return
		}
		if err != nil {
			http.Error(w, "failed to read index.html", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		// index.html names the current asset hashes
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(index)
	})
}
