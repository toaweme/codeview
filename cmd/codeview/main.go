// Command codeview serves a read-only code browser over a folder of git repositories.
package main

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/toaweme/cli"
	"github.com/toaweme/cli/commands/help"
	"github.com/toaweme/http/server"
	"github.com/toaweme/log"

	"github.com/toaweme/codeview"
	"github.com/toaweme/codeview/internal/api"
	"github.com/toaweme/codeview/internal/git"
	"github.com/toaweme/codeview/internal/markdown"
	"github.com/toaweme/codeview/internal/scan"
	"github.com/toaweme/codeview/internal/webui"
)

const appName = "codeview"

// version and commit are set at build time through -ldflags -X main.version and -X main.commit.
var (
	version = "dev"
	commit  = ""
)

func main() {
	cwd, err := os.Getwd()
	if err != nil {
		log.Error("command.failed", "operation", "get the working directory", "error", err)
		os.Exit(1)
	}

	app := cli.NewApp(cli.Config{Name: appName, Version: version}, cli.GlobalFlags{Cwd: cwd})
	app.Help(help.NewHelpCommand(app.Config, app.Commands, app.OutputFormats, app.DefaultCommand))
	serveCommand := NewServeCommand(codeview.UI)
	app.Add("serve", serveCommand)
	app.Default(serveCommand)

	if err := app.Run(os.Args[1:]); err != nil {
		if errors.Is(err, cli.ErrShowingHelp) || errors.Is(err, cli.ErrShowingVersion) {
			os.Exit(0)
		}
		log.Error("command.failed", "operation", "run the codeview command", "error", err)
		os.Exit(1)
	}
}

// ServeConfig holds the serve command's flags and environment.
type ServeConfig struct {
	Dir  string `arg:"dir" env:"CODEVIEW_DIR" default:"." help:"Folder holding the git repositories"`
	Mode string `arg:"mode" env:"CODEVIEW_MODE" default:"public" help:"Which repositories to serve, public (holding git-daemon-export-ok) or all"`
	Host string `arg:"host" env:"CODEVIEW_HOST" default:"127.0.0.1" help:"Address to listen on"`
	Port int    `arg:"port" env:"CODEVIEW_PORT" default:"8080" help:"Port to listen on"`
	Git  string `arg:"git" env:"CODEVIEW_GIT" default:"git" help:"git executable"`
}

// ServeCommand runs the HTTP server.
type ServeCommand struct {
	cli.BaseCommand[ServeConfig]
	ui fs.FS
}

var _ cli.Command[ServeConfig] = (*ServeCommand)(nil)

// NewServeCommand serves ui, which holds the UI build under ui/dist.
func NewServeCommand(ui fs.FS) *ServeCommand { return &ServeCommand{ui: ui} }

func (c *ServeCommand) Help() string { return "Serve the code browser" }

func (c *ServeCommand) Run(_ cli.GlobalFlags, _ cli.Unknowns) error {
	cfg := *c.Inputs
	logger := log.Default()
	mode, err := git.ParseMode(cfg.Mode)
	if err != nil {
		return fmt.Errorf("failed to read the mode flag: %w", err)
	}
	scanner := scan.New(scan.Config{Dir: cfg.Dir, Logger: logger})
	found, err := scanner.Locate(context.Background())
	if err != nil {
		return fmt.Errorf("failed to scan %q: %w", cfg.Dir, err)
	}
	public := 0
	for _, loc := range found {
		if loc.Public {
			public++
		}
	}
	logger.Info(
		"service.booted",
		"service", appName,
		"dir", cfg.Dir,
		"mode", mode,
		"repos", len(found),
		"public", public,
		"host", cfg.Host,
		"port", cfg.Port,
	)
	build := buildID(version, commit, time.Now())
	store := git.NewCLIStore(git.Config{Locator: scanner, Mode: mode, Binary: cfg.Git, Warm: true})
	defer store.Close()
	store.Warm()

	files, err := webui.FS(c.ui)
	if err != nil {
		return fmt.Errorf("failed to open the UI files: %w", err)
	}

	r := server.NewRouter()
	r.Use(server.SlogMiddleware(server.SlogConfig{}, logger))
	r.Handle(http.MethodGet, "/api/*", api.New(store, markdown.NewGoldmark(), logger, build))
	r.Handle(http.MethodGet, "/*", webui.Handler(files))
	r.Handle(http.MethodHead, "/*", webui.Handler(files))

	srv := server.NewServer(
		server.Config{Host: cfg.Host, Port: cfg.Port},
		r,
		logger,
		server.WithIdleTimeout(120*time.Second),
	)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	errs := make(chan error, 1)
	go func() { errs <- srv.Start() }()
	select {
	case err := <-errs:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("failed to serve: %w", err)
		}
		return nil
	case <-ctx.Done():
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Stop(shutdown); err != nil {
		return fmt.Errorf("failed to stop the server: %w", err)
	}
	return nil
}

// buildID names the build for API entity tags. A development build, with no version
// or commit stamped in, is named after its start time so each run revalidates afresh.
func buildID(version, commit string, started time.Time) string {
	if version == "" || version == "dev" || commit == "" {
		return "dev-" + strconv.FormatInt(started.UnixNano(), 36)
	}
	return version + "+" + commit
}
