package main

// history pulls the household's AH purchase history (closed online orders and
// in-store Bonuskaart receipts) into a local folder: raw API JSON per order and
// receipt, plus one flattened lines.jsonl. Re-runs skip orders and receipts
// already on disk. Read-only: it never writes to AH.

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"

	appie "github.com/gwillem/appie-go"
)

const closedOrdersQuery = `query OrderFulfillments {
  orderFulfillments(status: CLOSED) {
    result {
      orderId
      statusCode
      statusDescription
      shoppingType
      transactionCompleted
      totalPrice { totalPrice { amount } discount { amount } }
      delivery { status method slot { date startTime endTime } }
    }
  }
}`

const receiptsPageQuery = `query FetchPosReceipts($offset: Int!, $limit: Int!) {
  posReceiptsPage(pagination: {offset: $offset, limit: $limit}) {
    posReceipts { id dateTime totalAmount { amount } }
  }
}`

const receiptDetailsQuery = `query FetchReceipt($id: String!) {
  posReceiptDetails(id: $id) {
    id
    products { id quantity name price { amount } amount { amount } }
    discounts { name amount { amount } }
    payments { method amount { amount } }
  }
}`

type line struct {
	Date      string  `json:"date"`
	Source    string  `json:"source"` // "online" or "store"
	SourceID  string  `json:"sourceId"`
	WebshopID int     `json:"webshopId,omitempty"`
	PosID     int     `json:"posId,omitempty"`
	Title     string  `json:"title"`
	Brand     string  `json:"brand,omitempty"`
	Size      string  `json:"size,omitempty"`
	Category  string  `json:"category,omitempty"`
	Quantity  float64 `json:"quantity"`
	UnitPrice float64 `json:"unitPrice,omitempty"`
	Amount    float64 `json:"amount,omitempty"`
}

func history(ctx context.Context, ah *ah, args []string) error {
	fs := flag.NewFlagSet("history", flag.ExitOnError)
	out := fs.String("out", "", "output folder")
	fs.Parse(args)
	if *out == "" {
		return fmt.Errorf("history: no -out folder\n%s", usage)
	}
	client, err := ah.userClient(ctx)
	if err != nil {
		return err
	}
	for _, d := range []string{"orders", "receipts"} {
		must(os.MkdirAll(filepath.Join(*out, d), 0o755))
	}

	var lines []line
	lines = append(lines, dumpOrders(ctx, client, *out)...)
	lines = append(lines, dumpReceipts(ctx, client, *out)...)

	sort.SliceStable(lines, func(i, j int) bool { return lines[i].Date < lines[j].Date })
	f, err := os.Create(filepath.Join(*out, "lines.jsonl"))
	must(err)
	w := bufio.NewWriter(f)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	for _, l := range lines {
		must(enc.Encode(l))
	}
	must(w.Flush())
	must(f.Close())
	log.Printf("wrote %d lines", len(lines))
	return nil
}

func dumpOrders(ctx context.Context, c *appie.Client, out string) []line {
	var raw json.RawMessage
	must(c.DoGraphQL(ctx, closedOrdersQuery, nil, &raw))
	writeJSON(filepath.Join(out, "orders", "index.json"), raw)

	var idx struct {
		OrderFulfillments struct {
			Result []struct {
				OrderID int `json:"orderId"`
			} `json:"result"`
		} `json:"orderFulfillments"`
	}
	must(json.Unmarshal(raw, &idx))
	log.Printf("%d closed online orders", len(idx.OrderFulfillments.Result))

	var lines []line
	for _, o := range idx.OrderFulfillments.Result {
		path := filepath.Join(out, "orders", fmt.Sprintf("%d.json", o.OrderID))
		body, ok := readCached(path)
		if !ok {
			var detail json.RawMessage
			if err := c.DoRequest(ctx, "GET", fmt.Sprintf("/mobile-services/order/v1/%d/details-grouped-by-taxonomy", o.OrderID), nil, &detail); err != nil {
				log.Printf("order %d: %v", o.OrderID, err)
				continue
			}
			writeJSON(path, detail)
			body = detail
		}
		var d struct {
			OrderID      int    `json:"orderId"`
			DeliveryDate string `json:"deliveryDate"`
			Groups       []struct {
				TaxonomyName string `json:"taxonomyName"`
				Products     []struct {
					Quantity          float64 `json:"quantity"`
					AllocatedQuantity float64 `json:"allocatedQuantity"`
					Product           struct {
						WebshopID        int     `json:"webshopId"`
						Title            string  `json:"title"`
						Brand            string  `json:"brand"`
						SalesUnitSize    string  `json:"salesUnitSize"`
						PriceBeforeBonus float64 `json:"priceBeforeBonus"`
						CurrentPrice     float64 `json:"currentPrice"`
					} `json:"product"`
				} `json:"orderedProducts"`
			} `json:"groupedProductsInTaxonomy"`
		}
		must(json.Unmarshal(body, &d))
		for _, g := range d.Groups {
			for _, p := range g.Products {
				price := p.Product.PriceBeforeBonus
				if p.Product.CurrentPrice > 0 {
					price = p.Product.CurrentPrice
				}
				qty := p.AllocatedQuantity
				if qty == 0 {
					qty = p.Quantity
				}
				lines = append(lines, line{
					Date: d.DeliveryDate, Source: "online", SourceID: fmt.Sprint(d.OrderID),
					WebshopID: p.Product.WebshopID, Title: p.Product.Title, Brand: p.Product.Brand,
					Size: p.Product.SalesUnitSize, Category: g.TaxonomyName,
					Quantity: qty, UnitPrice: price,
				})
			}
		}
	}
	return lines
}

func dumpReceipts(ctx context.Context, c *appie.Client, out string) []line {
	type receiptRef struct {
		ID       string `json:"id"`
		DateTime string `json:"dateTime"`
	}
	var all []json.RawMessage
	var refs []receiptRef
	for offset := 0; ; offset += 100 {
		var page struct {
			PosReceiptsPage struct {
				PosReceipts []json.RawMessage `json:"posReceipts"`
			} `json:"posReceiptsPage"`
		}
		must(c.DoGraphQL(ctx, receiptsPageQuery, map[string]any{"offset": offset, "limit": 100}, &page))
		rs := page.PosReceiptsPage.PosReceipts
		for _, r := range rs {
			var ref receiptRef
			must(json.Unmarshal(r, &ref))
			refs = append(refs, ref)
		}
		all = append(all, rs...)
		if len(rs) < 100 {
			break
		}
	}
	idx, _ := json.Marshal(all)
	writeJSON(filepath.Join(out, "receipts", "index.json"), idx)
	log.Printf("%d in-store receipts", len(refs))

	var lines []line
	for _, ref := range refs {
		path := filepath.Join(out, "receipts", ref.ID+".json")
		body, ok := readCached(path)
		if !ok {
			var detail struct {
				PosReceiptDetails json.RawMessage `json:"posReceiptDetails"`
			}
			if err := c.DoGraphQL(ctx, receiptDetailsQuery, map[string]any{"id": ref.ID}, &detail); err != nil {
				log.Printf("receipt %s: %v", ref.ID, err)
				continue
			}
			var r struct {
				Products []struct {
					ID int `json:"id"`
				} `json:"products"`
			}
			must(json.Unmarshal(detail.PosReceiptDetails, &r))
			ids := make([]int, 0, len(r.Products))
			for _, p := range r.Products {
				ids = append(ids, p.ID)
			}
			conv, err := c.ConvertPOSIDs(ctx, ids)
			if err != nil {
				log.Printf("receipt %s convert ids: %v", ref.ID, err)
			}
			body, _ = json.Marshal(map[string]any{
				"dateTime":         ref.DateTime,
				"receipt":          detail.PosReceiptDetails,
				"posIdToWebshopId": conv,
			})
			writeJSON(path, body)
		}
		var saved struct {
			DateTime string `json:"dateTime"`
			Receipt  struct {
				ID       string `json:"id"`
				Products []struct {
					ID       int     `json:"id"`
					Quantity float64 `json:"quantity"`
					Name     string  `json:"name"`
					Price    *struct {
						Amount float64 `json:"amount"`
					} `json:"price"`
					Amount struct {
						Amount float64 `json:"amount"`
					} `json:"amount"`
				} `json:"products"`
			} `json:"receipt"`
			Conv map[string]int `json:"posIdToWebshopId"`
		}
		must(json.Unmarshal(body, &saved))
		date := saved.DateTime
		if len(date) >= 10 {
			date = date[:10]
		}
		for _, p := range saved.Receipt.Products {
			l := line{
				Date: date, Source: "store", SourceID: saved.Receipt.ID,
				PosID: p.ID, WebshopID: saved.Conv[fmt.Sprint(p.ID)], Title: p.Name,
				Quantity: p.Quantity, Amount: p.Amount.Amount,
			}
			if p.Price != nil {
				l.UnitPrice = p.Price.Amount
			}
			lines = append(lines, l)
		}
	}
	return lines
}

func readCached(path string) (json.RawMessage, bool) {
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, false
	}
	return b, true
}

func writeJSON(path string, raw []byte) {
	var v any
	must(json.Unmarshal(raw, &v))
	b, err := json.MarshalIndent(v, "", "  ")
	must(err)
	must(os.WriteFile(path, b, 0o644))
}

func must(err error) {
	if err != nil {
		log.Fatal(err)
	}
}
