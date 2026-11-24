# Token Radar — pre-token protocols, ranked by implied value

[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)

A token launch radar: it reads a snapshot of the protocol universe (758 protocols,
40 on a watchlist, floor $50M TVL) and ranks the pre-token protocols by an implied
value — an estimate of what a token could be worth, built only from the snapshot's
own figures. No protocol name is ever special-cased; one function scores every row.

## The model (radar-2)

```
implied = round( TVL × category multiple × growth × maturity × breadth )
```

- **Category multiple** — the median market-cap / TVL ratio of the snapshot's own
  live-token protocols in the same category (global median where a category has
  fewer than 4 comparables), clamped to 0.03–1.50. A category whose live tokens the
  market values richly against TVL gives its pre-token protocols a higher value.
- **Growth** — the 7-day TVL change on a saturating log scale, so one explosive week
  cannot dominate: a +4448% week scores barely above a +120% one.
- **Maturity** — a launch-window curve over the protocol's age: 0.70 for a new
  listing, 1.00 at two years, falling back toward 0.70 for protocols that have run
  for years with no token.
- **Breadth** — +0.03 per chain beyond the first, up to 8 extra chains.

The board covers the whole 40-protocol watchlist and adds the 160 pre-token
protocols below the $50M floor that the model itself scores highest (200 rows).
Each row carries a six-step farm plan with a cost and a time on every step,
derived from the protocol's category, chains, TVL and age. Live-token protocols
are set aside with their market caps shown, never mixed into the ranking.

## Run it

Node 22 or later, standard library only, no network:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

This writes `out/board.json` (the ranked board), `out/data.js` (the dashboard's
dataset), `out/dashboard/` (the static page) and `out/screenshots/`, then
`out/dossier.json`. The program is deterministic: two runs write the same bytes.

## The dashboard

`dashboard/` is a static page (no framework, no network). It shows the ranked
board with search, category and watchlist filters and sortable columns, a detail
drawer for each protocol with its model breakdown and farm plan, the live-token
view, the model explainer with the category multiples the snapshot measured, and
a chart of implied value by category. The page recomputes each row and rebuilds
each farm plan with the same arithmetic, so the page and the board agree.
