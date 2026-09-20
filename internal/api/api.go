// Package api serves the read-only JSON API behind the UI.
package api

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path"
	"strconv"
	"strings"

	"github.com/toaweme/http/server"

	"github.com/toaweme/codeview/internal/git"
	"github.com/toaweme/codeview/internal/markdown"
)

const (
	maxBlobBytes      = 2 << 20
	maxReadmeBytes    = 512 << 10
	defaultLogLimit   = 50
	maxLogLimit       = 500
	maxCompareCommits = 250
	compareDirect     = "direct"
)

// Handler serves the API over a git store.
type Handler struct {
	store      git.Store
	markdown   markdown.Renderer
	logger     server.Logger
	histograms *histogramCache
}

func New(store git.Store, md markdown.Renderer, logger server.Logger) *Handler {
	return &Handler{store: store, markdown: md, logger: logger, histograms: newHistogramCache()}
}

func (h *Handler) Routes() []server.Route {
	get := func(pattern string, fn http.HandlerFunc) server.Route {
		return server.Route{Method: http.MethodGet, Pattern: pattern, Handler: noStore(fn)}
	}
	return []server.Route{
		get("/api/repos", h.repos),
		get("/api/activity", h.activity),
		get("/api/refs", h.refs),
		get("/api/tree", h.tree),
		get("/api/blob", h.blob),
		get("/api/raw", h.raw),
		get("/api/render", h.render),
		get("/api/log", h.log),
		get("/api/log/histogram", h.histogram),
		get("/api/commit", h.commit),
		get("/api/compare", h.compare),
		get("/api/blame", h.blame),
		get("/api/*", h.notFound),
	}
}

func noStore(fn http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		fn(w, r)
	}
}

func (h *Handler) notFound(w http.ResponseWriter, r *http.Request) {
	server.WriteError(w, http.StatusNotFound, fmt.Errorf("endpoint %q does not exist", r.URL.Path))
}

// fail hides unexpected error detail, which can hold filesystem paths.
func (h *Handler) fail(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, git.ErrNotFound):
		server.WriteError(w, http.StatusNotFound, err)
	case errors.Is(err, git.ErrInvalidArgument):
		server.WriteBadRequest(w, err)
	case errors.Is(err, context.Canceled):
		// the client went away
	default:
		h.logger.Error("api.failed", "path", r.URL.Path, "query", r.URL.RawQuery, "error", err)
		server.WriteError(w, http.StatusInternalServerError, errors.New("internal error"))
	}
}

func (h *Handler) openRepo(r *http.Request) (git.Repo, error) {
	name := strings.Trim(r.URL.Query().Get("repo"), "/")
	if name == "" {
		return nil, fmt.Errorf("the repo parameter is required: %w", git.ErrInvalidArgument)
	}
	repo, err := h.store.Open(r.Context(), name)
	if err != nil {
		return nil, fmt.Errorf("failed to open repository %q: %w", name, err)
	}
	return repo, nil
}

type resolved struct {
	repo   git.Repo
	ref    string
	commit string
}

func (res resolved) document(p string) markdown.Document {
	return markdown.Document{Repo: res.repo.Name(), Commit: res.commit, Path: p}
}

func (h *Handler) resolve(r *http.Request) (resolved, error) {
	repo, err := h.openRepo(r)
	if err != nil {
		return resolved{}, err
	}
	ref := r.URL.Query().Get("ref")
	commit, err := repo.Resolve(r.Context(), ref)
	if err != nil {
		return resolved{}, fmt.Errorf("failed to resolve ref %q: %w", ref, err)
	}
	if ref == "" {
		info, err := repo.Info(r.Context())
		if err != nil {
			return resolved{}, fmt.Errorf("failed to read repository %q: %w", repo.Name(), err)
		}
		ref = info.DefaultBranch
	}
	return resolved{repo: repo, ref: ref, commit: commit}, nil
}

func (h *Handler) repos(w http.ResponseWriter, r *http.Request) {
	repos, err := h.store.List(r.Context())
	if err != nil {
		h.fail(w, r, fmt.Errorf("failed to list repositories: %w", err))
		return
	}
	if repos == nil {
		repos = []git.RepoSummary{}
	}
	server.WriteJSON(w, http.StatusOK, reposResponse{Repos: repos})
}

func (h *Handler) activity(w http.ResponseWriter, r *http.Request) {
	q := git.ActivityQuery{Org: r.URL.Query().Get("org"), Limit: git.DefaultActivityLimit}
	if v := r.URL.Query().Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n <= 0 {
			h.fail(
				w,
				r,
				fmt.Errorf("limit %q is not a positive number: %w", v, git.ErrInvalidArgument),
			)
			return
		}
		q.Limit = min(n, git.MaxActivityLimit)
	}
	act, err := h.store.Activity(r.Context(), q)
	if err != nil {
		h.fail(w, r, fmt.Errorf("failed to read recent activity: %w", err))
		return
	}
	server.WriteJSON(w, http.StatusOK, act)
}

func (h *Handler) refs(w http.ResponseWriter, r *http.Request) {
	repo, err := h.openRepo(r)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	refs, err := repo.Refs(r.Context())
	if err != nil {
		h.fail(w, r, fmt.Errorf("failed to list refs of %q: %w", repo.Name(), err))
		return
	}
	server.WriteJSON(w, http.StatusOK, refs)
}

func (h *Handler) tree(w http.ResponseWriter, r *http.Request) {
	res, err := h.resolve(r)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	dir := strings.Trim(r.URL.Query().Get("path"), "/")
	entries, err := res.repo.Tree(r.Context(), res.commit, dir)
	if err != nil {
		h.fail(w, r, fmt.Errorf("failed to list %q: %w", dir, err))
		return
	}
	if entries == nil {
		entries = []git.TreeEntry{}
	}
	resp := treeResponse{Ref: res.ref, Commit: res.commit, Path: dir, Entries: entries}
	if p := pickReadme(entries); p != "" {
		b, err := res.repo.Blob(r.Context(), res.commit, p, maxReadmeBytes)
		if err != nil {
			h.fail(w, r, fmt.Errorf("failed to read %q: %w", p, err))
			return
		}
		if !b.Binary {
			resp.Readme = &readme{Path: p, Content: strings.ToValidUTF8(string(b.Data), "�")}
			if markdown.IsMarkdown(p) {
				html, err := h.markdown.Render([]byte(resp.Readme.Content), res.document(p))
				if err != nil {
					h.fail(w, r, fmt.Errorf("failed to render %q: %w", p, err))
					return
				}
				resp.Readme.HTML = html
			}
		}
	}
	server.WriteJSON(w, http.StatusOK, resp)
}

var readmeRank = map[string]int{
	"readme.md":       0,
	"readme.markdown": 1,
	"readme":          2,
	"readme.txt":      3,
	"readme.rst":      4,
}

func pickReadme(entries []git.TreeEntry) string {
	best, bestRank := "", len(readmeRank)+1
	for _, e := range entries {
		if e.Type != git.EntryBlob {
			continue
		}
		lower := strings.ToLower(e.Name)
		if !strings.HasPrefix(lower, "readme") {
			continue
		}
		rank, ok := readmeRank[lower]
		if !ok {
			rank = len(readmeRank)
		}
		if rank < bestRank {
			best, bestRank = e.Path, rank
		}
	}
	return best
}

func (h *Handler) blob(w http.ResponseWriter, r *http.Request) {
	res, err := h.resolve(r)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	p := r.URL.Query().Get("path")
	b, err := res.repo.Blob(r.Context(), res.commit, p, maxBlobBytes)
	if err != nil {
		h.fail(w, r, fmt.Errorf("failed to read %q: %w", p, err))
		return
	}
	resp := blobResponse{Path: b.Path, Size: b.Size, Binary: b.Binary, Truncated: b.Truncated}
	if !b.Binary {
		content := strings.ToValidUTF8(string(b.Data), "�")
		resp.Content = &content
	}
	server.WriteJSON(w, http.StatusOK, resp)
}

func (h *Handler) render(w http.ResponseWriter, r *http.Request) {
	p := r.URL.Query().Get("path")
	if !markdown.IsMarkdown(p) {
		h.fail(w, r, fmt.Errorf("path %q is not a markdown file: %w", p, git.ErrInvalidArgument))
		return
	}
	res, err := h.resolve(r)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	b, err := res.repo.Blob(r.Context(), res.commit, p, maxBlobBytes)
	if err != nil {
		h.fail(w, r, fmt.Errorf("failed to read %q: %w", p, err))
		return
	}
	html, err := h.markdown.Render(
		[]byte(strings.ToValidUTF8(string(b.Data), "�")),
		res.document(b.Path),
	)
	if err != nil {
		h.fail(w, r, fmt.Errorf("failed to render %q: %w", p, err))
		return
	}
	server.WriteJSON(w, http.StatusOK, renderResponse{Path: b.Path, HTML: html})
}

// rawTypes are served as themselves so repository HTML never runs on this origin.
var rawTypes = map[string]bool{
	"image/png":                true,
	"image/jpeg":               true,
	"image/gif":                true,
	"image/webp":               true,
	"image/avif":               true,
	"image/svg+xml":            true,
	"image/x-icon":             true,
	"image/vnd.microsoft.icon": true,
	"image/bmp":                true,
	"application/pdf":          true,
	"audio/mpeg":               true,
	"audio/ogg":                true,
	"audio/wav":                true,
	"video/mp4":                true,
	"video/webm":               true,
	"font/woff":                true,
	"font/woff2":               true,
}

func (h *Handler) raw(w http.ResponseWriter, r *http.Request) {
	res, err := h.resolve(r)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	p := r.URL.Query().Get("path")
	rc, size, err := res.repo.OpenBlob(r.Context(), res.commit, p)
	if err != nil {
		h.fail(w, r, fmt.Errorf("failed to open %q: %w", p, err))
		return
	}
	defer rc.Close()
	br := bufio.NewReaderSize(rc, 8192)
	head, _ := br.Peek(8000)

	ctype := mime.TypeByExtension(path.Ext(p))
	if base, _, _ := strings.Cut(ctype, ";"); !rawTypes[base] {
		ctype = "text/plain; charset=utf-8"
		if git.IsBinary(head) {
			ctype = "application/octet-stream"
		}
	}
	w.Header().Set("Content-Type", ctype)
	w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	// an SVG opened directly must not run its scripts on this origin
	w.Header().Set(
		"Content-Security-Policy",
		"default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
	)
	w.Header().Set(
		"Content-Disposition",
		mime.FormatMediaType("inline", map[string]string{"filename": path.Base(p)}),
	)
	w.WriteHeader(http.StatusOK)
	if _, err := io.Copy(w, br); err != nil && !errors.Is(err, context.Canceled) {
		h.logger.Debug("api.raw.aborted", "repo", res.repo.Name(), "path", p, "error", err)
	}
}

func (h *Handler) commit(w http.ResponseWriter, r *http.Request) {
	repo, err := h.openRepo(r)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	hash := r.URL.Query().Get("hash")
	if hash == "" {
		h.fail(w, r, fmt.Errorf("the hash parameter is required: %w", git.ErrInvalidArgument))
		return
	}
	c, err := repo.Commit(r.Context(), hash)
	if err != nil {
		h.fail(w, r, fmt.Errorf("failed to read commit %q: %w", hash, err))
		return
	}
	base := ""
	if len(c.Parents) > 0 {
		base = c.Parents[0]
	}
	files, err := repo.Diff(r.Context(), base, c.Hash)
	if err != nil {
		h.fail(w, r, fmt.Errorf("failed to diff commit %q: %w", hash, err))
		return
	}
	server.WriteJSON(w, http.StatusOK, commitResponse{Commit: c, Files: files})
}

func (h *Handler) compare(w http.ResponseWriter, r *http.Request) {
	repo, err := h.openRepo(r)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	q := r.URL.Query()
	baseRef, headRef := q.Get("base"), q.Get("head")
	if baseRef == "" || headRef == "" {
		h.fail(
			w,
			r,
			fmt.Errorf("the base and head parameters are required: %w", git.ErrInvalidArgument),
		)
		return
	}
	base, err := repo.Resolve(r.Context(), baseRef)
	if err != nil {
		h.fail(w, r, fmt.Errorf("failed to resolve base %q: %w", baseRef, err))
		return
	}
	head, err := repo.Resolve(r.Context(), headRef)
	if err != nil {
		h.fail(w, r, fmt.Errorf("failed to resolve head %q: %w", headRef, err))
		return
	}
	mode := q.Get("mode")
	if mode != "" && mode != compareDirect {
		h.fail(
			w,
			r,
			fmt.Errorf("compare mode %q is not supported: %w", mode, git.ErrInvalidArgument),
		)
		return
	}
	mergeBase, err := repo.MergeBase(r.Context(), base, head)
	if err != nil {
		h.fail(w, r, fmt.Errorf("failed to compare %q with %q: %w", baseRef, headRef, err))
		return
	}
	commits, err := repo.Log(
		r.Context(),
		git.LogQuery{Commit: head, Exclude: base, Limit: maxCompareCommits},
	)
	if err != nil {
		h.fail(
			w,
			r,
			fmt.Errorf("failed to list the commits between %q and %q: %w", baseRef, headRef, err),
		)
		return
	}
	ahead, err := repo.CountCommits(r.Context(), head, base, maxCompareCommits)
	if err != nil {
		h.fail(
			w,
			r,
			fmt.Errorf(
				"failed to count the commits of %q missing from %q: %w",
				headRef,
				baseRef,
				err,
			),
		)
		return
	}
	behind, err := repo.CountCommits(r.Context(), base, head, maxCompareCommits)
	if err != nil {
		h.fail(
			w,
			r,
			fmt.Errorf(
				"failed to count the commits of %q missing from %q: %w",
				baseRef,
				headRef,
				err,
			),
		)
		return
	}
	from := mergeBase
	if mode == compareDirect {
		from = base
	}
	files, err := repo.Diff(r.Context(), from, head)
	if err != nil {
		h.fail(w, r, fmt.Errorf("failed to diff %q with %q: %w", baseRef, headRef, err))
		return
	}
	resp := compareResponse{
		Base:      base,
		Head:      head,
		MergeBase: mergeBase,
		Ahead:     ahead,
		Behind:    behind,
		Diverged:  ahead > 0 && behind > 0,
		Commits:   commits.Commits,
		Files:     files,
	}
	if from != "" {
		boundary, err := repo.Commit(r.Context(), from)
		if err != nil {
			h.fail(w, r, fmt.Errorf("failed to read the starting commit %q: %w", from, err))
			return
		}
		resp.Boundary = &boundary
	}
	server.WriteJSON(w, http.StatusOK, resp)
}

func (h *Handler) blame(w http.ResponseWriter, r *http.Request) {
	res, err := h.resolve(r)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	p := r.URL.Query().Get("path")
	ranges, err := res.repo.Blame(r.Context(), res.commit, p)
	if err != nil {
		h.fail(w, r, fmt.Errorf("failed to blame %q: %w", p, err))
		return
	}
	server.WriteJSON(w, http.StatusOK, blameResponse{Ranges: ranges})
}
