package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
)

// The fields of Mijn lijst the family-food CLI reads (GraphQL `basket`, as albertheijn-mcp verified it on 2026-10-01).
const basketQuery = `query FamilyFoodBasket {
  basket {
    itemsInList { id quantity originCode product { id title priceV2 { now { amount } } } }
    notes { description quantity originCode }
  }
}`

// The open orders with their delivery slot, as appie-go's GetFulfillments asks for them: checked out, reopened for
// changes, or the delivery subscription's empty order for its slot (isSubscriptionOrder, a totalPrice of 0; checked live 2026-11-16).
const openOrdersQuery = `query FamilyFoodOpenOrders {
  orderFulfillments(status: OPEN) {
    result { orderId statusCode statusDescription shoppingType modifiable isSubscriptionOrder closingDateTime totalPrice { totalPrice { amount } } delivery { status slot { date startTime endTime } } }
  }
}`

// basketItemsAdd adds to the quantity already in Mijn lijst.
const basketItemsAdd = `mutation FamilyFoodBasketItemsAdd($items: [BasketMutation!]!) {
  basketItemsAdd(items: $items) { status errorMessage }
}`

// basketItemsUpdate sets a product's quantity in Mijn lijst; basketItemsDelete takes a product line out by id, or
// a free-text note by its description (both checked live 2026-11-28).
const basketItemsUpdate = `mutation FamilyFoodBasketItemsUpdate($items: [BasketMutation!]!) {
  basketItemsUpdate(items: $items) { status errorMessage }
}`

const basketItemsDelete = `mutation FamilyFoodBasketItemsDelete($items: [BasketDelete!]!) {
  basketItemsDelete(items: $items) { status errorMessage }
}`

// basketRemovals is what `basket-remove` reads on stdin: quantities to take off product lines, notes to delete.
type basketRemovals struct {
	Products []struct {
		ID       int `json:"id"`
		Quantity int `json:"quantity"`
	} `json:"products"`
	Notes []struct {
		Description string `json:"description"`
	} `json:"notes"`
}

// basketAdditions is what `basket-add` reads on stdin.
type basketAdditions struct {
	Products []struct {
		ID       int `json:"id"`
		Quantity int `json:"quantity"`
	} `json:"products"`
	Notes []struct {
		Description string `json:"description"`
		Quantity    int    `json:"quantity"`
	} `json:"notes"`
}

// basket returns Mijn lijst as AH's GraphQL `basket` query returns it.
func (a *ah) basket(ctx context.Context) (json.RawMessage, error) {
	c, err := a.userClient(ctx)
	if err != nil {
		return nil, err
	}
	var result struct {
		Basket json.RawMessage `json:"basket"`
	}
	if err := c.DoGraphQL(ctx, basketQuery, nil, &result); err != nil {
		return nil, a.userError("reading Mijn lijst", err)
	}
	return result.Basket, nil
}

// openOrders returns the open orders as AH's GraphQL `orderFulfillments(status: OPEN)` returns them.
func (a *ah) openOrders(ctx context.Context) (json.RawMessage, error) {
	c, err := a.userClient(ctx)
	if err != nil {
		return nil, err
	}
	var result struct {
		OrderFulfillments struct {
			Result json.RawMessage `json:"result"`
		} `json:"orderFulfillments"`
	}
	if err := c.DoGraphQL(ctx, openOrdersQuery, nil, &result); err != nil {
		return nil, a.userError("reading the open orders", err)
	}
	if len(result.OrderFulfillments.Result) == 0 || string(result.OrderFulfillments.Result) == "null" {
		return json.RawMessage("[]"), nil
	}
	return result.OrderFulfillments.Result, nil
}

// activeOrder returns the order open for changes in the AH app (picked when ordering from Mijn lijst, or reopened)
// as AH's REST order summary returns it, or null when none is: AH answers 404 then (checked live 2026-11-16).
// While there is one, basketItemsAdd puts products into it instead of Mijn lijst; notes still go to Mijn lijst.
func (a *ah) activeOrder(ctx context.Context) (json.RawMessage, error) {
	c, err := a.userClient(ctx)
	if err != nil {
		return nil, err
	}
	var order json.RawMessage
	if err := c.DoRequest(ctx, http.MethodGet, "/mobile-services/order/v1/summaries/active?sortBy=DEFAULT", nil, &order); err != nil {
		if a.transport.lastStatus() == http.StatusNotFound {
			return json.RawMessage("null"), nil
		}
		return nil, a.userError("reading the order open for changes", err)
	}
	return order, nil
}

// addToBasket adds products through basketItemsAdd and free-text notes through the shopping list's v2 PATCH
// (the write albertheijn-mcp verified for notes on 2026-10-01), then returns Mijn lijst.
func (a *ah) addToBasket(ctx context.Context, add basketAdditions) (json.RawMessage, error) {
	c, err := a.userClient(ctx)
	if err != nil {
		return nil, err
	}
	if len(add.Products) > 0 {
		items := make([]map[string]int, 0, len(add.Products))
		for _, p := range add.Products {
			if p.Quantity < 1 {
				return nil, fmt.Errorf("basket-add: product %d has quantity %d; only additions are allowed", p.ID, p.Quantity)
			}
			items = append(items, map[string]int{"id": p.ID, "quantity": p.Quantity})
		}
		var result struct {
			BasketItemsAdd struct {
				Status       string `json:"status"`
				ErrorMessage string `json:"errorMessage"`
			} `json:"basketItemsAdd"`
		}
		if err := c.DoGraphQL(ctx, basketItemsAdd, map[string]any{"items": items}, &result); err != nil {
			return nil, a.userError("adding products to Mijn lijst", err)
		}
		if r := result.BasketItemsAdd; r.Status != "SUCCESS" {
			return nil, fmt.Errorf("adding products to Mijn lijst: AH answered %s %s", r.Status, r.ErrorMessage)
		}
	}
	if len(add.Notes) > 0 {
		items := make([]map[string]any, 0, len(add.Notes))
		for _, n := range add.Notes {
			if n.Quantity < 1 {
				return nil, fmt.Errorf("basket-add: note %q has quantity %d; only additions are allowed", n.Description, n.Quantity)
			}
			items = append(items, map[string]any{
				"description": n.Description, "quantity": n.Quantity, "type": "SHOPPABLE", "originCode": "PRD", "strikeThrough": false,
			})
		}
		path := "/mobile-services/shoppinglist/v2/items?orderBy=userInput&orderByParam=0"
		if err := c.DoRequest(ctx, http.MethodPatch, path, map[string]any{"items": items}, nil); err != nil {
			return nil, a.userError("adding notes to Mijn lijst", err)
		}
	}
	return a.basket(ctx)
}

// removeFromBasket takes the quantities off Mijn lijst's product lines (a line that would reach 0 is deleted)
// and deletes the notes, then returns Mijn lijst. Products and notes not in Mijn lijst are skipped. It refuses
// while an order is open for changes in the AH app: whether these mutations change that order is unchecked.
func (a *ah) removeFromBasket(ctx context.Context, remove basketRemovals) (json.RawMessage, error) {
	c, err := a.userClient(ctx)
	if err != nil {
		return nil, err
	}
	active, err := a.activeOrder(ctx)
	if err != nil {
		return nil, err
	}
	if string(active) != "null" {
		return nil, fmt.Errorf("basket-remove: an order is open for changes in the AH app; change it there")
	}
	raw, err := a.basket(ctx)
	if err != nil {
		return nil, err
	}
	var current struct {
		ItemsInList []struct {
			Quantity int `json:"quantity"`
			Product  struct {
				ID int `json:"id"`
			} `json:"product"`
		} `json:"itemsInList"`
		Notes []struct {
			Description string `json:"description"`
		} `json:"notes"`
	}
	if err := json.Unmarshal(raw, &current); err != nil {
		return nil, fmt.Errorf("reading Mijn lijst: %w", err)
	}
	inList := map[int]int{}
	for _, item := range current.ItemsInList {
		inList[item.Product.ID] += item.Quantity
	}
	var updates []map[string]int
	var deletes []map[string]any
	for _, p := range remove.Products {
		if p.Quantity < 1 {
			return nil, fmt.Errorf("basket-remove: product %d has quantity %d; give how many to take off", p.ID, p.Quantity)
		}
		have, ok := inList[p.ID]
		if !ok {
			continue
		}
		if left := have - p.Quantity; left > 0 {
			updates = append(updates, map[string]int{"id": p.ID, "quantity": left})
		} else {
			deletes = append(deletes, map[string]any{"id": p.ID})
		}
	}
	for _, n := range remove.Notes {
		for _, there := range current.Notes {
			if there.Description == n.Description {
				deletes = append(deletes, map[string]any{"description": n.Description})
				break
			}
		}
	}
	type outcome struct {
		Status       string `json:"status"`
		ErrorMessage string `json:"errorMessage"`
	}
	if len(updates) > 0 {
		var result struct {
			BasketItemsUpdate outcome `json:"basketItemsUpdate"`
		}
		if err := c.DoGraphQL(ctx, basketItemsUpdate, map[string]any{"items": updates}, &result); err != nil {
			return nil, a.userError("lowering quantities in Mijn lijst", err)
		}
		if r := result.BasketItemsUpdate; r.Status != "SUCCESS" {
			return nil, fmt.Errorf("lowering quantities in Mijn lijst: AH answered %s %s", r.Status, r.ErrorMessage)
		}
	}
	if len(deletes) > 0 {
		var result struct {
			BasketItemsDelete outcome `json:"basketItemsDelete"`
		}
		if err := c.DoGraphQL(ctx, basketItemsDelete, map[string]any{"items": deletes}, &result); err != nil {
			return nil, a.userError("removing from Mijn lijst", err)
		}
		if r := result.BasketItemsDelete; r.Status != "SUCCESS" {
			return nil, fmt.Errorf("removing from Mijn lijst: AH answered %s %s", r.Status, r.ErrorMessage)
		}
	}
	return a.basket(ctx)
}

// userError turns a 401 into errLogin, so the CLI asks for a new login, and AH not answering into errDown.
func (a *ah) userError(doing string, err error) error {
	if a.transport.lastStatus() == http.StatusUnauthorized {
		return fmt.Errorf("%w (%v)", errLogin, err)
	}
	return a.downError(doing, err)
}

// downError turns a server error or no answer at all into errDown, so the CLI falls back to a shopping list.
func (a *ah) downError(doing string, err error) error {
	var netErr net.Error
	if status := a.transport.lastStatus(); status >= 500 || (status == 0 && errors.As(err, &netErr)) {
		return fmt.Errorf("%s: %w (%v)", doing, errDown, err)
	}
	return fmt.Errorf("%s: %w", doing, err)
}

func basketAdd(ctx context.Context, ah *ah) error {
	b, err := io.ReadAll(os.Stdin)
	if err != nil {
		return err
	}
	var add basketAdditions
	if err := json.Unmarshal(b, &add); err != nil {
		return fmt.Errorf("basket-add: expected {\"products\": [{\"id\", \"quantity\"}], \"notes\": [{\"description\", \"quantity\"}]} on stdin: %w", err)
	}
	basket, err := ah.addToBasket(ctx, add)
	if err != nil {
		return err
	}
	return printJSON(basket)
}

func basketRemove(ctx context.Context, ah *ah) error {
	b, err := io.ReadAll(os.Stdin)
	if err != nil {
		return err
	}
	var remove basketRemovals
	if err := json.Unmarshal(b, &remove); err != nil {
		return fmt.Errorf("basket-remove: expected {\"products\": [{\"id\", \"quantity\"}], \"notes\": [{\"description\"}]} on stdin: %w", err)
	}
	basket, err := ah.removeFromBasket(ctx, remove)
	if err != nil {
		return err
	}
	return printJSON(basket)
}
