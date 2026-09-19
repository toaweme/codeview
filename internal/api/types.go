package api

import "github.com/toaweme/codeview/internal/git"

type reposResponse struct {
	Repos []git.RepoSummary `json:"repos"`
}

type readme struct {
	Path    string `json:"path"`
	Content string `json:"content"`
	HTML    string `json:"html,omitempty"`
}

type treeResponse struct {
	Ref     string          `json:"ref"`
	Commit  string          `json:"commit"`
	Path    string          `json:"path"`
	Entries []git.TreeEntry `json:"entries"`
	Readme  *readme         `json:"readme,omitempty"`
}

type blobResponse struct {
	Path      string  `json:"path"`
	Size      int64   `json:"size"`
	Binary    bool    `json:"binary"`
	Truncated bool    `json:"truncated"`
	Content   *string `json:"content,omitempty"`
}

type renderResponse struct {
	Path string `json:"path"`
	HTML string `json:"html"`
}

type logResponse struct {
	Commits []git.Commit `json:"commits"`
	Next    string       `json:"next"`
	// Partial means an author-date filter stopped scanning early.
	Partial bool `json:"partial,omitempty"`
}
