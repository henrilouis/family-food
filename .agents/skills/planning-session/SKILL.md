---
name: planning-session
description: Lead the Planning Session that produces next week's Week Menu, from the Novel Recipe review to "lock it". Use when an adult says "plan the week" (or asks for a week menu or meal plan), or asks to change a Locked Week Menu.
---

# planning-session

Lead one conversation that ends with the next Saturday → Friday Week Menu Locked, saved, Published and handed to `fill-basket`. Vocabulary is from `GLOSSARY.md`. The `food` CLI does everything deterministic; run it from this repo (`node cli/food.ts …` if `food` isn't on the PATH). The vault is the `vault` path in `food config`.

The conversation is the draft. Until the adult says "lock it", the only writes are the ones under [Writes before lock](#writes-before-lock), so an interrupted session leaves nothing half-written.

## Rules and numbers

| What | Value |
|---|---|
| Repeat window | the last **3** Week Menu notes (notes, not calendar weeks: a missed week breaks nothing) |
| Weekday active time | `active_minutes` ≤ **45** on weekday cook days (hard) |
| Weekday total time | `total_minutes` ≤ **75** on weekday cook days (soft; a starting value, to tune) |
| Novel Recipe candidates | **3** |
| Rejected site | **2** or more 👎 and no 👍 in `food plan sites`: skip its recipes (a starting value, to tune) |
| Poorly rated recipe | below **3.5** of 5 with at least **10** ratings: skip it; fewer ratings or none count as unrated, never marked down (starting values, to tune) |
| Novel Recipe slot | **Sunday**; Monday when it is cooked as a Double |
| Order deadline | Friday **12:00** before the week's Saturday |

**Default week shape**: Sat single, Sun single (Novel), Mon Double cook, Tue Double 2nd day, Wed Double cook, Thu Double 2nd day, Fri Free Day. The four **cooked dinners** are the single days and the Double cook days; **weekday cook days** are cook days Monday to Friday.

**Hard rules.** A proposal keeps every one. The adult may override any of them; then say so and record the override in `## Notes`.
1. Vegetarian: every Novel Recipe candidate is re-checked for meat and fish (see [candidates.md](candidates.md)).
2. The week shape, as agreed for this week.
3. Double cook days use only Meals with `double: true`, and the week has at least two Doubles.
4. Exactly one Novel Recipe.
5. Weekday cook days: `active_minutes` ≤ 45. A Meal without `active_minutes` stays off weekday cook days unless the adult says it fits.
6. No Novel Recipe whose source URL is in `rejectedSources`.
7. No recipe containing a Household Preferences **Never** item (read the ingredient lists of every proposed dinner and side).

**Soft rules**, highest first. When two conflict the higher one wins, and the proposal says which rule bent and why (also recorded in `## Notes` at lock):
1. **Wishes**: honour at least one Wish a week.
2. **Repeat window**: skip Meals with `inRepeatWindow: true`; otherwise prefer the oldest `lastPlanned` (null = longest ago).
3. **Variety** across the four cooked dinners: distinct cuisines; a `base` value at most twice; no two consecutive cooked dinners sharing a base (`none` never clashes).
4. **Season**: judge it yourself from today's date (the Netherlands); a tiebreaker.
5. **Sides**: a Meal's first `sides` entry by default, on its cook day; for a Double it covers both days.

Also soft: weekday `total_minutes` ≤ 75; Household Preferences **Less** items (plan them rarely) and **Kids** notes. Meals with `steps: 0` are placeholders the Kitchen Display can't cook from: leave them out.

**When the hard rules can't all be met**, show a partial proposal that names each broken rule and offers fixes, for example: repeat a Double from an earlier week (bending the repeat window), turn a Double into two single days, or take a Novel Recipe candidate as the Monday Double.

## Writes before lock

Only these, each straight away:
- The verdict on the last Novel Recipe (`food plan verdict`), and a 👎 Recipe's deletion once the adult confirms it (`food recipe delete`).
- "From now on" edits to `Household.md` and `Staples.md` (see [Standing edits](#standing-edits)). One-off changes ("skip milk this week") stay in the conversation until lock.

## Steps

### 1. Find the week

Run `food plan context`. It prints JSON with `week`, `review`, `recentWeeks`, `rejectedSources` and `meals` (every Meal's properties, `steps`, `lastPlanned`, `inRepeatWindow`). Keep it for the whole session.
- `week.exists`: that Week Menu is already Locked. Say so and offer to change it ([Changing a Locked Week Menu](#changing-a-locked-week-menu)) instead of planning it again.
- `week.late`: follow the [Late path](#late-path) from the start.

Done when you can name the week (`week.days[0]` to `week.days[6]`) and whether it is late.

### 2. Review the last Novel Recipe

`review` is the most recent Week Menu before this week. Skip this step when `review` or `review.novel` is null, or when `review.novelVerdict` is `kept` or `rejected`. When it is already `not cooked` (an interrupted session), go straight to the carry-over below. When `review.novelInVault` is false, the Recipe is gone: record the verdict only.

Ask about `review.novel`: 👍 keep, 👎 delete, or not cooked.
- **👍**: `food plan verdict <review.weekStart> kept`.
- **👎**: ask to confirm the deletion ("Delete *X* from the Recipe Vault? Its verdict and source stay in the week's note, so it is never suggested again."). Run `food plan verdict <review.weekStart> rejected`, then on a yes `food recipe delete "<X>"`. On a no the Recipe stays as an ordinary Meal: the `rejected` verdict already cleared its `novel` (so it never waits as a Novel Recipe again), and its source is in `rejectedSources`, so it is never a candidate again. Plan it like any other Meal.
- **Not cooked**: `food plan verdict <review.weekStart> "not cooked"`. The Recipe **carries over**: it is this week's Novel Recipe with `review.novelSource`, and there is no candidate search. Offer it; if the adult declines it, ask whether to delete it (`food recipe delete`) or keep it waiting (it stays `novel: true`), then search for candidates.

A **waiting** Novel Recipe is a Meal with `novel: true` other than `review.novel`. At most one waits: when one exists and nothing carries over, offer it as this week's Novel Recipe before searching, and when the adult declines a carry-over while another one waits, the choice is delete or keep this week.

Done when the verdict is recorded (or there was nothing to review) and you know whether this week's Novel Recipe is carried over, waiting, or to be found.

### 3. Read the household's input

- **Wishes**: `food notes wishes --json`. Exit 1 means Notes couldn't be read: say why, ask the adult for the Wishes, and go on. Sort each Wish into a vault Meal (match it to a name in `meals`), an idea for the Novel Recipe ("something with pumpkin"), or a constraint ("easy week").
- **Household Preferences**: `<vault>/Household.md`, sections Never, Less and Kids. It may be empty.
- **Staples**: `<vault>/Staples.md` (for step 6).

Done when every Wish is sorted and you have the Never items.

### 4. Propose the whole week, once

Build the week from `meals` by the [rules](#rules-and-numbers): Doubles first (they are the scarce part), then the singles, then the Novel Recipe. Unless it carries over or waits, find the Novel Recipe candidates with [candidates.md](candidates.md), and put candidate 1 on Sunday.

One message shows:
- The seven days: Day, Dinner, Side, Note (Novel / Double: cook / Double: 2nd day / Free Day), with each dinner's cuisine, base and active/total minutes.
- The three candidates side by side, as [candidates.md](candidates.md) lists them (or the carried-over Novel Recipe).
- The Wishes it honours, each soft rule it bends and why, and any hard rule it can't meet with the fixes.

Done when that message has every day, the candidates, and every bent or broken rule named.

### 5. Adjust

Swap dishes, move the Free Day, pick another candidate, make the Novel Recipe the Monday Double (only if it meets the weekday budget and you judge it reheats well; then its day is "Novel, Double: cook" and Tuesday is its 2nd day). After each change re-check the hard rules and show the days that changed. "From now on" remarks become [standing edits](#standing-edits) straight away.

Done when the adult agrees with the week.

### 6. Settle the Staples in one message

Show the Weekly Staples with their quantities and list every Ask Staple, from `Staples.md`. The adult answers with deviations only ("skip milk, PB, oats ×2"). Turn the answer into `## Staples this week` lines, naming Staples as the table's Staple column does:
- `Skip: milk` (none this week) or `Skip: milk ×1` (one fewer)
- `Extra: eggs ×1` (more than usual)
- `Ask Staples: peanut butter, oats ×2` (the Ask Staples chosen; ×n overrides the usual quantity)

"From now on" answers are [standing edits](#standing-edits), not lines. A chosen Staple without an AH id in `Staples.md` goes in a line like any other: Basket filling adds it to Mijn lijst as a free-text note.

Done when every deviation is a line or a standing edit, and the adult has seen the lines.

### 7. Lock it

Only on an explicit "lock it" (or the adult's clear equivalent).

1. Run `food plan context` again. If `week.late` has become true, follow the [Late path](#late-path) before writing.
2. Write the [Week Menu JSON](#the-week-menu-json) to a temp file and run `food plan write <file>`. Exit 1 names what doesn't fit; fix the JSON and run it again.
3. **Save the Novel Recipe**, unless it carried over or waited (it is already in the vault): invoke the `add-recipe` skill with its URL (or text), `novel: true`, the title the Week Menu used, and the folder `Meals`. If add-recipe refuses it (meat), tell the adult, agree another candidate, edit the new note's Novel day row and its `novel` / `novel_source` properties, and invoke add-recipe again.
4. **Delete the honoured Wishes**: `food notes wishes delete <wish>... --json`, each Wish exactly as listed. Exit 2 (or exit 1): Notes won't take the change; tell the adult to delete the `deleteByHand` Wishes (or all honoured ones) by hand, and list them.
5. **Publish**: `food publish`.
   - Exit 0, "Kitchen Display updated…": done.
   - Exit 0, "Kitchen Display not updated, run `food publish` at home": the Week Menu stands; pass the message on.
   - Exit 1: check errors. Fix those in this week's note or the new Recipe and run it again; report others.
6. **Hand off**: invoke the `fill-basket` skill for the week of `week.weekStart`. On the Late path, pass on how the household shops (another AH slot or a store trip). The Week Menu is Locked whatever happens with AH there.

Done when the note is written, the Novel Recipe saved, the Wishes deleted or listed for deletion by hand, the week Published (or the adult told to publish at home), and `fill-basket` started.

## The Week Menu JSON

```json
{
  "weekStart": "2026-11-28",
  "novelSource": "https://www.loveandlemons.com/shakshuka/",
  "days": [
    { "dinner": "Pad Thai" },
    { "dinner": "Shakshuka", "novel": true },
    { "dinner": "Dahl", "side": "Naan", "double": "cook" },
    { "dinner": "Dahl", "double": "second" },
    { "dinner": "Veggie Chili", "double": "cook" },
    { "dinner": "Veggie Chili", "double": "second" },
    { "dinner": null }
  ],
  "staples": ["Skip: milk ×1", "Ask Staples: peanut butter, oats ×2"],
  "notes": ["Bent the repeat window for Dahl (Wish)."]
}
```

- `days` runs Saturday to Friday; `dinner` and `side` are note names; `"dinner": null` is a Free Day. A Double's side goes on its cook day only.
- The Novel Recipe's `dinner` is the title add-recipe will write: English, title case, without `/ \ : * ? " < > | # ^ [ ]`. A carried-over or waiting one keeps its note name, with its existing source.
- `notes` holds every bent soft rule, overridden hard rule and Late path decision.

## Late path

When the session starts or locks after `week.orderBefore`:
1. Say the Saturday delivery is missed: "The order deadline was <orderBefore>, so the Saturday delivery is missed."
2. Ask how the household will shop (another AH slot booked by hand, or a store trip) and which day the food arrives.
3. Plan the days before that day as Free Days or dinners from what is in the house (ask what's there; use vault Meals that fit). Start the Doubles after the food arrives, and name any hard rule the shorter week can't meet.
4. Record it in `## Notes`, e.g. "Late: Saturday delivery missed; store trip, food in on Sunday."

## Standing edits

"From now on" changes are written straight away, and you say what changed.
- **Household Preferences** (`Household.md`): add a `- ` line under `## Never` (ingredient and who: "mushrooms (Kid 1)"), `## Less` or `## Kids`. Keep the headings and their guidance lines.
- **Staples** (`Staples.md`): change a row's Quantity or Kind (Weekly / Ask), or remove the row. For a new Staple, find the product with `food ah bought "<Dutch name>"` (or `food ah search`), confirm it with the adult, and add a row in the table's existing columns and format.

## Changing a Locked Week Menu

When an adult asks to change a Locked Week Menu (this week's or the next): edit its note in place. Change the day rows; the `novel` / `novel_source` properties when the Novel Recipe changes; `## Staples this week`; and add a `## Notes` line saying what changed. `## Basket` belongs to `fill-basket` and `novel_verdict` to the next review; leave both as they are. The hard rules still hold (the vault check catches a Double cook day whose dinner isn't `double: true`). Then run `food publish`, and if dinners or Staples changed after the Basket was filled, offer to run `fill-basket` again.
