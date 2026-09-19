package git

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

var errMissing = errors.New("object missing")

type objectInfo struct {
	OID  string
	Type string
	Size int64
}

// catFile keeps a lazy "git cat-file --batch-command" process that exits when idle.
type catFile struct {
	newCmd func() *exec.Cmd
	idle   time.Duration

	mu     sync.Mutex
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout *bufio.Reader
	timer  *time.Timer
}

func newCatFile(newCmd func() *exec.Cmd, idle time.Duration) *catFile {
	return &catFile{newCmd: newCmd, idle: idle}
}

func (c *catFile) start() error {
	cmd := c.newCmd()
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("failed to open cat-file stdin: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("failed to open cat-file stdout: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start cat-file: %w", err)
	}
	c.cmd = cmd
	c.stdin = stdin
	c.stdout = bufio.NewReaderSize(stdout, 64*1024)
	return nil
}

func (c *catFile) stopLocked() {
	if c.cmd == nil {
		return
	}
	_ = c.stdin.Close()
	_ = c.cmd.Process.Kill()
	_ = c.cmd.Wait()
	c.cmd = nil
	c.stdin = nil
	c.stdout = nil
}

func (c *catFile) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.timer != nil {
		c.timer.Stop()
	}
	c.stopLocked()
}

// do kills the process on any protocol error so the next call starts from a clean pipe.
func (c *catFile) do(fn func() error) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.cmd == nil {
		if err := c.start(); err != nil {
			return err
		}
	}
	if c.idle > 0 {
		if c.timer == nil {
			c.timer = time.AfterFunc(c.idle, func() {
				c.mu.Lock()
				defer c.mu.Unlock()
				c.stopLocked()
			})
		} else {
			c.timer.Reset(c.idle)
		}
	}
	err := fn()
	if err != nil && !errors.Is(err, errMissing) {
		c.stopLocked()
	}
	return err
}

func (c *catFile) send(command, object string) error {
	if strings.ContainsAny(object, "\n\x00") {
		return fmt.Errorf(
			"object name %q contains a control character: %w",
			object,
			ErrInvalidArgument,
		)
	}
	if _, err := io.WriteString(c.stdin, command+" "+object+"\n"); err != nil {
		return fmt.Errorf("failed to write cat-file command: %w", err)
	}
	return nil
}

func (c *catFile) readHeader() (objectInfo, error) {
	line, err := c.stdout.ReadString('\n')
	if err != nil {
		return objectInfo{}, fmt.Errorf("failed to read cat-file header: %w", err)
	}
	line = strings.TrimSuffix(line, "\n")
	if strings.HasSuffix(line, " missing") || strings.HasSuffix(line, " ambiguous") {
		return objectInfo{}, errMissing
	}
	fields := strings.Fields(line)
	if len(fields) != 3 {
		return objectInfo{}, fmt.Errorf(
			"failed to parse cat-file header %q: %w",
			line,
			io.ErrUnexpectedEOF,
		)
	}
	size, err := strconv.ParseInt(fields[2], 10, 64)
	if err != nil {
		return objectInfo{}, fmt.Errorf("failed to parse cat-file object size: %w", err)
	}
	return objectInfo{OID: fields[0], Type: fields[1], Size: size}, nil
}

func (c *catFile) Info(object string) (objectInfo, error) {
	var info objectInfo
	err := c.do(func() error {
		if err := c.send("info", object); err != nil {
			return err
		}
		var err error
		info, err = c.readHeader()
		return err
	})
	return info, err
}

// Infos leaves a zero objectInfo for a missing object.
func (c *catFile) Infos(objects []string) ([]objectInfo, error) {
	infos := make([]objectInfo, len(objects))
	err := c.do(func() error {
		for _, o := range objects {
			if strings.ContainsAny(o, "\n\x00") {
				return fmt.Errorf(
					"object name %q contains a control character: %w",
					o,
					ErrInvalidArgument,
				)
			}
		}
		// git blocks on a full stdout pipe, so writing must not wait for reading
		writeErr := make(chan error, 1)
		go func() {
			w := bufio.NewWriter(c.stdin)
			for _, o := range objects {
				if _, err := w.WriteString("info " + o + "\n"); err != nil {
					writeErr <- err
					return
				}
			}
			writeErr <- w.Flush()
		}()
		for i := range objects {
			info, err := c.readHeader()
			if err != nil && !errors.Is(err, errMissing) {
				<-writeErr
				return err
			}
			infos[i] = info
		}
		if err := <-writeErr; err != nil {
			return fmt.Errorf("failed to write cat-file commands: %w", err)
		}
		return nil
	})
	return infos, err
}

// Contents keeps at most limit bytes, or everything when limit is negative.
func (c *catFile) Contents(object string, limit int64) (objectInfo, []byte, error) {
	var (
		info objectInfo
		data []byte
	)
	err := c.do(func() error {
		if err := c.send("contents", object); err != nil {
			return err
		}
		var err error
		info, err = c.readHeader()
		if err != nil {
			return err
		}
		keep := info.Size
		if limit >= 0 && keep > limit {
			keep = limit
		}
		data = make([]byte, keep)
		if _, err := io.ReadFull(c.stdout, data); err != nil {
			return fmt.Errorf("failed to read object %s: %w", info.OID, err)
		}
		// the rest of the object plus cat-file's trailing newline
		if _, err := io.CopyN(io.Discard, c.stdout, info.Size-keep+1); err != nil {
			return fmt.Errorf("failed to skip the rest of object %s: %w", info.OID, err)
		}
		return nil
	})
	return info, data, err
}
