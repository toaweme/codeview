// Package git reads bare repositories for the code view.
package git

import (
	"context"
	"errors"
	"io"
	"time"
)

var (
	ErrNotFound        = errors.New("not found")
	ErrInvalidArgument = errors.New("invalid argument")
)

// Store discovers repositories and opens them by name.
type Store interface {
	List(ctx context.Context) ([]RepoSummary, error)
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
}

// RepoInfo summarises a repository for listings.
type RepoInfo struct {
	Name          string    `json:"name"`
	Description   string    `json:"description"`
	DefaultBranch string    `json:"defaultBranch"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

const ActivityWeeks = 12

type RepoSummary struct {
	RepoInfo
	LastCommit  *CommitSummary `json:"lastCommit"`
	LatestTag   *Tag           `json:"latestTag"`
	BranchCount int            `json:"branchCount"`
	TagCount    int            `json:"tagCount"`
	// Activity holds weekly commit counts on the default branch, oldest first.
	Activity []int `json:"activity"`
}

type CommitSummary struct {
	Hash    string    `json:"hash"`
	Subject string    `json:"subject"`
	Author  Signature `json:"author"`
}

// Tag is peeled to its commit. TaggedAt is the tagger date, or the commit date for a lightweight tag.
type Tag struct {
	Name     string    `json:"name"`
	Commit   string    `json:"commit"`
	TaggedAt time.Time `json:"taggedAt"`
}

type Ref struct {
	Name      string    `json:"name"`
	Commit    string    `json:"commit"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Refs struct {
	Default  string `json:"default"`
	Branches []Ref  `json:"branches"`
	Tags     []Ref  `json:"tags"`
}

type EntryType string

const (
	EntryTree      EntryType = "tree"
	EntryBlob      EntryType = "blob"
	EntrySymlink   EntryType = "symlink"
	EntrySubmodule EntryType = "submodule"
)

type TreeEntry struct {
	Name string    `json:"name"`
	Path string    `json:"path"`
	Type EntryType `json:"type"`
	Size int64     `json:"size"`
	Mode string    `json:"mode"`
}

type Blob struct {
	Path      string
	Size      int64
	Data      []byte
	Binary    bool
	Truncated bool
}

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

type DateField string

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

type Bucket string

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

type Signature struct {
	Name  string    `json:"name"`
	Email string    `json:"email"`
	Date  time.Time `json:"date"`
}

type Commit struct {
	Hash      string    `json:"hash"`
	Parents   []string  `json:"parents"`
	Author    Signature `json:"author"`
	Committer Signature `json:"committer"`
	Subject   string    `json:"subject"`
	Body      string    `json:"body"`
}
