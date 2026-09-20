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

type commitResponse struct {
	Commit git.Commit     `json:"commit"`
	Files  []git.FileDiff `json:"files"`
}

type compareResponse struct {
	Base      string `json:"base"`
	Head      string `json:"head"`
	MergeBase string `json:"mergeBase"`
	Ahead     int    `json:"ahead"`
	Behind    int    `json:"behind"`
	Diverged  bool   `json:"diverged"`
	// Boundary is excluded from Commits and nil without a common ancestor.
	Boundary *git.Commit    `json:"boundary"`
	Commits  []git.Commit   `json:"commits"`
	Files    []git.FileDiff `json:"files"`
}

type blameResponse struct {
	Ranges []git.BlameRange `json:"ranges"`
}
