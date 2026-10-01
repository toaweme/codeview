package api

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
)

// tagger derives a response's entity tag from the request alone, before any git work.
// An empty tag or an error leaves the response untagged, and the handler reports the error.
type tagger func(h *handler, r *http.Request) (string, error)

// everyRepo tags responses that summarize the whole served set.
func everyRepo(h *handler, r *http.Request) (string, error) {
	return h.store.ListFingerprint(r.Context())
}

// oneRepo tags responses read from the repository in the repo parameter.
// When every named parameter holds a full commit hash the response can never change,
// so the hashes alone tag it and the refs are not even stat'ed.
func oneRepo(pinned ...string) tagger {
	return func(h *handler, r *http.Request) (string, error) {
		name := strings.Trim(r.URL.Query().Get("repo"), "/")
		if name == "" {
			return "", nil
		}
		shas := make([]string, 0, len(pinned))
		for _, p := range pinned {
			v := r.URL.Query().Get(p)
			if p == "cursor" && v != "" {
				// a history cursor starts at the commit its first page read
				// a malformed one pins nothing and the handler rejects it
				c, _ := parseCursor(v)
				v = c.start
			}
			if !isFullHash(v) {
				shas = nil
				break
			}
			shas = append(shas, v)
		}
		if len(pinned) > 0 && len(shas) == len(pinned) {
			// Open still checks the repository is served, so hiding it stops revalidation
			if _, err := h.store.Open(r.Context(), name); err != nil {
				return "", err
			}
			return "sha:" + strings.Join(shas, ","), nil
		}
		return h.store.Fingerprint(r.Context(), name)
	}
}

// historyTag pins a log page by its cursor, or by a hash in ref on the first page.
func historyTag(h *handler, r *http.Request) (string, error) {
	if r.URL.Query().Get("cursor") != "" {
		return oneRepo("cursor")(h, r)
	}
	return oneRepo("ref")(h, r)
}

func isFullHash(s string) bool {
	if len(s) != 40 && len(s) != 64 {
		return false
	}
	for _, c := range s {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return false
		}
	}
	return true
}

// revalidated answers with 304 when the client already holds the response tag names,
// and otherwise tags the response so the next request can revalidate it.
func (h *handler) revalidated(tag tagger, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		key, err := tag(h, r)
		if err != nil || key == "" {
			next(w, r)
			return
		}
		sum := sha256.Sum256([]byte(h.build + "\x00" + r.URL.RequestURI() + "\x00" + key))
		// weak, since a proxy may compress the body without changing what it means
		etag := `W/"` + hex.EncodeToString(sum[:12]) + `"`
		w.Header().Set("ETag", etag)
		if matches(r.Header.Get("If-None-Match"), etag) {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		next(w, r)
	}
}

// matches applies the weak comparison If-None-Match calls for to a list of tags or "*".
func matches(header, etag string) bool {
	want := strings.TrimPrefix(etag, "W/")
	for candidate := range strings.SplitSeq(header, ",") {
		candidate = strings.TrimSpace(candidate)
		if candidate == "*" || strings.TrimPrefix(candidate, "W/") == want {
			return true
		}
	}
	return false
}

// revalidate makes every API response revalidate before reuse and stay out of shared caches,
// since one URL answers differently whenever a branch moves and private repositories may be served.
// It drops the tag from anything but a success so an error is never revalidated as current.
func revalidate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "private, no-cache")
		next.ServeHTTP(&untagOnError{ResponseWriter: w}, r)
	})
}

type untagOnError struct {
	http.ResponseWriter
	wrote bool
}

var _ http.ResponseWriter = (*untagOnError)(nil)

func (u *untagOnError) WriteHeader(code int) {
	if !u.wrote {
		u.wrote = true
		if code != http.StatusOK && code != http.StatusNotModified {
			u.Header().Del("ETag")
		}
	}
	u.ResponseWriter.WriteHeader(code)
}

func (u *untagOnError) Write(b []byte) (int, error) {
	if !u.wrote {
		u.WriteHeader(http.StatusOK)
	}
	return u.ResponseWriter.Write(b)
}

// Unwrap lets http.ResponseController reach the underlying writer's flush and deadlines.
func (u *untagOnError) Unwrap() http.ResponseWriter { return u.ResponseWriter }
