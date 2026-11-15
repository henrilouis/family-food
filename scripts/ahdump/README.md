# ahdump

Throwaway script from the task "Make our Albert Heijn purchase history available to the agent" (henrilouis/food-automation#6). Never merged.

Pulls closed online orders and in-store Bonuskaart receipts from the unofficial AH app API (read-only), using appie-go pinned to edeckers' fork at `cef776a` (fixes the 6 Nov 2026 login change, gwillem/appie-go#34).

```sh
# log in once (opens the real AH login page through a local proxy)
git clone https://github.com/edeckers/appie-go && cd appie-go && git checkout cef776a
go build -o appie ./cmd/appie
./appie -c "$HOME/Library/Application Support/food-automation/ah-auth.json" login

# pull (re-runs skip orders/receipts already on disk)
cd scripts/ahdump && go build -o ahdump .
./ahdump -config "$HOME/Library/Application Support/food-automation/ah-auth.json" \
  -out "$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes/Recipes/AH purchase history"
```
