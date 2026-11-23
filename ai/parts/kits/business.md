### Business and economics diagrams

Every block below is a numbered figure (or table) that takes `caption`, `id`, `source`, `width`, `align`, `wrap`. Write plain lines; the builder draws the diagram and does the sums. Separate list items with `;`. Names are forgiving (`Politics` works for `Political`) and a misspelt name gets a "did you mean" error.

| Block | What to write |
|---|---|
| `:::gantt` | `Task: 2-4` (periods 2 to 4), `Task: 2 for 3`, `Task: after Other task, 3`, `Task: milestone 8`, `section Name`. Options `unit: week`, `periods: Jan, Feb, Mar` (then tasks may use `Feb-Apr`). |
| `:::pestle` / `:::steep` | `Political: item; item` for Political, Economic, Social, Technological, Legal, Environmental (STEEP has no Legal). Indented `- item` lines also work. |
| `:::porter` | `Rivalry`, `New entrants`, `Suppliers`, `Buyers`, `Substitutes`, each `Name: item; item`. An item that is only `High`, `Medium` or `Low` becomes a force rating. |
| `:::bcg` | `Product: share 1.8, growth 14, size 40` (relative market share, market growth %, bubble size). `bubble: annual sales` labels the bubbles; `growth-line: 10` and `share-line: 1` move the dividing lines. |
| `:::ansoff` | `Penetration`, `Product development`, `Market development`, `Diversification`, each with `; ` items. |
| `:::stakeholder` | `Owners: power 9, interest 8` (scores 0 to 10); also `Owners: 9, 8` (power first). |
| `:::fishbone` | `effect: Falling sales`, then 1 to 6 lines `People: cause; cause`. |
| `:::breakeven` | `fixed costs`, `variable cost` (per unit), `price`; optional `output` (adds margin of safety), `max`, `currency`. Break-even point, profit and loss areas are computed. |
| `:::decisiontree` | An unindented option line (add `(cost 100000)`), then indented outcomes `Strong demand (0.6): 400000` (probability as 0.6 or 60%). Expected values are computed and the best option is marked. `decision: Question`, `currency: $`. |
| `:::cashflow` | `opening: 2000`, `months: Jan, Feb, Mar`, then `Cash in:` and `Cash out:` headings with indented `Item: 1, 2, 3` lines. Opening and closing balances are computed (negatives in brackets). |
| `:::payback` | `investment: 50000`, optional `rate: 8` (discount rate %), then `Year 1: 15000` lines. The table adds cumulative cash, payback period, ARR and NPV. |

```
:::gantt
caption: Launch plan.
unit: week
---
section Planning
Research: 1-3
Design: after Research, 2
Launch: milestone 8
:::

:::breakeven
caption: Break-even chart.
currency: $
---
fixed costs: 20000
variable cost: 4
price: 10
output: 5000
:::

:::decisiontree
caption: Expand or not?
decision: Expand?
---
Build factory (cost 100000)
  Strong demand (0.6): 400000
  Weak demand (0.4): 50000
Do nothing: 0
:::
```

#### Economics

Curves are schematic (no numbers on the axes). Options are plain `name: value` lines.

| Block | Options |
|---|---|
| `:::supplydemand` | `demand: right` or `left`, `supply: right` or `left`, `tax: 12` (per unit; `subsidy: 12` for a subsidy), `ceiling: 35` or `yes`, `floor: 65` or `yes`, `surplus: yes` (shades consumer and producer surplus, tax revenue and the deadweight loss). Also `x-label`, `y-label`. |
| `:::adas` | `ad`, `sras`, `lras` each `right` or `left`; shows the inflationary or recessionary gap. `lras-line: no` hides LRAS. |
| `:::ppc` | Points as `A: 50, 80`; `x-max: 100`, `y-max: 100`, `x-label`, `y-label`, `shape: straight`, `growth: 20%` (or `growth-x`, `growth-y`). Points are marked on the curve, inefficient (inside) or unattainable (outside). |
| `:::externality` | `type: negative production` (also `positive consumption`, `negative consumption`, `positive production`, or just `negative` / `positive`), `gap: 20`. Shows MPB, MPC, MSC or MSB and the welfare loss. |
| `:::lorenz` | One to four lines `Country A: 5, 9, 14, 22, 50` (income share of each equal population group, poorest first). The Gini coefficient is computed. `areas: no`, `gini: no`. |

```
:::supplydemand
caption: Effect of an indirect tax.
tax: 12
surplus: yes
:::

:::lorenz
caption: Income inequality.
---
Country A: 5, 9, 14, 22, 50
Country B: 8, 13, 18, 24, 37
:::
```
