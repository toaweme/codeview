package git

import (
	"bufio"
	"bytes"
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

// inlineBlobLimit keeps a slow client from holding the shared cat-file pipe.
const inlineBlobLimit = 1 << 20

type cliRepo struct {
	name string
	dir  string
	bin  string
	cat  *catFile
}

var _ Repo = (*cliRepo)(nil)

func newCLIRepo(name, dir, bin string, idle time.Duration) *cliRepo {
	r := &cliRepo{name: name, dir: dir, bin: bin}
	r.cat = newCatFile(func() *exec.Cmd {
		return r.command(context.Background(), "cat-file", "--batch-command")
	}, idle)
	return r
}

// gitEnv drops inherited GIT_* variables and user config so output is deterministic.
func gitEnv() []string {
	environ := os.Environ()
	env := make([]string, 0, len(environ)+4)
	for _, kv := range environ {
		if !strings.HasPrefix(kv, "GIT_") {
			env = append(env, kv)
		}
	}
	return append(
		env,
		"GIT_CONFIG_NOSYSTEM=1",
		"GIT_CONFIG_GLOBAL="+os.DevNull,
		"GIT_TERMINAL_PROMPT=0",
		"LC_ALL=C",
	)
}

func (r *cliRepo) command(ctx context.Context, args ...string) *exec.Cmd {
	full := append([]string{
		"--git-dir=" + r.dir,
		// mirrored and mounted repositories often belong to another user
		"-c", "safe.directory=*",
		"-c", "core.quotePath=false",
	}, args...)
	cmd := exec.CommandContext(ctx, r.bin, full...) //nolint:gosec // r.bin is the configured git executable and callers validate every argument
	cmd.Env = gitEnv()
	return cmd
}

func (r *cliRepo) run(ctx context.Context, args ...string) ([]byte, error) {
	cmd := r.command(ctx, args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		return out, fmt.Errorf(
			"failed to run git %s (%s): %w",
			args[0],
			strings.TrimSpace(stderr.String()),
			err,
		)
	}
	return out, nil
}

func (r *cliRepo) Name() string { return r.name }

func (r *cliRepo) Info(_ context.Context) (RepoInfo, error) {
	info := RepoInfo{Name: r.name}
	if b, err := os.ReadFile(filepath.Join(r.dir, "description")); err == nil {
		desc := strings.TrimSpace(string(b))
		if !strings.HasPrefix(desc, "Unnamed repository;") {
			info.Description = desc
		}
	}
	branch, err := r.defaultBranch()
	if err != nil {
		return info, err
	}
	info.DefaultBranch = branch
	if branch == "" {
		return info, nil
	}
	_, data, err := r.cat.Contents("refs/heads/"+branch+"^{commit}", -1)
	if errors.Is(err, errMissing) {
		return info, nil
	}
	if err != nil {
		return info, fmt.Errorf("failed to read the tip of %q: %w", branch, err)
	}
	info.UpdatedAt = committerTime(data)
	return info, nil
}

// defaultBranch prefers the branch origin/HEAD names, which a working copy keeps
// when its checkout moves, and falls back to the branch HEAD names.
func (r *cliRepo) defaultBranch() (string, error) {
	origin, err := os.ReadFile(filepath.Join(r.dir, "refs", "remotes", "origin", "HEAD"))
	if err == nil {
		target := strings.TrimSpace(string(origin))
		if ref, ok := strings.CutPrefix(target, "ref: refs/remotes/origin/"); ok && ref != "" {
			return ref, nil
		}
	}
	b, err := os.ReadFile(filepath.Join(r.dir, "HEAD"))
	if err != nil {
		return "", fmt.Errorf("failed to read HEAD: %w", err)
	}
	head := strings.TrimSpace(string(b))
	if ref, ok := strings.CutPrefix(head, "ref: refs/heads/"); ok {
		return ref, nil
	}
	return "", nil
}

func committerTime(raw []byte) time.Time {
	for line := range strings.SplitSeq(string(raw), "\n") {
		if line == "" {
			break
		}
		if rest, ok := strings.CutPrefix(line, "committer "); ok {
			fields := strings.Fields(rest)
			if len(fields) < 2 {
				return time.Time{}
			}
			return unixTime(fields[len(fields)-2], fields[len(fields)-1])
		}
	}
	return time.Time{}
}

func unixTime(sec, tz string) time.Time {
	s, err := strconv.ParseInt(sec, 10, 64)
	if err != nil {
		return time.Time{}
	}
	t := time.Unix(s, 0)
	if len(tz) == 5 {
		h, errH := strconv.Atoi(tz[1:3])
		m, errM := strconv.Atoi(tz[3:5])
		if errH == nil && errM == nil {
			offset := h*3600 + m*60
			if tz[0] == '-' {
				offset = -offset
			}
			return t.In(time.FixedZone("", offset))
		}
	}
	return t.UTC()
}

const refFormat = "%(refname)%00%(objectname)%00%(*objectname)%00%(committerdate:iso-strict)%00%(*committerdate:iso-strict)%00%(taggerdate:iso-strict)"

func (r *cliRepo) Refs(ctx context.Context) (Refs, error) {
	branch, err := r.defaultBranch()
	if err != nil {
		return Refs{}, err
	}
	out, err := r.run(ctx, "for-each-ref", "--format="+refFormat, "refs/heads", "refs/tags")
	if err != nil {
		return Refs{}, fmt.Errorf("failed to list refs: %w", err)
	}
	refs := Refs{Default: branch, Branches: []Ref{}, Tags: []Ref{}}
	for line := range strings.SplitSeq(string(out), "\n") {
		f := strings.Split(line, "\x00")
		if len(f) != 6 {
			continue
		}
		ref := Ref{Commit: f[1], UpdatedAt: parseISO(f[3])}
		if f[2] != "" {
			// annotated tag
			ref.Commit = f[2]
			ref.UpdatedAt = parseISO(f[4])
			if ref.UpdatedAt.IsZero() {
				ref.UpdatedAt = parseISO(f[5])
			}
		}
		if name, ok := strings.CutPrefix(f[0], "refs/heads/"); ok {
			ref.Name = name
			refs.Branches = append(refs.Branches, ref)
		} else if name, ok := strings.CutPrefix(f[0], "refs/tags/"); ok {
			ref.Name = name
			refs.Tags = append(refs.Tags, ref)
		}
	}
	newestFirst := func(list []Ref) {
		sort.SliceStable(list, func(i, j int) bool {
			if !list[i].UpdatedAt.Equal(list[j].UpdatedAt) {
				return list[i].UpdatedAt.After(list[j].UpdatedAt)
			}
			return list[i].Name < list[j].Name
		})
	}
	newestFirst(refs.Branches)
	newestFirst(refs.Tags)
	return refs, nil
}

func parseISO(s string) time.Time {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return time.Time{}
	}
	return t
}

func (r *cliRepo) Resolve(_ context.Context, rev string) (string, error) {
	var candidates []string
	var name, suffix string
	switch rev {
	case "":
		branch, err := r.defaultBranch()
		if err != nil {
			return "", err
		}
		if branch != "" {
			candidates = append(candidates, "refs/heads/"+branch)
		}
		candidates = append(candidates, "HEAD")
	default:
		var err error
		name, suffix, err = splitRev(rev)
		if err != nil {
			return "", err
		}
		switch {
		case name == "HEAD":
			candidates = []string{"HEAD"}
		case strings.HasPrefix(name, "refs/"):
			candidates = []string{name}
		default:
			candidates = []string{"refs/heads/" + name, "refs/tags/" + name}
			if isHash(name) {
				candidates = append(candidates, name)
			}
		}
	}
	for _, c := range candidates {
		info, err := r.cat.Info(c + suffix + "^{commit}")
		if errors.Is(err, errMissing) {
			continue
		}
		if err != nil {
			return "", fmt.Errorf("failed to resolve %q: %w", rev, err)
		}
		return info.OID, nil
	}
	return "", fmt.Errorf("ref %q does not exist: %w", rev, ErrNotFound)
}

func object(commit, path string) (string, error) {
	if !isHash(commit) {
		return "", fmt.Errorf("commit %q is not a hash: %w", commit, ErrInvalidArgument)
	}
	return commit + ":" + path, nil
}

func (r *cliRepo) Tree(_ context.Context, commit, path string) ([]TreeEntry, error) {
	path, err := cleanPath(path)
	if err != nil {
		return nil, err
	}
	obj, err := object(commit, path)
	if err != nil {
		return nil, err
	}
	info, data, err := r.cat.Contents(obj, -1)
	if errors.Is(err, errMissing) {
		return nil, fmt.Errorf("directory %q does not exist: %w", path, ErrNotFound)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to read directory %q: %w", path, err)
	}
	if info.Type != "tree" {
		return nil, fmt.Errorf("path %q is not a directory: %w", path, ErrInvalidArgument)
	}
	entries, oids, err := parseTree(data, len(info.OID)/2, path)
	if err != nil {
		return nil, fmt.Errorf("failed to parse directory %q: %w", path, err)
	}
	var (
		sized   []int
		objects []string
	)
	for i, e := range entries {
		if e.Type == EntryBlob || e.Type == EntrySymlink {
			sized = append(sized, i)
			objects = append(objects, oids[i])
		}
	}
	if len(objects) > 0 {
		infos, err := r.cat.Infos(objects)
		if err != nil {
			return nil, fmt.Errorf("failed to size the files in %q: %w", path, err)
		}
		for k, i := range sized {
			entries[i].Size = infos[k].Size
		}
	}
	sort.SliceStable(entries, func(i, j int) bool {
		di, dj := entries[i].Type == EntryTree, entries[j].Type == EntryTree
		if di != dj {
			return di
		}
		li, lj := strings.ToLower(entries[i].Name), strings.ToLower(entries[j].Name)
		if li != lj {
			return li < lj
		}
		return entries[i].Name < entries[j].Name
	})
	return entries, nil
}

// parseTree decodes entries of "<octal mode> <name>\0<binary oid>".
func parseTree(data []byte, oidLen int, dir string) ([]TreeEntry, []string, error) {
	var (
		entries []TreeEntry
		oids    []string
	)
	for len(data) > 0 {
		sp := bytes.IndexByte(data, ' ')
		if sp < 0 {
			return nil, nil, fmt.Errorf("failed to find an entry mode: %w", io.ErrUnexpectedEOF)
		}
		mode := string(data[:sp])
		data = data[sp+1:]
		nul := bytes.IndexByte(data, 0)
		if nul < 0 || len(data) < nul+1+oidLen {
			return nil, nil, fmt.Errorf("failed to find an entry name: %w", io.ErrUnexpectedEOF)
		}
		name := string(data[:nul])
		oid := hex.EncodeToString(data[nul+1 : nul+1+oidLen])
		data = data[nul+1+oidLen:]

		for len(mode) < 6 {
			mode = "0" + mode
		}
		e := TreeEntry{Name: name, Path: name, Mode: mode, Type: EntryBlob}
		if dir != "" {
			e.Path = dir + "/" + name
		}
		switch mode {
		case "040000":
			e.Type = EntryTree
		case "120000":
			e.Type = EntrySymlink
		case "160000":
			e.Type = EntrySubmodule
		}
		entries = append(entries, e)
		oids = append(oids, oid)
	}
	return entries, oids, nil
}

func (r *cliRepo) Blob(_ context.Context, commit, path string, limit int64) (Blob, error) {
	path, err := cleanPath(path)
	if err != nil {
		return Blob{}, err
	}
	if path == "" {
		return Blob{}, fmt.Errorf("the repository root is not a file: %w", ErrInvalidArgument)
	}
	obj, err := object(commit, path)
	if err != nil {
		return Blob{}, err
	}
	info, data, err := r.cat.Contents(obj, limit)
	if errors.Is(err, errMissing) {
		return Blob{}, fmt.Errorf("file %q does not exist: %w", path, ErrNotFound)
	}
	if err != nil {
		return Blob{}, fmt.Errorf("failed to read file %q: %w", path, err)
	}
	if info.Type != "blob" {
		return Blob{}, fmt.Errorf("path %q is not a file: %w", path, ErrInvalidArgument)
	}
	return Blob{
		Path:      path,
		Size:      info.Size,
		Data:      data,
		Binary:    IsBinary(data),
		Truncated: int64(len(data)) < info.Size,
	}, nil
}

// IsBinary applies git's heuristic of a NUL byte in the first 8000 bytes.
func IsBinary(data []byte) bool {
	if len(data) > 8000 {
		data = data[:8000]
	}
	return bytes.IndexByte(data, 0) >= 0
}

func (r *cliRepo) OpenBlob(ctx context.Context, commit, path string) (io.ReadCloser, int64, error) {
	path, err := cleanPath(path)
	if err != nil {
		return nil, 0, err
	}
	obj, err := object(commit, path)
	if err != nil {
		return nil, 0, err
	}
	info, err := r.cat.Info(obj)
	if errors.Is(err, errMissing) {
		return nil, 0, fmt.Errorf("file %q does not exist: %w", path, ErrNotFound)
	}
	if err != nil {
		return nil, 0, fmt.Errorf("failed to stat file %q: %w", path, err)
	}
	if info.Type != "blob" {
		return nil, 0, fmt.Errorf("path %q is not a file: %w", path, ErrInvalidArgument)
	}
	if info.Size <= inlineBlobLimit {
		_, data, err := r.cat.Contents(info.OID, -1)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to read file %q: %w", path, err)
		}
		return io.NopCloser(bytes.NewReader(data)), info.Size, nil
	}
	cmd := r.command(ctx, "cat-file", "blob", info.OID)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, 0, fmt.Errorf("failed to open the stream of file %q: %w", path, err)
	}
	if err := cmd.Start(); err != nil {
		return nil, 0, fmt.Errorf("failed to stream file %q: %w", path, err)
	}
	return &cmdReader{ReadCloser: stdout, cmd: cmd}, info.Size, nil
}

type cmdReader struct {
	io.ReadCloser
	cmd *exec.Cmd
}

func (c *cmdReader) Close() error {
	_ = c.ReadCloser.Close()
	_ = c.cmd.Process.Kill()
	_ = c.cmd.Wait()
	return nil
}

func (r *cliRepo) Commit(ctx context.Context, hash string) (Commit, error) {
	if !isHash(hash) {
		return Commit{}, fmt.Errorf("commit %q is not a hash: %w", hash, ErrInvalidArgument)
	}
	info, err := r.cat.Info(hash + "^{commit}")
	if errors.Is(err, errMissing) {
		return Commit{}, fmt.Errorf("commit %q does not exist: %w", hash, ErrNotFound)
	}
	if err != nil {
		return Commit{}, fmt.Errorf("failed to resolve commit %q: %w", hash, err)
	}
	out, err := r.run(
		ctx,
		"log",
		"--no-color",
		"-z",
		"--format="+logFormat,
		"-n",
		"1",
		"--end-of-options",
		info.OID,
		"--",
	)
	if err != nil {
		return Commit{}, fmt.Errorf("failed to read commit %q: %w", hash, err)
	}
	commits, err := parseLog(out)
	if err != nil {
		return Commit{}, fmt.Errorf("failed to parse commit %q: %w", hash, err)
	}
	if len(commits) != 1 {
		return Commit{}, fmt.Errorf("commit %q does not exist: %w", hash, ErrNotFound)
	}
	return commits[0], nil
}

func (r *cliRepo) MergeBase(ctx context.Context, a, b string) (string, error) {
	if !isHash(a) || !isHash(b) {
		return "", fmt.Errorf(
			"merge base of %q and %q needs two hashes: %w",
			a,
			b,
			ErrInvalidArgument,
		)
	}
	out, err := r.run(ctx, "merge-base", "--end-of-options", a, b)
	base := strings.TrimSpace(string(out))
	if err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) && exit.ExitCode() == 1 && base == "" {
			return "", fmt.Errorf("commits %q and %q share no history: %w", a, b, ErrNotFound)
		}
		return "", fmt.Errorf("failed to find the merge base of %q and %q: %w", a, b, err)
	}
	return base, nil
}

func (r *cliRepo) CountCommits(
	ctx context.Context,
	commit, exclude string,
	limit int,
) (int, error) {
	if !isHash(commit) || !isHash(exclude) {
		return 0, fmt.Errorf(
			"counting the commits of %q not in %q needs two hashes: %w",
			commit,
			exclude,
			ErrInvalidArgument,
		)
	}
	if limit <= 0 {
		return 0, fmt.Errorf("commit count limit %d is not positive: %w", limit, ErrInvalidArgument)
	}
	out, err := r.run(
		ctx,
		"rev-list",
		"--count",
		"--max-count="+strconv.Itoa(limit),
		"--end-of-options",
		commit,
		"^"+exclude,
		"--",
	)
	if err != nil {
		return 0, fmt.Errorf(
			"failed to count the commits of %q not in %q: %w",
			commit,
			exclude,
			err,
		)
	}
	n, err := strconv.Atoi(strings.TrimSpace(string(out)))
	if err != nil {
		return 0, fmt.Errorf("failed to parse commit count %q: %w", out, err)
	}
	return n, nil
}

func (r *cliRepo) Blame(ctx context.Context, commit, path string) ([]BlameRange, error) {
	path, err := cleanPath(path)
	if err != nil {
		return nil, err
	}
	obj, err := object(commit, path)
	if err != nil {
		return nil, err
	}
	info, err := r.cat.Info(obj)
	if errors.Is(err, errMissing) {
		return nil, fmt.Errorf("file %q does not exist: %w", path, ErrNotFound)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to stat file %q: %w", path, err)
	}
	if info.Type != "blob" {
		return nil, fmt.Errorf("path %q is not a file: %w", path, ErrInvalidArgument)
	}
	out, err := r.run(ctx, "blame", "--incremental", commit, "--", path)
	if err != nil {
		return nil, fmt.Errorf("failed to blame file %q: %w", path, err)
	}
	return parseBlame(out)
}

func parseBlame(out []byte) ([]BlameRange, error) {
	type pending struct {
		hash       string
		start, num int
	}
	commits := map[string]*BlameCommit{}
	var (
		groups               []pending
		cur                  *pending
		authorTime, authorTZ string
	)
	sc := bufio.NewScanner(bytes.NewReader(out))
	sc.Buffer(make([]byte, 64*1024), 16*1024*1024)
	for sc.Scan() {
		line := sc.Text()
		if cur == nil {
			f := strings.Fields(line)
			if len(f) != 4 || !isHash(f[0]) {
				return nil, fmt.Errorf(
					"failed to parse blame group %q: %w",
					line,
					io.ErrUnexpectedEOF,
				)
			}
			start, err1 := strconv.Atoi(f[2])
			num, err2 := strconv.Atoi(f[3])
			if err1 != nil || err2 != nil {
				return nil, fmt.Errorf(
					"failed to parse blame line numbers %q: %w",
					line,
					io.ErrUnexpectedEOF,
				)
			}
			cur = &pending{hash: f[0], start: start, num: num}
			if _, ok := commits[f[0]]; !ok {
				commits[f[0]] = &BlameCommit{Hash: f[0]}
			}
			continue
		}
		key, value, _ := strings.Cut(line, " ")
		c := commits[cur.hash]
		switch key {
		case "author":
			c.Author.Name = value
		case "author-mail":
			c.Author.Email = strings.TrimSuffix(strings.TrimPrefix(value, "<"), ">")
		case "author-time":
			authorTime = value
		case "author-tz":
			authorTZ = value
		case "summary":
			c.Subject = value
		case "filename":
			if authorTime != "" {
				c.Author.Date = unixTime(authorTime, authorTZ)
				authorTime, authorTZ = "", ""
			}
			groups = append(groups, *cur)
			cur = nil
		}
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("failed to scan blame output: %w", err)
	}
	sort.Slice(groups, func(i, j int) bool { return groups[i].start < groups[j].start })
	ranges := []BlameRange{}
	for _, g := range groups {
		end := g.start + g.num - 1
		if n := len(ranges); n > 0 {
			if prev := &ranges[n-1]; prev.Commit.Hash == g.hash && prev.End+1 == g.start {
				prev.End = end
				continue
			}
		}
		ranges = append(ranges, BlameRange{Start: g.start, End: end, Commit: *commits[g.hash]})
	}
	return ranges, nil
}
