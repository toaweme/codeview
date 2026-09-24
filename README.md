# codeview

A read-only code browser over the bare repositories soft-serve stores. One Go binary serving a JSON API and an embedded React UI.

## Development

blink boots the stack from `blink.yml`, with soft-serve in docker, the backend on 8080 and the vite dev server on 5173, which proxies `/api` to the backend.

```bash
blink run
```

`task seed` mirrors a few public GitHub repositories with `git clone --mirror` into `.data/soft-serve/repos/seed`, so codeview sees them while soft-serve's own database does not.

```bash
task seed
```

Check and build. `ui.go` at the module root embeds `ui/dist`, and `task build` builds the UI before compiling so the binary carries it. A committed `ui/dist/.gitkeep` keeps `go build` working without a UI build, in which case the binary answers every page with a hint, and `--ui-dir ui/dist` serves a build from disk instead.

```bash
task check
task build
```

## Environment variables

Each one is also a flag of `codeview serve`, named in the Flag column.

| Variable | Flag | Default | Description |
| --- | --- | --- | --- |
| `CODEVIEW_DATA` | `--data` | `.data/soft-serve` | soft-serve data directory, whose `repos/` holds the bare repositories |
| `CODEVIEW_HOST` | `--host` | `127.0.0.1` | Bind address |
| `CODEVIEW_PORT` | `--port` | `8080` | Listen port |
| `CODEVIEW_UI_DIR` | `--ui-dir` | empty, the embedded build | Directory to serve the UI from |
| `CODEVIEW_GIT` | `--git` | `git` | git executable |
