// Command codeview serves a read-only code browser over soft-serve repositories.
package main

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
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
	"github.com/toaweme/codeview/internal/webui"
)

const appName = "codeview"

func main() {
	cwd, err := os.Getwd()
	if err != nil {
		log.Error("command.failed", "operation", "get the working directory", "error", err)
		os.Exit(1)
	}

	app := cli.NewApp(cli.Config{Name: appName}, cli.GlobalFlags{Cwd: cwd})
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
	Data  string `arg:"data" env:"CODEVIEW_DATA" default:".data/soft-serve" help:"soft-serve data directory, whose repos/ holds the bare repositories"`
	Host  string `arg:"host" env:"CODEVIEW_HOST" default:"127.0.0.1" help:"Address to listen on"`
	Port  int    `arg:"port" env:"CODEVIEW_PORT" default:"8080" help:"Port to listen on"`
	UIDir string `arg:"ui-dir" env:"CODEVIEW_UI_DIR" help:"Serve the UI from this directory instead of the embedded build"`
	Git   string `arg:"git" env:"CODEVIEW_GIT" default:"git" help:"git executable"`
}

// ServeCommand runs the HTTP server.
type ServeCommand struct {
	cli.BaseCommand[ServeConfig]
	ui fs.FS
}

var _ cli.Command[ServeConfig] = (*ServeCommand)(nil)

// NewServeCommand serves ui, which holds the UI build under ui/dist, unless --ui-dir overrides it.
func NewServeCommand(ui fs.FS) *ServeCommand { return &ServeCommand{ui: ui} }

func (c *ServeCommand) Help() string { return "Serve the code browser" }

func (c *ServeCommand) Run(_ cli.GlobalFlags, _ cli.Unknowns) error {
	cfg := *c.Inputs
	logger := log.Default()
	root := filepath.Join(cfg.Data, "repos")
	logger.Info(
		"service.booted",
		"service", appName,
		"repos", root,
		"host", cfg.Host,
		"port", cfg.Port,
		"ui_dir", cfg.UIDir,
	)

	store := git.NewCLIStore(git.Config{Root: root, Binary: cfg.Git})
	defer store.Close()

	files, err := webui.FS(cfg.UIDir, c.ui)
	if err != nil {
		return fmt.Errorf("failed to open the UI files: %w", err)
	}

	r := server.NewRouter()
	r.Use(server.SlogMiddleware(server.SlogConfig{}, logger))
	server.Register(r, api.New(store, markdown.NewGoldmark(), logger).Routes())
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
