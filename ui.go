// Package codeview embeds the web UI build into the binary.
package codeview

import "embed"

// UI holds ui/dist as vite builds it. A committed ui/dist/.gitkeep, which vite
// copies back from ui/public on every build, keeps this compiling on a fresh
// clone, and a binary built without the UI answers pages with a build hint.
//
//go:embed all:ui/dist
var UI embed.FS
