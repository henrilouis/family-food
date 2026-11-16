package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"sort"
	"strconv"
	"strings"
)

// Allerhande recipe search, with the fields the family-food CLI reads (albertheijn-mcp's FetchRecipes, checked
// live 2026-10-28, plus `slug`, `time`, `serving` and `rating` from appie-go's schema dump of RecipeSummary).
const recipeSearchQuery = `query FamilyFoodRecipeSearch($searchText: String, $start: Int, $size: PageSize, $sortBy: RecipeSearchSortOption, $filters: [RecipeSearchQueryFilter!], $recipeIds: [Int!]!) {
  recipeSearchV2(searchText: $searchText, start: $start, size: $size, sortBy: $sortBy, filters: $filters, recipeIds: $recipeIds) {
    page { total hasNextPage }
    result { id title slug time { cook oven wait } serving { number } rating { average count } tags { key value } }
  }
}`

// One Allerhande recipe (albertheijn-mcp's detail query, checked live 2026-10-28, plus `rating` from the schema
// dump). The id goes into the query as a number literal, as albertheijn-mcp sends it.
const recipeQuery = `query FamilyFoodRecipe {
  recipe(id: %d) {
    id title href cookTime ovenTime waitTime
    servings { number }
    ingredients { text quantity quantityUnit { singular plural } name { singular plural } }
    preparation { steps }
    tags { key value }
    rating { average count }
  }
}`

// AH's product for each ingredient of a recipe (albertheijn-mcp's probe, 6 of 6 ingredients mapped live 2026-10-28).
const recipeSuggestionsQuery = `query FamilyFoodRecipeProductSuggestions {
  recipeProductSuggestionsV2(options: { recipeId: %d }) {
    optional
    ingredient { name completeText }
    productSuggestion { quantity product { id title salesUnitSize priceV2 { now { amount } } } }
  }
}`

// filterFlags collects repeated `-filter group=value` flags.
type filterFlags map[string][]string

func (f filterFlags) String() string { return fmt.Sprint(map[string][]string(f)) }

func (f filterFlags) Set(s string) error {
	group, value, ok := strings.Cut(s, "=")
	if !ok || group == "" || value == "" {
		return fmt.Errorf("want group=value, e.g. speciale-wensen=vegetarisch, not %q", s)
	}
	f[group] = append(f[group], value)
	return nil
}

// searchRecipes prints Allerhande's search results (recipeSearchV2 `result`) as AH sends them.
func searchRecipes(ctx context.Context, ah *ah, args []string) error {
	fs := flag.NewFlagSet("recipes", flag.ExitOnError)
	filters := filterFlags{}
	fs.Var(filters, "filter", "group=value, repeatable (e.g. speciale-wensen=vegetarisch, menugang=hoofdgerecht, seizoen=winter, keuken=italiaans)")
	size := fs.Int("size", 20, "number of results")
	fs.Parse(args)

	groups := make([]string, 0, len(filters))
	for group := range filters {
		groups = append(groups, group)
	}
	sort.Strings(groups)
	queryFilters := make([]map[string]any, 0, len(groups))
	for _, group := range groups {
		queryFilters = append(queryFilters, map[string]any{"group": group, "values": filters[group]})
	}
	variables := map[string]any{
		"start": 0, "size": *size, "sortBy": "MOST_RELEVANT", "filters": queryFilters, "recipeIds": []int{},
	}
	if text := strings.Join(fs.Args(), " "); text != "" {
		variables["searchText"] = text
	}

	var result struct {
		RecipeSearchV2 struct {
			Result json.RawMessage `json:"result"`
		} `json:"recipeSearchV2"`
	}
	if err := ah.anonymousGraphQL(ctx, "searching Allerhande", recipeSearchQuery, variables, &result); err != nil {
		return err
	}
	return printJSON(orEmptyList(result.RecipeSearchV2.Result))
}

// recipe prints one Allerhande recipe as AH sends it, or null when AH has none with that id.
func recipe(ctx context.Context, ah *ah, args []string) error {
	id, err := recipeID("recipe", args)
	if err != nil {
		return err
	}
	var result struct {
		Recipe json.RawMessage `json:"recipe"`
	}
	if err := ah.anonymousGraphQL(ctx, "reading the Allerhande recipe", fmt.Sprintf(recipeQuery, id), nil, &result); err != nil {
		return err
	}
	if len(result.Recipe) == 0 {
		result.Recipe = json.RawMessage("null")
	}
	return printJSON(result.Recipe)
}

// recipeSuggestions prints AH's product suggestions for a recipe's ingredients as AH sends them.
func recipeSuggestions(ctx context.Context, ah *ah, args []string) error {
	id, err := recipeID("recipe-suggestions", args)
	if err != nil {
		return err
	}
	var result struct {
		Suggestions json.RawMessage `json:"recipeProductSuggestionsV2"`
	}
	if err := ah.anonymousGraphQL(ctx, "reading AH's product suggestions", fmt.Sprintf(recipeSuggestionsQuery, id), nil, &result); err != nil {
		return err
	}
	return printJSON(orEmptyList(result.Suggestions))
}

func recipeID(command string, args []string) (int, error) {
	if len(args) != 1 {
		return 0, fmt.Errorf("%s: give one recipe id\n%s", command, usage)
	}
	id, err := strconv.Atoi(args[0])
	if err != nil || id <= 0 {
		return 0, fmt.Errorf("%s: the recipe id is a number (R-R<number> in its address), not %q", command, args[0])
	}
	return id, nil
}

// anonymousGraphQL runs a GraphQL query with the anonymous token; AH not answering is errDown.
func (a *ah) anonymousGraphQL(ctx context.Context, doing, query string, variables map[string]any, result any) error {
	c, err := a.anonymousClient(ctx)
	if err != nil {
		return err
	}
	if err := c.DoGraphQL(ctx, query, variables, result); err != nil {
		return a.downError(doing, err)
	}
	return nil
}

func orEmptyList(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 || string(raw) == "null" {
		return json.RawMessage("[]")
	}
	return raw
}
