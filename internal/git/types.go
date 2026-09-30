// Package git reads the repositories a Locator finds, bare or working copies.
package git

import (
	"context"
	"errors"
	"fmt"
	"io"
	"time"
)

var (
	// ErrNotFound reports a repository, ref or path that does not exist.
	ErrNotFound = errors.New("not found")
	// ErrInvalidArgument reports a malformed name, rev, path or query.
	ErrInvalidArgument = errors.New("invalid argument")
)

// Location is a repository found on disk.
type Location struct {
	// Name identifies the repository in URLs, such as "github.com/toaweme/cli".
	Name   string
	GitDir string
	// WorkTree marks a working copy, whose GitDir is its .git folder.
	WorkTree bool
	// Public marks a repository whose git dir holds git-daemon-export-ok.
	Public bool
}

// Locator finds the repositories a Store serves.
type Locator interface {
	Locate(ctx context.Context) ([]Location, error)
}

// Mode picks which located repositories a Store serves.
type Mode string

const (
	// ModePublic serves only public repositories.
	ModePublic Mode = "public"
	// ModeAll serves every located repository.
	ModeAll Mode = "all"
)

// ParseMode rejects anything but "public" and "all".
func ParseMode(s string) (Mode, error) {
	switch m := Mode(s); m {
	case ModePublic, ModeAll:
		return m, nil
	}
	return "", fmt.Errorf("mode %q is not public or all: %w", s, ErrInvalidArgument)
}

// Store serves located repositories and opens them by name.
type Store interface {
	List(ctx context.Context) ([]RepoSummary, error)
	Activity(ctx context.Context, q ActivityQuery) (Activity, error)
	Open(ctx context.Context, name string) (Repo, error)
	Close() error
}

// Repo reads one repository. Methods taking a commit expect a full hash from Resolve.
type Repo interface {
	Name() string
	Info(ctx context.Context) (RepoInfo, error)
	Refs(ctx context.Context) (Refs, error)
	// Resolve resolves an empty rev to the default branch.
	Resolve(ctx context.Context, rev string) (string, error)
	Tree(ctx context.Context, commit, path string) ([]TreeEntry, error)
	Blob(ctx context.Context, commit, path string, limit int64) (Blob, error)
	OpenBlob(ctx context.Context, commit, path string) (io.ReadCloser, int64, error)
	Log(ctx context.Context, q LogQuery) (History, error)
	CommitTimes(ctx context.Context, commit, path string, field DateField) ([]time.Time, error)
	Commit(ctx context.Context, hash string) (Commit, error)
	// Diff diffs head against the empty tree when base is empty.
	Diff(ctx context.Context, base, head string) ([]FileDiff, error)
	MergeBase(ctx context.Context, a, b string) (string, error)
	CountCommits(ctx context.Context, commit, exclude string, limit int) (int, error)
	Blame(ctx context.Context, commit, path string) ([]BlameRange, error)
}

// RepoInfo summarizes a repository for listings.
type RepoInfo struct {
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	DefaultBranch string    `json:"default_branch"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// ActivityWeeks and ContributorWeeks set how far back a RepoSummary looks.
const (
	ActivityWeeks    = 12
	ContributorWeeks = 4
)

// RepoSummary is one row of the repository listing.
type RepoSummary struct {
	RepoInfo
	WorkTree    bool           `json:"work_tree"`
	LastCommit  *CommitSummary `json:"last_commit"`
	LatestTag   *Tag           `json:"latest_tag"`
	BranchCount int            `json:"branch_count"`
	TagCount    int            `json:"tag_count"`
	// Activity holds weekly commit counts on the default branch, oldest first.
	Activity []int `json:"activity"`
	// Contributors lists the distinct lowercased author emails on the default branch
	// over the last ContributorWeeks, sorted, so an org can dedupe across repositories.
	Contributors []string `json:"contributors"`
}

// CommitSummary is the short form of a commit shown in listings.
type CommitSummary struct {
	Hash    string    `json:"hash"`
	Subject string    `json:"subject"`
	Author  Signature `json:"author"`
}

// Tag is peeled to its commit. TaggedAt is the tagger date, or the commit date for a lightweight tag.
type Tag struct {
	Name     string    `json:"name"`
	Commit   string    `json:"commit"`
	TaggedAt time.Time `json:"tagged_at"`
}

// ActivityQuery narrows activity to an org, or to one repository when Repo is set.
type ActivityQuery struct {
	Org   string
	Repo  string
	Limit int
}

// Activity holds the recent commits, tags and branches across repositories, newest first.
type Activity struct {
	Commits  []ActivityCommit `json:"commits"`
	Tags     []ActivityTag    `json:"tags"`
	Branches []ActivityBranch `json:"branches"`
}

// ActivityCommit is a commit in an activity feed, with the ref it was found on.
type ActivityCommit struct {
	Repo        string    `json:"repo"`
	Hash        string    `json:"hash"`
	Subject     string    `json:"subject"`
	Author      Signature `json:"author"`
	CommittedAt time.Time `json:"committed_at"`
	Ref         string    `json:"ref"`
}

// ActivityTag is a tag in an activity feed. Previous names the tag before it in the same repository.
type ActivityTag struct {
	Repo     string    `json:"repo"`
	Name     string    `json:"name"`
	Commit   string    `json:"commit"`
	TaggedAt time.Time `json:"tagged_at"`
	Previous string    `json:"previous"`
}

// ActivityBranch counts ahead and behind against the default branch.
type ActivityBranch struct {
	Repo      string    `json:"repo"`
	Name      string    `json:"name"`
	Commit    string    `json:"commit"`
	Subject   string    `json:"subject"`
	UpdatedAt time.Time `json:"updated_at"`
	Ahead     int       `json:"ahead"`
	Behind    int       `json:"behind"`
}

// Ref is a branch or a tag peeled to its commit.
type Ref struct {
	Name      string    `json:"name"`
	Commit    string    `json:"commit"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Refs lists a repository's branches and tags. Default names the default branch.
type Refs struct {
	Default  string `json:"default"`
	Branches []Ref  `json:"branches"`
	Tags     []Ref  `json:"tags"`
}

// EntryType is the kind of a tree entry.
type EntryType string

// Tree entry kinds.
const (
	EntryTree      EntryType = "tree"
	EntryBlob      EntryType = "blob"
	EntrySymlink   EntryType = "symlink"
	EntrySubmodule EntryType = "submodule"
)

// TreeEntry is one child of a tree. Mode is the git file mode, such as "100644".
type TreeEntry struct {
	Name string    `json:"name"`
	Path string    `json:"path"`
	Type EntryType `json:"type"`
	Size int64     `json:"size"`
	Mode string    `json:"mode"`
}

// Blob is file content read up to a limit. Truncated marks content cut at that limit.
type Blob struct {
	Path      string
	Size      int64
	Data      []byte
	Binary    bool
	Truncated bool
}

// LogQuery pages through the history reachable from Commit and not from Exclude.
type LogQuery struct {
	Commit  string
	Exclude string
	// Path follows renames when it names a file.
	Path   string
	Filter LogFilter
	// Skip counts commits that passed Filter.
	Skip  int
	Limit int
	// MaxScan defaults to MaxFilterScan.
	MaxScan int
}

// DateField picks the author or the committer date.
type DateField string

// Date fields a log filter or histogram reads.
const (
	DateAuthor    DateField = "author"
	DateCommitter DateField = "committer"
)

// MaxFilterScan caps the commits an author-date filter reads per page,
// since git can only bound the walk by committer date.
const MaxFilterScan = 20000

// LogFilter narrows history. Zero fields match everything and both dates are inclusive.
type LogFilter struct {
	Since     time.Time
	Until     time.Time
	DateField DateField
	Author    string
	Grep      string
}

// History reports Partial when an author-date filter hit MaxFilterScan.
type History struct {
	Commits []Commit
	Partial bool
}

// Bucket is the width of a histogram bucket.
type Bucket string

// Histogram bucket widths.
const (
	BucketDay   Bucket = "day"
	BucketWeek  Bucket = "week"
	BucketMonth Bucket = "month"
)

// HistogramQuery bounds default to the first and last commit.
type HistogramQuery struct {
	Bucket Bucket
	Since  time.Time
	Until  time.Time
}

// HistogramBucket counts the commits from Start up to the next bucket.
type HistogramBucket struct {
	Start time.Time `json:"start"`
	Count int       `json:"count"`
}

// Histogram includes empty buckets, oldest first.
type Histogram struct {
	Buckets []HistogramBucket `json:"buckets"`
	First   *time.Time        `json:"first"`
	Last    *time.Time        `json:"last"`
}

// Signature is an author or committer.
type Signature struct {
	Name  string    `json:"name"`
	Email string    `json:"email"`
	Date  time.Time `json:"date"`
}

// Commit is a parsed commit object.
type Commit struct {
	Hash      string    `json:"hash"`
	Parents   []string  `json:"parents"`
	Author    Signature `json:"author"`
	Committer Signature `json:"committer"`
	Subject   string    `json:"subject"`
	Body      string    `json:"body"`
}

// FileStatus is how a diff changed a file.
type FileStatus string

// File statuses a diff reports.
const (
	StatusAdded    FileStatus = "added"
	StatusModified FileStatus = "modified"
	StatusDeleted  FileStatus = "deleted"
	StatusRenamed  FileStatus = "renamed"
	StatusCopied   FileStatus = "copied"
)

// FileDiff counts every added and deleted line even when Hunks are truncated.
type FileDiff struct {
	Path      string     `json:"path"`
	OldPath   string     `json:"old_path"`
	Status    FileStatus `json:"status"`
	Additions int        `json:"additions"`
	Deletions int        `json:"deletions"`
	Binary    bool       `json:"binary"`
	Truncated bool       `json:"truncated"`
	Hunks     []Hunk     `json:"hunks"`
}

// Hunk is one block of a unified diff.
type Hunk struct {
	OldStart int    `json:"old_start"`
	OldLines int    `json:"old_lines"`
	NewStart int    `json:"new_start"`
	NewLines int    `json:"new_lines"`
	Header   string `json:"header"`
	Lines    []Line `json:"lines"`
}

// LineType marks a diff line as context, added or deleted.
type LineType string

// Diff line types.
const (
	LineContext LineType = "context"
	LineAdd     LineType = "add"
	LineDel     LineType = "del"
)

// Line is one diff line. Old and New hold its line numbers on each side, nil where it has none.
type Line struct {
	Type LineType `json:"type"`
	Old  *int     `json:"old"`
	New  *int     `json:"new"`
	Text string   `json:"text"`
}

// BlameCommit is the commit a blame range points at.
type BlameCommit struct {
	Hash    string    `json:"hash"`
	Subject string    `json:"subject"`
	Author  Signature `json:"author"`
}

// BlameRange covers the 1-based inclusive lines Start to End.
type BlameRange struct {
	Start  int         `json:"start"`
	End    int         `json:"end"`
	Commit BlameCommit `json:"commit"`
}
