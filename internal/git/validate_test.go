package git

import (
	"errors"
	"testing"
)

func Test_ValidateRepoName(t *testing.T) {
	tests := []struct {
		name string
		ok   bool
	}{
		{"acme/widgets", true},
		{"widgets", true},
		{"a/b/c.d_e-f", true},
		{"", false},
		{"../etc", false},
		{"acme/../x", false},
		{"/abs", false},
		{"acme//x", false},
		{".hidden", false},
		{"-flag", false},
		{"acme/x y", false},
		{`acme\x`, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateRepoName(tt.name)
			if (err == nil) != tt.ok {
				t.Fatalf("ValidateRepoName(%q) = %v, want ok %v", tt.name, err, tt.ok)
			}
			if err != nil && !errors.Is(err, ErrInvalidArgument) {
				t.Fatalf("error %v is not ErrInvalidArgument", err)
			}
		})
	}
}

func Test_validateRev(t *testing.T) {
	tests := []struct {
		rev string
		ok  bool
	}{
		{"main", true},
		{"feature/x", true},
		{"v1.0.0", true},
		{"refs/tags/v1", true},
		{"-x", false},
		{"a..b", false},
		{"a b", false},
		{"HEAD~1", false},
		{"HEAD^", false},
		{"a:b", false},
		{"@{-1}", false},
		{"x.lock", false},
		{"/x", false},
	}
	for _, tt := range tests {
		t.Run(tt.rev, func(t *testing.T) {
			if err := validateRev(tt.rev); (err == nil) != tt.ok {
				t.Fatalf("validateRev(%q) = %v", tt.rev, err)
			}
		})
	}
}

func Test_splitRev(t *testing.T) {
	tests := []struct {
		rev    string
		name   string
		suffix string
		ok     bool
	}{
		{"main", "main", "", true},
		{"main~3", "main", "~3", true},
		{"main~", "main", "~", true},
		{"feature/x~2", "feature/x", "~2", true},
		{"abc1234^", "abc1234", "^", true},
		{"v1.2.0^2", "v1.2.0", "^2", true},
		{"main~2^2~1", "main", "~2^2~1", true},
		{"HEAD~1", "HEAD", "~1", true},
		{"-x~1", "", "", false},
		{"~1", "", "", false},
		{"^main", "", "", false},
		{"main~1..x", "", "", false},
		{"a..b^", "", "", false},
		{"main^{tree}", "", "", false},
		{"main^!", "", "", false},
		{"main~1:README.md", "", "", false},
		{"main@{1}", "", "", false},
		{"main~-1", "", "", false},
		{"main~ 1", "", "", false},
		{"main~1234567", "", "", false},
		{"main^\nHEAD", "", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.rev, func(t *testing.T) {
			name, suffix, err := splitRev(tt.rev)
			if (err == nil) != tt.ok {
				t.Fatalf("splitRev(%q) error = %v", tt.rev, err)
			}
			if err != nil {
				if !errors.Is(err, ErrInvalidArgument) {
					t.Fatalf("splitRev(%q) error = %v, want ErrInvalidArgument", tt.rev, err)
				}
				return
			}
			if name != tt.name || suffix != tt.suffix {
				t.Fatalf(
					"splitRev(%q) = %q, %q, want %q, %q",
					tt.rev,
					name,
					suffix,
					tt.name,
					tt.suffix,
				)
			}
		})
	}
}
