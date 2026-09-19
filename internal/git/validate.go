package git

import (
	"fmt"
	"strings"
)

// ValidateRepoName rejects names that could escape the data directory or hide as dotfiles.
func ValidateRepoName(name string) error {
	if name == "" || len(name) > 512 {
		return fmt.Errorf("repository name %q has an invalid length: %w", name, ErrInvalidArgument)
	}
	for seg := range strings.SplitSeq(name, "/") {
		if seg == "" || seg[0] == '.' || seg[0] == '-' {
			return fmt.Errorf(
				"repository name %q has an invalid segment: %w",
				name,
				ErrInvalidArgument,
			)
		}
		for i := 0; i < len(seg); i++ {
			c := seg[i]
			if !isNameByte(c) {
				return fmt.Errorf(
					"repository name %q has an invalid character: %w",
					name,
					ErrInvalidArgument,
				)
			}
		}
	}
	return nil
}

func isNameByte(c byte) bool {
	return c >= 'a' && c <= 'z' ||
		c >= 'A' && c <= 'Z' ||
		c >= '0' && c <= '9' ||
		c == '.' || c == '_' || c == '-'
}

// validateRev keeps rev syntax and option-like arguments out of git's command line and cat-file.
func validateRev(rev string) error {
	if rev == "" ||
		len(rev) > 1024 ||
		rev[0] == '-' ||
		rev[0] == '/' ||
		strings.HasSuffix(rev, "/") ||
		strings.Contains(rev, "..") ||
		strings.Contains(rev, "@{") ||
		strings.Contains(rev, "//") ||
		strings.HasSuffix(rev, ".lock") {
		return fmt.Errorf("ref %q is not a valid ref name: %w", rev, ErrInvalidArgument)
	}
	for i := 0; i < len(rev); i++ {
		c := rev[i]
		if c <= ' ' || c == 0x7f || strings.IndexByte("~^:?*[\\", c) >= 0 {
			return fmt.Errorf("ref %q is not a valid ref name: %w", rev, ErrInvalidArgument)
		}
	}
	return nil
}

const maxSuffixDigits = 6

// splitRev splits "main~3" into "main" and "~3", allowing only ~ and ^ suffixes.
func splitRev(rev string) (string, string, error) {
	i := strings.IndexAny(rev, "~^")
	if i < 0 {
		return rev, "", validateRev(rev)
	}
	name, suffix := rev[:i], rev[i:]
	if name != "HEAD" {
		if err := validateRev(name); err != nil {
			return "", "", err
		}
	}
	for j := 0; j < len(suffix); {
		if suffix[j] != '~' && suffix[j] != '^' {
			return "", "", fmt.Errorf(
				"revision %q has an invalid suffix: %w",
				rev,
				ErrInvalidArgument,
			)
		}
		j++
		start := j
		for j < len(suffix) && suffix[j] >= '0' && suffix[j] <= '9' {
			j++
		}
		if j-start > maxSuffixDigits {
			return "", "", fmt.Errorf(
				"revision %q has an invalid suffix: %w",
				rev,
				ErrInvalidArgument,
			)
		}
	}
	return name, suffix, nil
}

// cleanPath rejects paths git cannot store or that would break the cat-file protocol.
func cleanPath(path string) (string, error) {
	path = strings.Trim(path, "/")
	if path == "" {
		return "", nil
	}
	if strings.ContainsAny(path, "\x00\n\r") {
		return "", fmt.Errorf("path %q contains a control character: %w", path, ErrInvalidArgument)
	}
	for seg := range strings.SplitSeq(path, "/") {
		if seg == "" || seg == "." || seg == ".." {
			return "", fmt.Errorf("path %q has an invalid segment: %w", path, ErrInvalidArgument)
		}
	}
	return path, nil
}

func isHex(s string) bool {
	if s == "" {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
			return false
		}
	}
	return true
}

func isHash(s string) bool {
	return len(s) >= 4 && len(s) <= 64 && isHex(s)
}
