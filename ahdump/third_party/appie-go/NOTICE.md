# appie-go, patched copy

The Go package of [edeckers/appie-go](https://github.com/edeckers/appie-go) at commit [`cef776a`](https://github.com/edeckers/appie-go/commit/cef776a), a fork of [gwillem/appie-go](https://github.com/gwillem/appie-go), licensed under the GNU AGPL v3 (`LICENSE`). Only the package's own files are copied, plus `login_test.go`; the `cmd/`, docs and the other tests are left out.

## Changes from cef776a

20 November 2026, for family-food: AH's login page moved to the Next.js App Router. After the login it fetches `/login/ingelogd` as a React Server Components payload holding `appie://login-exit?code=…`, and no longer fetches `ingelogd.json`, so the login hung on a page reading "redirect".
- `login.go`: `takeServerComponentsCode` takes the code from the body of `/login/ingelogd` (and `/login/api/login`), and the browser goes on to the success page.
- `login_test.go`: `TestLoginReadsCodeFromServerComponentsPayload`.

Drop this copy, and pin a module version again in `../../go.mod`, once upstream handles the new login page.

```sh
go test ./...   # in this folder
```
