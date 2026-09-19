// Package markdown renders repository Markdown into safe HTML.
package markdown

import (
	"bytes"
	"fmt"
	"net/url"
	"path"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/text"
	"github.com/yuin/goldmark/util"
)

// Renderer renders Markdown into safe HTML.
type Renderer interface {
	Render(src []byte, doc Document) (string, error)
}

// Document names the file a Markdown source was read from.
type Document struct {
	Repo string
	// Commit is a full hash so image URLs never move.
	Commit string
	Path   string
}

// PathAttr carries a repository link's target for the UI router.
const PathAttr = "data-gv-path"

const rawEndpoint = "/api/raw"

// other schemes, such as javascript: or data:, are unwrapped into text
var linkSchemes = map[string]bool{"http": true, "https": true, "mailto": true}

// IsMarkdown reports whether p has a Markdown extension.
func IsMarkdown(p string) bool {
	switch strings.ToLower(path.Ext(p)) {
	case ".md", ".markdown", ".mdown":
		return true
	}
	return false
}

// Goldmark renders GitHub-flavoured Markdown in goldmark's safe mode.
type Goldmark struct {
	md  goldmark.Markdown
	key parser.ContextKey
}

var _ Renderer = (*Goldmark)(nil)

func NewGoldmark() *Goldmark {
	key := parser.NewContextKey()
	md := goldmark.New(
		goldmark.WithExtensions(extension.GFM),
		goldmark.WithParserOptions(
			parser.WithAutoHeadingID(),
			parser.WithASTTransformers(util.Prioritized(rewriter{key: key}, 100)),
		),
	)
	return &Goldmark{md: md, key: key}
}

func (g *Goldmark) Render(src []byte, doc Document) (string, error) {
	pc := parser.NewContext()
	pc.Set(g.key, doc)
	var buf bytes.Buffer
	if err := g.md.Convert(src, &buf, parser.WithContext(pc)); err != nil {
		return "", fmt.Errorf("failed to render markdown %q: %w", doc.Path, err)
	}
	return buf.String(), nil
}

// rewriter keeps links and images inside the repository and drops script ones.
// key carries the Document from Render into the parser context.
type rewriter struct {
	key parser.ContextKey
}

var _ parser.ASTTransformer = rewriter{}

func (rw rewriter) Transform(node *ast.Document, reader text.Reader, pc parser.Context) {
	doc, _ := pc.Get(rw.key).(Document)
	dir := path.Dir(strings.Trim(doc.Path, "/"))
	source := reader.Source()

	var unwrap, remove []ast.Node
	_ = ast.Walk(node, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		switch n := n.(type) {
		case *ast.Link:
			if !rewriteLink(n, dir) {
				unwrap = append(unwrap, n)
			}
		case *ast.AutoLink:
			if n.AutoLinkType == ast.AutoLinkURL {
				if scheme := schemeOf(string(n.URL(source))); scheme != "" && !linkSchemes[scheme] {
					remove = append(remove, n)
					break
				}
				setExternal(n)
			}
		case *ast.Image:
			if !rewriteImage(n, dir, doc) {
				remove = append(remove, n)
			}
			return ast.WalkSkipChildren, nil
		}
		return ast.WalkContinue, nil
	})
	for _, n := range unwrap {
		parent := n.Parent()
		for c := n.FirstChild(); c != nil; c = n.FirstChild() {
			parent.InsertBefore(parent, n, c)
		}
		parent.RemoveChild(parent, n)
	}
	for _, n := range remove {
		if a, ok := n.(*ast.AutoLink); ok {
			n.Parent().ReplaceChild(n.Parent(), n, ast.NewString(a.Label(source)))
			continue
		}
		n.Parent().RemoveChild(n.Parent(), n)
	}
}

func rewriteLink(n *ast.Link, dir string) bool {
	dest := string(n.Destination)
	switch {
	case strings.HasPrefix(dest, "#"):
		return true
	case strings.HasPrefix(dest, "//"):
		setExternal(n)
		return true
	}
	if scheme := schemeOf(dest); scheme != "" {
		if !linkSchemes[scheme] {
			return false
		}
		if scheme != "mailto" {
			setExternal(n)
		}
		return true
	}
	p, ok := resolve(dir, dest)
	if !ok {
		return false
	}
	n.Destination = []byte("#")
	n.SetAttributeString(PathAttr, p)
	return true
}

func rewriteImage(n *ast.Image, dir string, doc Document) bool {
	dest := string(n.Destination)
	if strings.HasPrefix(dest, "//") {
		return true
	}
	if scheme := schemeOf(dest); scheme != "" {
		return scheme == "http" || scheme == "https"
	}
	p, ok := resolve(dir, dest)
	if !ok || p == "" {
		return false
	}
	q := url.Values{"repo": {doc.Repo}, "ref": {doc.Commit}, "path": {p}}
	n.Destination = []byte(rawEndpoint + "?" + q.Encode())
	return true
}

func setExternal(n ast.Node) {
	n.SetAttributeString("rel", "noopener noreferrer")
	n.SetAttributeString("target", "_blank")
}

// schemeOf returns the lowercased RFC 3986 scheme of dest, or "" when it has none.
func schemeOf(dest string) string {
	for i := 0; i < len(dest); i++ {
		c := dest[i]
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z':
		case i > 0 && (c >= '0' && c <= '9' || c == '+' || c == '-' || c == '.'):
		case i > 0 && c == ':':
			return strings.ToLower(dest[:i])
		default:
			return ""
		}
	}
	return ""
}

// resolve reports false when ref escapes the repository root.
func resolve(dir, ref string) (string, bool) {
	if i := strings.IndexAny(ref, "?#"); i >= 0 {
		ref = ref[:i]
	}
	if u, err := url.PathUnescape(ref); err == nil {
		ref = u
	}
	var p string
	if strings.HasPrefix(ref, "/") {
		p = path.Clean(strings.TrimLeft(ref, "/"))
	} else {
		p = path.Join(dir, ref)
	}
	if p == ".." || strings.HasPrefix(p, "../") {
		return "", false
	}
	if p == "." {
		p = ""
	}
	return p, true
}
