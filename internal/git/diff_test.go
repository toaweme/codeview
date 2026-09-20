package git

import (
	"fmt"
	"strings"
	"testing"
)

func Test_ParsePatch(t *testing.T) {
	tests := []struct {
		name  string
		patch string
		want  []FileDiff
	}{
		{
			name: "quoted rename",
			patch: "diff --git \"a/old\\tname\" \"b/new name\"\n" +
				"similarity index 90%\n" +
				"rename from \"old\\tname\"\n" +
				"rename to new name\n" +
				"--- \"a/old\\tname\"\n" +
				"+++ b/new name\t\n" +
				"@@ -1,2 +1,2 @@ func x\n" +
				" same\n" +
				"-gone\n" +
				"+came\n",
			want: []FileDiff{{
				Path:      "new name",
				OldPath:   "old\tname",
				Status:    StatusRenamed,
				Additions: 1,
				Deletions: 1,
			}},
		},
		{
			name: "mode only and deleted",
			patch: "diff --git a/run.sh b/run.sh\n" +
				"old mode 100644\n" +
				"new mode 100755\n" +
				"diff --git a/gone b/gone\n" +
				"deleted file mode 100644\n" +
				"--- a/gone\n" +
				"+++ /dev/null\n" +
				"@@ -1 +0,0 @@\n" +
				"-bye\n" +
				"\\ No newline at end of file\n",
			want: []FileDiff{
				{Path: "run.sh", OldPath: "run.sh", Status: StatusModified},
				{Path: "gone", OldPath: "gone", Status: StatusDeleted, Deletions: 1},
			},
		},
		{
			name: "binary",
			patch: "diff --git a/a b/a b/a b/a\n" +
				"new file mode 100644\n" +
				"Binary files /dev/null and b/a b/a differ\n",
			want: []FileDiff{{Path: "a b/a", Status: StatusAdded, Binary: true}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ParsePatch(strings.NewReader(tt.patch))
			if err != nil {
				t.Fatalf("parse: %v", err)
			}
			if len(got) != len(tt.want) {
				t.Fatalf("got %d files, want %d", len(got), len(tt.want))
			}
			for i, w := range tt.want {
				g := got[i]
				if g.Path != w.Path ||
					g.OldPath != w.OldPath ||
					g.Status != w.Status ||
					g.Binary != w.Binary ||
					g.Additions != w.Additions ||
					g.Deletions != w.Deletions {
					t.Fatalf("file %d = %+v, want %+v", i, g, w)
				}
			}
		})
	}
}

func Test_ParsePatch_Truncates(t *testing.T) {
	var b strings.Builder
	n := maxDiffLines + 10
	fmt.Fprintf(
		&b,
		"diff --git a/big b/big\nnew file mode 100644\n--- /dev/null\n+++ b/big\n@@ -0,0 +1,%d @@\n",
		n,
	)
	for range n {
		b.WriteString("+line\n")
	}
	b.WriteString("diff --git a/small b/small\n--- a/small\n+++ b/small\n@@ -1 +1 @@\n-a\n+b\n")
	files, err := ParsePatch(strings.NewReader(b.String()))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(files) != 2 {
		t.Fatalf("got %d files", len(files))
	}
	big := files[0]
	if !big.Truncated ||
		big.Additions != n ||
		len(big.Hunks) != 1 ||
		len(big.Hunks[0].Lines) != maxDiffLines {
		t.Fatalf(
			"big = truncated %v, additions %d, lines %d",
			big.Truncated,
			big.Additions,
			len(big.Hunks[0].Lines),
		)
	}
	if files[1].Truncated || len(files[1].Hunks[0].Lines) != 2 {
		t.Fatalf("small = %+v", files[1])
	}
}
