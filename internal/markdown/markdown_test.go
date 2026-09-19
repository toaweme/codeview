package markdown_test

import (
	"strings"
	"testing"

	"github.com/toaweme/codeview/internal/markdown"
)

func Test_Goldmark_Render(t *testing.T) {
	doc := markdown.Document{Repo: "acme/widgets", Commit: "abc123", Path: "docs/guide/README.md"}
	tests := []struct {
		name    string
		src     string
		want    []string
		notWant []string
	}{
		{
			name: "gfm table",
			src:  "| a | b |\n|---|---|\n| 1 | 2 |\n",
			want: []string{"<table>", "<th>a</th>", "<td>2</td>"},
		},
		{
			name: "task list",
			src:  "- [x] done\n- [ ] todo\n",
			want: []string{
				`<input checked="" disabled="" type="checkbox"`,
				`<input disabled="" type="checkbox"`,
			},
		},
		{
			name:    "raw html is not rendered",
			src:     "hi <script>alert(1)</script>\n\n<div onclick=\"x()\">block</div>\n",
			notWant: []string{"<script", "<div", "onclick"},
		},
		{
			name:    "javascript link dropped",
			src:     "[click](javascript:alert(1))\n",
			want:    []string{"click"},
			notWant: []string{"javascript:", "<a"},
		},
		{
			name:    "data image dropped",
			src:     "![x](data:image/png;base64,AAAA)\n",
			notWant: []string{"data:", "<img"},
		},
		{
			name:    "data link dropped",
			src:     "[x](data:text/html,hi)\n",
			notWant: []string{"data:", "<a"},
		},
		{
			name: "relative image to raw url",
			src:  "![logo](../img/logo.png)\n",
			want: []string{`<img src="/api/raw?path=docs%2Fimg%2Flogo.png&amp;ref=abc123&amp;repo=acme%2Fwidgets" alt="logo"`},
		},
		{
			name: "root image to raw url",
			src:  "![logo](/logo.png?raw=true)\n",
			want: []string{`src="/api/raw?path=logo.png&amp;ref=abc123&amp;repo=acme%2Fwidgets"`},
		},
		{
			name: "absolute image kept",
			src:  "![b](https://example.com/b.svg)\n",
			want: []string{`<img src="https://example.com/b.svg"`},
		},
		{
			name: "relative link to data-gv-path",
			src:  "[api](../../src/main.go#L3)\n",
			want: []string{`<a href="#" data-gv-path="src/main.go">api</a>`},
		},
		{
			name:    "escaping root dropped",
			src:     "[up](../../../etc/passwd) ![i](../../../x.png) [abs](/../x)\n",
			want:    []string{"up", "abs"},
			notWant: []string{"<a", "<img", "passwd", "x.png"},
		},
		{
			name: "anchor link kept",
			src:  "[see](#install)\n",
			want: []string{`<a href="#install">see</a>`},
		},
		{
			name: "external link opens apart",
			src:  "[go](https://go.dev) https://example.com\n",
			want: []string{
				`<a href="https://go.dev" rel="noopener noreferrer" target="_blank">go</a>`,
				`<a href="https://example.com" rel="noopener noreferrer" target="_blank">`,
			},
		},
		{
			name: "heading ids",
			src:  "# Getting Started\n\n## Install it!\n",
			want: []string{`<h1 id="getting-started">`, `<h2 id="install-it">`},
		},
		{
			name: "code block class",
			src:  "```go\nfunc main() {}\n```\n",
			want: []string{`<pre><code class="language-go">`},
		},
	}
	r := markdown.NewGoldmark()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := r.Render([]byte(tt.src), doc)
			if err != nil {
				t.Fatalf("render: %v", err)
			}
			for _, w := range tt.want {
				if !strings.Contains(got, w) {
					t.Errorf("missing %q in\n%s", w, got)
				}
			}
			for _, w := range tt.notWant {
				if strings.Contains(got, w) {
					t.Errorf("unexpected %q in\n%s", w, got)
				}
			}
		})
	}
}

func Test_IsMarkdown(t *testing.T) {
	tests := []struct {
		path string
		want bool
	}{
		{"README.md", true},
		{"docs/Guide.MARKDOWN", true},
		{"a.mdown", true},
		{"README", false},
		{"README.txt", false},
		{"md", false},
	}
	for _, tt := range tests {
		t.Run(tt.path, func(t *testing.T) {
			if got := markdown.IsMarkdown(tt.path); got != tt.want {
				t.Errorf("IsMarkdown(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}
