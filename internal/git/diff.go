package git

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
)

const (
	maxDiffLines = 5000
	maxDiffBytes = 1 << 20
	maxLineBytes = 16 * 1024
)

func (r *cliRepo) Diff(ctx context.Context, base, head string) ([]FileDiff, error) {
	if !isHash(head) || base != "" && !isHash(base) {
		return nil, fmt.Errorf(
			"diff of %q and %q needs commit hashes: %w",
			base,
			head,
			ErrInvalidArgument,
		)
	}
	args := []string{
		"diff-tree",
		"-r",
		"-p",
		"--no-commit-id",
		"--no-color",
		"--no-ext-diff",
		"--no-textconv",
		"--histogram",
		"-M",
		"--src-prefix=a/",
		"--dst-prefix=b/",
	}
	if base == "" {
		args = append(args, "--root", "--end-of-options", head)
	} else {
		args = append(args, "--end-of-options", base, head)
	}
	cmd := r.command(ctx, args...)
	var stderr strings.Builder
	cmd.Stderr = &stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to open the diff output: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start the diff: %w", err)
	}
	files, parseErr := ParsePatch(stdout)
	if parseErr != nil {
		_ = cmd.Process.Kill()
	}
	waitErr := cmd.Wait()
	if parseErr != nil {
		return nil, fmt.Errorf("failed to parse the diff of %q and %q: %w", base, head, parseErr)
	}
	if waitErr != nil {
		return nil, fmt.Errorf(
			"failed to diff %q and %q (%s): %w",
			base,
			head,
			strings.TrimSpace(stderr.String()),
			waitErr,
		)
	}
	return files, nil
}

// ParsePatch parses the output of git diff --patch into one FileDiff per file.
func ParsePatch(r io.Reader) ([]FileDiff, error) {
	br := bufio.NewReaderSize(r, 64*1024)
	files := []FileDiff{}
	var (
		cur      *FileDiff
		hunk     *Hunk
		inHeader bool
		oldNo    int
		newNo    int
		kept     int
		keptSize int
	)
	flush := func() {
		if cur == nil {
			return
		}
		if hunk != nil {
			cur.Hunks = append(cur.Hunks, *hunk)
			hunk = nil
		}
		if cur.Path == "" {
			cur.Path = cur.OldPath
		}
		switch cur.Status {
		case StatusAdded:
			cur.OldPath = ""
		case StatusModified, StatusDeleted:
			cur.OldPath = cur.Path
		case StatusRenamed, StatusCopied:
			// OldPath already holds the source from the rename or copy header.
		}
		files = append(files, *cur)
		cur = nil
	}
	for {
		raw, err := br.ReadString('\n')
		if raw == "" && err != nil {
			if errors.Is(err, io.EOF) {
				break
			}
			return nil, fmt.Errorf("failed to read the patch: %w", err)
		}
		line := strings.TrimSuffix(raw, "\n")

		if strings.HasPrefix(line, "diff --git ") {
			flush()
			cur = &FileDiff{Status: StatusModified, Hunks: []Hunk{}}
			cur.OldPath, cur.Path = headerPaths(line[len("diff --git "):])
			inHeader, kept, keptSize = true, 0, 0
			continue
		}
		if cur == nil {
			continue
		}
		if strings.HasPrefix(line, "@@ ") {
			if hunk != nil {
				cur.Hunks = append(cur.Hunks, *hunk)
				hunk = nil
			}
			inHeader = false
			h, ok := parseHunkHeader(line)
			if !ok {
				return nil, fmt.Errorf(
					"failed to parse hunk header %q: %w",
					line,
					io.ErrUnexpectedEOF,
				)
			}
			oldNo, newNo = h.OldStart, h.NewStart
			if cur.Truncated {
				continue
			}
			h.Lines = []Line{}
			hunk = &h
			continue
		}
		if inHeader {
			parseExtendedHeader(cur, line)
			continue
		}
		if line == "" {
			continue
		}
		var l Line
		switch line[0] {
		case ' ':
			l = Line{Type: LineContext, Old: new(oldNo), New: new(newNo)}
			oldNo++
			newNo++
		case '+':
			l = Line{Type: LineAdd, New: new(newNo)}
			newNo++
			cur.Additions++
		case '-':
			l = Line{Type: LineDel, Old: new(oldNo)}
			oldNo++
			cur.Deletions++
		default:
			// "\ No newline at end of file"
			continue
		}
		if cur.Truncated || hunk == nil {
			continue
		}
		text := line[1:]
		if len(text) > maxLineBytes {
			text = strings.ToValidUTF8(text[:maxLineBytes], "")
			cur.Truncated = true
		}
		if kept >= maxDiffLines || keptSize+len(text) > maxDiffBytes {
			cur.Truncated = true
			cur.Hunks = append(cur.Hunks, *hunk)
			hunk = nil
			continue
		}
		l.Text = strings.ToValidUTF8(text, "�")
		hunk.Lines = append(hunk.Lines, l)
		kept++
		keptSize += len(text)
	}
	flush()
	return files, nil
}

func parseExtendedHeader(cur *FileDiff, line string) {
	switch {
	case strings.HasPrefix(line, "new file mode "):
		cur.Status = StatusAdded
	case strings.HasPrefix(line, "deleted file mode "):
		cur.Status = StatusDeleted
	case strings.HasPrefix(line, "rename from "):
		cur.Status = StatusRenamed
		cur.OldPath = unquote(line[len("rename from "):])
	case strings.HasPrefix(line, "rename to "):
		cur.Path = unquote(line[len("rename to "):])
	case strings.HasPrefix(line, "copy from "):
		cur.Status = StatusCopied
		cur.OldPath = unquote(line[len("copy from "):])
	case strings.HasPrefix(line, "copy to "):
		cur.Path = unquote(line[len("copy to "):])
	case strings.HasPrefix(line, "--- "):
		if p := patchPath(line[4:], "a/"); p != "" {
			cur.OldPath = p
		}
	case strings.HasPrefix(line, "+++ "):
		if p := patchPath(line[4:], "b/"); p != "" {
			cur.Path = p
		}
	case strings.HasPrefix(line, "Binary files ") || line == "GIT binary patch":
		cur.Binary = true
	}
}

// patchPath strips the tab git appends to names holding a space.
func patchPath(s, prefix string) string {
	s = unquote(strings.TrimSuffix(s, "\t"))
	if s == "/dev/null" {
		return ""
	}
	return strings.TrimPrefix(s, prefix)
}

// headerPaths may misread unquoted names holding " b/", which only matters for a rename,
// and a rename carries exact names in its own header lines.
func headerPaths(s string) (string, string) {
	if strings.HasPrefix(s, `"`) {
		a, rest, ok := cutQuoted(s)
		if !ok {
			return "", ""
		}
		b := unquote(strings.TrimSpace(rest))
		return strings.TrimPrefix(a, "a/"), strings.TrimPrefix(b, "b/")
	}
	if i := strings.Index(s, ` "b/`); i >= 0 {
		return strings.TrimPrefix(s[:i], "a/"), strings.TrimPrefix(unquote(s[i+1:]), "b/")
	}
	if len(s) >= 7 && (len(s)-5)%2 == 0 {
		n := 2 + (len(s)-5)/2
		if s[n:n+3] == " b/" && s[2:n] == s[n+3:] {
			return s[2:n], s[n+3:]
		}
	}
	a, b, _ := strings.Cut(s, " b/")
	return strings.TrimPrefix(a, "a/"), b
}

func cutQuoted(s string) (string, string, bool) {
	for i := 1; i < len(s); i++ {
		switch s[i] {
		case '\\':
			i++
		case '"':
			v, err := strconv.Unquote(s[:i+1])
			if err != nil {
				return "", "", false
			}
			return v, s[i+1:], true
		}
	}
	return "", "", false
}

func unquote(s string) string {
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		if v, err := strconv.Unquote(s); err == nil {
			return v
		}
	}
	return s
}

func parseHunkHeader(line string) (Hunk, bool) {
	rest := strings.TrimPrefix(line, "@@ ")
	ranges, header, ok := strings.Cut(rest, " @@")
	if !ok {
		return Hunk{}, false
	}
	oldR, newR, ok := strings.Cut(ranges, " ")
	if !ok || !strings.HasPrefix(oldR, "-") || !strings.HasPrefix(newR, "+") {
		return Hunk{}, false
	}
	var h Hunk
	if h.OldStart, h.OldLines, ok = hunkRange(oldR[1:]); !ok {
		return Hunk{}, false
	}
	if h.NewStart, h.NewLines, ok = hunkRange(newR[1:]); !ok {
		return Hunk{}, false
	}
	h.Header = strings.TrimPrefix(header, " ")
	return h, true
}

func hunkRange(s string) (int, int, bool) {
	startS, linesS, hasLines := strings.Cut(s, ",")
	start, err := strconv.Atoi(startS)
	if err != nil {
		return 0, 0, false
	}
	lines := 1
	if hasLines {
		if lines, err = strconv.Atoi(linesS); err != nil {
			return 0, 0, false
		}
	}
	return start, lines, true
}
