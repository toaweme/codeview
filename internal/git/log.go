package git

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"
)

// logFormat with -z reads as groups of logFields NUL-terminated fields.
const logFormat = "%H%x00%P%x00%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI%x00%s%x00%b"

const logFields = 10

// Log filters an author-date range while streaming, since git can only bound the walk
// by committer date. Passing Since to git is still safe because a commit is never
// committed before it was authored.
func (r *cliRepo) Log(ctx context.Context, q LogQuery) (History, error) {
	path, err := r.checkRange(q.Commit, q.Exclude, q.Path)
	if err != nil {
		return History{}, err
	}
	f := q.Filter
	if err := checkFilter(f); err != nil {
		return History{}, err
	}
	if q.Limit <= 0 {
		q.Limit = 50
	}
	q.Skip = max(q.Skip, 0)
	if q.MaxScan <= 0 {
		q.MaxScan = MaxFilterScan
	}
	byAuthor := f.DateField != DateCommitter && (!f.Since.IsZero() || !f.Until.IsZero())

	args := []string{"log", "--no-color", "-z", "--format=" + logFormat}
	if f.Author != "" || f.Grep != "" {
		// --fixed-strings applies to --author as well as --grep
		args = append(args, "--regexp-ignore-case", "--fixed-strings")
		if f.Author != "" {
			args = append(args, "--author="+f.Author)
		}
		if f.Grep != "" {
			args = append(args, "--grep="+f.Grep)
		}
	}
	if !f.Since.IsZero() {
		args = append(args, "--since="+gitDate(f.Since))
	}
	if !byAuthor {
		if !f.Until.IsZero() {
			args = append(args, "--until="+gitDate(f.Until))
		}
		args = append(args, "--skip="+strconv.Itoa(q.Skip), "-n", strconv.Itoa(q.Limit))
	}
	args = append(args, r.revArgs(q.Commit, q.Exclude, path)...)

	cmd := r.command(ctx, args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return History{}, fmt.Errorf("failed to open the history stream: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return History{}, fmt.Errorf("failed to read history: %w", err)
	}
	stream := &cmdReader{ReadCloser: stdout, cmd: cmd}
	lr := newLogReader(stdout)
	h := History{Commits: []Commit{}}
	skipped, scanned := 0, 0
	for {
		c, err := lr.next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			_ = stream.Close()
			return History{}, fmt.Errorf("failed to read history: %w", err)
		}
		if !byAuthor {
			h.Commits = append(h.Commits, c)
			continue
		}
		scanned++
		if inRange(c.Author.Date, f.Since, f.Until) {
			if skipped < q.Skip {
				skipped++
			} else {
				h.Commits = append(h.Commits, c)
			}
		}
		if len(h.Commits) == q.Limit {
			_ = stream.Close()
			return h, nil
		}
		if scanned >= q.MaxScan {
			_, err := lr.next()
			h.Partial = !errors.Is(err, io.EOF)
			_ = stream.Close()
			return h, nil
		}
	}
	if err := cmd.Wait(); err != nil {
		return History{}, fmt.Errorf(
			"failed to run git log (%s): %w",
			strings.TrimSpace(stderr.String()),
			err,
		)
	}
	return h, nil
}

func (r *cliRepo) CommitTimes(
	ctx context.Context,
	commit, path string,
	field DateField,
) ([]time.Time, error) {
	path, err := r.checkRange(commit, "", path)
	if err != nil {
		return nil, err
	}
	format := "--format=%at"
	if field == DateCommitter {
		format = "--format=%ct"
	}
	args := append([]string{"log", "--no-color", format}, r.revArgs(commit, "", path)...)
	out, err := r.run(ctx, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to read commit dates: %w", err)
	}
	times := make([]time.Time, 0, bytes.Count(out, []byte{'\n'}))
	for line := range strings.SplitSeq(strings.TrimSpace(string(out)), "\n") {
		if line == "" {
			continue
		}
		sec, err := strconv.ParseInt(line, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("failed to parse commit date %q: %w", line, err)
		}
		times = append(times, time.Unix(sec, 0).UTC())
	}
	return times, nil
}

func (r *cliRepo) checkRange(commit, exclude, path string) (string, error) {
	if !isHash(commit) {
		return "", fmt.Errorf("commit %q is not a hash: %w", commit, ErrInvalidArgument)
	}
	if exclude != "" && !isHash(exclude) {
		return "", fmt.Errorf("commit %q is not a hash: %w", exclude, ErrInvalidArgument)
	}
	return cleanPath(path)
}

func (r *cliRepo) revArgs(commit, exclude, path string) []string {
	var args []string
	if path != "" {
		if info, err := r.cat.Info(commit + ":" + path); err == nil && info.Type == "blob" {
			args = append(args, "--follow")
		}
	}
	args = append(args, "--end-of-options", commit)
	if exclude != "" {
		args = append(args, "^"+exclude)
	}
	args = append(args, "--")
	if path != "" {
		args = append(args, path)
	}
	return args
}

func checkFilter(f LogFilter) error {
	switch f.DateField {
	case "", DateAuthor, DateCommitter:
	default:
		return fmt.Errorf(
			"date field %q is not author or committer: %w",
			f.DateField,
			ErrInvalidArgument,
		)
	}
	if !f.Since.IsZero() && !f.Until.IsZero() && f.Until.Before(f.Since) {
		return fmt.Errorf(
			"date range %s to %s ends before it starts: %w",
			f.Since.Format(time.RFC3339),
			f.Until.Format(time.RFC3339),
			ErrInvalidArgument,
		)
	}
	for _, s := range []string{f.Author, f.Grep} {
		if strings.ContainsAny(s, "\x00\n\r") {
			return fmt.Errorf("filter %q contains a control character: %w", s, ErrInvalidArgument)
		}
	}
	return nil
}

// gitDate uses the raw timestamp form, which approxidate reads exactly.
func gitDate(t time.Time) string {
	return "@" + strconv.FormatInt(t.Unix(), 10) + " +0000"
}

func inRange(t, since, until time.Time) bool {
	return (since.IsZero() || !t.Before(since)) && (until.IsZero() || !t.After(until))
}

type logReader struct {
	r *bufio.Reader
}

func newLogReader(r io.Reader) *logReader {
	return &logReader{r: bufio.NewReaderSize(r, 64<<10)}
}

func (lr *logReader) next() (Commit, error) {
	var f [logFields]string
	for i := range f {
		s, err := lr.r.ReadString(0)
		if errors.Is(err, io.EOF) {
			if i == 0 && s == "" {
				return Commit{}, io.EOF
			}
			if i == logFields-1 {
				f[i] = s
				break
			}
			return Commit{}, fmt.Errorf(
				"failed to parse git log output after %d fields: %w",
				i,
				io.ErrUnexpectedEOF,
			)
		}
		if err != nil {
			return Commit{}, fmt.Errorf("failed to read git log output: %w", err)
		}
		f[i] = s[:len(s)-1]
	}
	return Commit{
		Hash:      f[0],
		Parents:   strings.Fields(f[1]),
		Author:    signature(f[2], f[3], f[4]),
		Committer: signature(f[5], f[6], f[7]),
		Subject:   f[8],
		Body:      strings.TrimRight(f[9], "\n"),
	}, nil
}

func parseLog(out []byte) ([]Commit, error) {
	lr := newLogReader(bytes.NewReader(out))
	commits := []Commit{}
	for {
		c, err := lr.next()
		if errors.Is(err, io.EOF) {
			return commits, nil
		}
		if err != nil {
			return nil, err
		}
		commits = append(commits, c)
	}
}

func signature(name, email, when string) Signature {
	return Signature{Name: name, Email: email, Date: parseISO(when)}
}
