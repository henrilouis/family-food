package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"syscall"
	"time"

	appie "github.com/gwillem/appie-go"
)

// An honest User-Agent: this is a household tool, not the AH app.
const userAgent = "family-food-ahdump/0.1 (personal household use; +https://github.com/henrilouis/family-food)"

// pause is the least time between two requests to AH, also across ahdump runs.
const pause = 1 * time.Second

const clientID = "appie-ios"

// ah talks to AH's app API with the household's token file. Keep volume low.
type ah struct {
	authFile  string
	anonFile  string
	transport *politeTransport
}

func newAH(authFile string) *ah {
	dir := filepath.Dir(authFile)
	return &ah{
		authFile:  authFile,
		anonFile:  filepath.Join(dir, "ah-anonymous-token.json"),
		transport: &politeTransport{base: http.DefaultTransport, stamp: filepath.Join(dir, "ah.lock")},
	}
}

func (a *ah) client(opts ...appie.Option) *appie.Client {
	return appie.New(append([]appie.Option{appie.WithHTTPClient(&http.Client{Transport: a.transport, Timeout: 30 * time.Second})}, opts...)...)
}

// tokenFile is appie-go's config file format, so the `appie` CLI can read it too.
type tokenFile struct {
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token"`
	MemberID     string    `json:"member_id,omitempty"`
	ExpiresAt    time.Time `json:"expires_at,omitempty"`
}

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
}

func readToken(path string) (tokenFile, error) {
	var t tokenFile
	b, err := os.ReadFile(path)
	if err != nil {
		return t, err
	}
	return t, json.Unmarshal(b, &t)
}

// writeToken replaces the token file in one step, readable only by this user.
func writeToken(path string, t tokenFile) error {
	b, err := json.MarshalIndent(t, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".ah-token-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if err := tmp.Chmod(0o600); err != nil {
		return err
	}
	if _, err := tmp.Write(b); err != nil {
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}

// login runs appie-go's local-proxy login in the default browser: the person
// logs in on AH's real login page, and the token is written to the token file.
func (a *ah) login(ctx context.Context) error {
	if err := os.MkdirAll(filepath.Dir(a.authFile), 0o700); err != nil {
		return err
	}
	fmt.Println("Opening the Albert Heijn login page in your browser. Log in there; this waits until you have.")
	if err := a.client(appie.WithConfigPath(a.authFile)).Login(ctx); err != nil {
		return fmt.Errorf("login failed: %w", err)
	}
	t, err := readToken(a.authFile)
	if err != nil || t.RefreshToken == "" {
		return fmt.Errorf("login finished but no token was saved to %s", a.authFile)
	}
	return os.Chmod(a.authFile, 0o600)
}

// refresh renews the user token now. AH hands out a new refresh token every time.
func (a *ah) refresh(ctx context.Context) error {
	t, err := readToken(a.authFile)
	if errors.Is(err, os.ErrNotExist) || (err == nil && t.RefreshToken == "") {
		return errLogin
	}
	if err != nil {
		return err
	}
	var tok tokenResponse
	body := map[string]string{"clientId": clientID, "refreshToken": t.RefreshToken}
	if err := a.client().DoRequest(ctx, http.MethodPost, "/mobile-auth/v1/auth/token/refresh", body, &tok); err != nil {
		if status := a.transport.lastStatus(); status >= 400 && status < 500 {
			return fmt.Errorf("%w (%v)", errLogin, err)
		}
		return fmt.Errorf("renewing the login: %w", err)
	}
	t.AccessToken, t.RefreshToken = tok.AccessToken, tok.RefreshToken
	t.ExpiresAt = time.Now().Add(time.Duration(tok.ExpiresIn) * time.Second)
	return writeToken(a.authFile, t)
}

// userClient returns a client with the user token, renewed first when it is about to expire.
func (a *ah) userClient(ctx context.Context) (*appie.Client, error) {
	t, err := readToken(a.authFile)
	if errors.Is(err, os.ErrNotExist) {
		return nil, errLogin
	}
	if err != nil {
		return nil, err
	}
	if t.ExpiresAt.IsZero() || time.Until(t.ExpiresAt) < 5*time.Minute {
		if err := a.refresh(ctx); err != nil {
			return nil, err
		}
		if t, err = readToken(a.authFile); err != nil {
			return nil, err
		}
	}
	return a.client(appie.WithTokens(t.AccessToken, t.RefreshToken)), nil
}

// anonymousClient returns a client with an anonymous token, reused while it is valid (about 7 days).
func (a *ah) anonymousClient(ctx context.Context) (*appie.Client, error) {
	t, err := readToken(a.anonFile)
	if err != nil || time.Until(t.ExpiresAt) < time.Hour {
		var tok tokenResponse
		body := map[string]string{"clientId": clientID}
		if err := a.client().DoRequest(ctx, http.MethodPost, "/mobile-auth/v1/auth/token/anonymous", body, &tok); err != nil {
			return nil, fmt.Errorf("getting an anonymous token: %w", err)
		}
		t = tokenFile{AccessToken: tok.AccessToken, ExpiresAt: time.Now().Add(time.Duration(tok.ExpiresIn) * time.Second)}
		if err := writeToken(a.anonFile, t); err != nil {
			return nil, err
		}
	}
	return a.client(appie.WithTokens(t.AccessToken, "")), nil
}

// search returns AH's REST product search results as AH sends them.
func (a *ah) search(ctx context.Context, query string, user bool, sortOn string, size int) ([]json.RawMessage, error) {
	var c *appie.Client
	var err error
	if user {
		c, err = a.userClient(ctx)
	} else {
		c, err = a.anonymousClient(ctx)
	}
	if err != nil {
		return nil, err
	}
	params := url.Values{}
	params.Set("query", query)
	params.Set("page", "0")
	params.Set("size", strconv.Itoa(size))
	params.Set("sortOn", sortOn)
	var result struct {
		Products []json.RawMessage `json:"products"`
	}
	if err := c.DoRequest(ctx, http.MethodGet, "/mobile-services/product/search/v2?"+params.Encode(), nil, &result); err != nil {
		if user && a.transport.lastStatus() == http.StatusUnauthorized {
			return nil, fmt.Errorf("%w (%v)", errLogin, err)
		}
		return nil, fmt.Errorf("search failed: %w", err)
	}
	if result.Products == nil {
		result.Products = []json.RawMessage{}
	}
	return result.Products, nil
}

// politeTransport sends one request at a time with an honest User-Agent, and
// waits so that requests are at least `pause` apart, also across ahdump runs
// (the stamp file's modification time is the last request's time).
type politeTransport struct {
	base   http.RoundTripper
	stamp  string
	mu     sync.Mutex
	status int
}

func (t *politeTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if info, err := os.Stat(t.stamp); err == nil {
		if wait := pause - time.Since(info.ModTime()); wait > 0 {
			time.Sleep(wait)
		}
	}
	req = req.Clone(req.Context())
	req.Header.Set("User-Agent", userAgent)
	resp, err := t.base.RoundTrip(req)
	now := time.Now()
	_ = os.Chtimes(t.stamp, now, now)
	t.status = 0
	if resp != nil {
		t.status = resp.StatusCode
	}
	return resp, err
}

func (t *politeTransport) lastStatus() int {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.status
}

// lock holds an exclusive lock on path until the returned function is called or the process ends.
func lock(path string) (func(), error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX); err != nil {
		f.Close()
		return nil, fmt.Errorf("locking %s: %w", path, err)
	}
	return func() { f.Close() }, nil
}

func printJSON(v any) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}
