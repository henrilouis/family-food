// ahdump is the family-food CLI's way into Albert Heijn's unofficial app API,
// through appie-go. The `food` CLI runs it; each command prints JSON on stdout.
// It only adds to Mijn lijst, and never removes or checks out anything.
//
//	ahdump -auth <token file> login
//	ahdump -auth <token file> refresh
//	ahdump -auth <token file> search [-token anonymous|user] [-sort RELEVANCE|PURCHASE_FREQUENCY] [--] <query>
//	ahdump -auth <token file> basket
//	ahdump -auth <token file> basket-add < {"products": [{"id", "quantity"}], "notes": [{"description", "quantity"}]}
//	ahdump -auth <token file> orders
//	ahdump -auth <token file> recipes [-size n] [-filter group=value]... [--] [search text]
//	ahdump -auth <token file> recipe <id>
//	ahdump -auth <token file> recipe-suggestions <id>
//	ahdump -auth <token file> history -out <folder>
//
// Exit codes: 0 done, 1 failed, 3 not logged in or AH refused the login (run login again),
// 4 AH didn't answer or answered with a server error (its ordering may be down).
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
)

const usage = `usage: ahdump -auth <token file> <command>

commands:
  login                   log in to AH in your browser and write the token file
  refresh                 renew the login now
  search [-token anonymous|user] [-sort RELEVANCE|PURCHASE_FREQUENCY] [--] <query>
                          print AH's product search results as JSON
  basket                  print Mijn lijst as JSON
  basket-add              add the products and free-text notes given as JSON on stdin to Mijn lijst
                          ({"products": [{"id", "quantity"}], "notes": [{"description", "quantity"}]}),
                          then print Mijn lijst; quantities add to what is there, nothing is removed
  orders                  print the open orders (checked out or reopened) with their delivery slot as JSON
  recipes [-size n] [-filter group=value]... [--] [search text]
                          print Allerhande recipe search results as JSON (anonymous token);
                          -filter e.g. speciale-wensen=vegetarisch, menugang=hoofdgerecht, seizoen=winter
  recipe <id>             print one Allerhande recipe as JSON (null when there is none)
  recipe-suggestions <id> print AH's product for each ingredient of an Allerhande recipe as JSON
  history -out <folder>   pull closed online orders and in-store receipts into a folder`

// errLogin means the user token is missing or AH refused it.
var errLogin = errors.New("not logged in to AH, or AH refused the login: log in again")

// errDown means AH didn't answer, or answered with a server error: its online ordering may be down.
var errDown = errors.New("AH is not answering; its online ordering may be down")

const loginExitCode = 3
const downExitCode = 4

func main() {
	log.SetFlags(0)
	log.SetPrefix("ahdump: ")
	auth := flag.String("auth", "", "token file (written by login, renewed by every command that needs the login)")
	flag.Usage = func() { fmt.Fprintln(os.Stderr, usage) }
	flag.Parse()
	if *auth == "" || flag.NArg() == 0 {
		flag.Usage()
		os.Exit(2)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()

	// One ahdump at a time: AH rotates the refresh token on every renewal, so two
	// processes renewing at once would log the household out.
	unlock, err := lock(filepath.Join(filepath.Dir(*auth), "ah.lock"))
	if err != nil {
		log.Fatal(err)
	}
	defer unlock()

	ah := newAH(*auth)
	command, args := flag.Arg(0), flag.Args()[1:]
	switch command {
	case "login":
		err = ah.login(ctx)
	case "refresh":
		err = ah.refresh(ctx)
	case "search":
		err = search(ctx, ah, args)
	case "basket":
		var basket []byte
		if basket, err = ah.basket(ctx); err == nil {
			err = printJSON(json.RawMessage(basket))
		}
	case "basket-add":
		err = basketAdd(ctx, ah)
	case "orders":
		var orders []byte
		if orders, err = ah.openOrders(ctx); err == nil {
			err = printJSON(json.RawMessage(orders))
		}
	case "recipes":
		err = searchRecipes(ctx, ah, args)
	case "recipe":
		err = recipe(ctx, ah, args)
	case "recipe-suggestions":
		err = recipeSuggestions(ctx, ah, args)
	case "history":
		err = history(ctx, ah, args)
	default:
		flag.Usage()
		os.Exit(2)
	}
	if err != nil {
		log.Print(err)
		if errors.Is(err, errLogin) {
			os.Exit(loginExitCode)
		}
		if errors.Is(err, errDown) {
			os.Exit(downExitCode)
		}
		os.Exit(1)
	}
}

func search(ctx context.Context, ah *ah, args []string) error {
	fs := flag.NewFlagSet("search", flag.ExitOnError)
	token := fs.String("token", "anonymous", "anonymous or user")
	sort := fs.String("sort", "RELEVANCE", "RELEVANCE or PURCHASE_FREQUENCY (needs the user token)")
	size := fs.Int("size", 30, "number of results")
	fs.Parse(args)
	query := strings.Join(fs.Args(), " ")
	if query == "" {
		return fmt.Errorf("search: no query\n%s", usage)
	}
	if *token != "anonymous" && *token != "user" {
		return fmt.Errorf("search: -token must be anonymous or user, not %q", *token)
	}
	products, err := ah.search(ctx, query, *token == "user", *sort, *size)
	if err != nil {
		return err
	}
	return printJSON(products)
}
