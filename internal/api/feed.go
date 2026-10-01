package api

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/toaweme/http/server"

	"github.com/toaweme/codeview/internal/git"
)

// parseFeed reads org, repeated repo, since, versions, author, message, cursor and limit.
func parseFeed(r *http.Request) (git.FeedQuery, error) {
	q := r.URL.Query()
	since, err := parseDate("since", q.Get("since"), false)
	if err != nil {
		return git.FeedQuery{}, err
	}
	feed := git.FeedQuery{
		Org:     q.Get("org"),
		Repos:   q["repo"],
		Since:   since,
		Author:  strings.TrimSpace(q.Get("author")),
		Message: strings.TrimSpace(q.Get("message")),
		Cursor:  q.Get("cursor"),
	}
	for _, v := range []string{feed.Author, feed.Message} {
		if strings.ContainsAny(v, "\x00\n\r") {
			return git.FeedQuery{}, fmt.Errorf("filter %q contains a control character: %w", v, git.ErrInvalidArgument)
		}
	}
	if v := q.Get("versions"); v != "" {
		feed.Versions, err = strconv.ParseBool(v)
		if err != nil {
			return git.FeedQuery{}, fmt.Errorf("versions %q is not a boolean: %w", v, git.ErrInvalidArgument)
		}
	}
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n <= 0 {
			return git.FeedQuery{}, fmt.Errorf("limit %q is not a positive number: %w", v, git.ErrInvalidArgument)
		}
		feed.Limit = n
	}
	return feed, nil
}

func (h *handler) activityCommits(w http.ResponseWriter, r *http.Request) {
	q, err := parseFeed(r)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	feed, err := h.store.Commits(r.Context(), q)
	if err != nil {
		h.fail(w, r, fmt.Errorf("failed to read recent commits: %w", err))
		return
	}
	h.logFailed(r, feed.Failed)
	server.WriteJSON(w, http.StatusOK, feed)
}

func (h *handler) activityReleases(w http.ResponseWriter, r *http.Request) {
	q, err := parseFeed(r)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	feed, err := h.store.Releases(r.Context(), q)
	if err != nil {
		h.fail(w, r, fmt.Errorf("failed to read releases: %w", err))
		return
	}
	h.logFailed(r, feed.Failed)
	server.WriteJSON(w, http.StatusOK, feed)
}

// logFailed records what the response only summarizes, since its causes can name filesystem paths.
func (h *handler) logFailed(r *http.Request, failed []git.RepoFailure) {
	for _, f := range failed {
		h.logger.Error("api.repo.skipped", "path", r.URL.Path, "repo", f.Repo, "error", f.Cause)
	}
}
