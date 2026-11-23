### Maths diagrams (sets, probability, statistics, geometry, graphs, vectors)

Write the data or the statement in plain words; the builder draws the diagram. Every block is a numbered figure that takes `caption`, `id`, `source`, `width`, `align` and `wrap`. Options go on the first lines, then (optionally after a line of `---`) the content lines.

**Venn diagram** `:::venn`: two or three sets. `sets:` names them (otherwise the names are read from the region lines, and `A`, `B`, `C` always mean the first, second and third set). Region lines are `A only: 5`, `A and B: 3`, `A and B and C: 1`, `neither: 2`; the value can be a number or a list of elements (`Cats only: Tom, Kit`). With three sets, `A and B` means in A and B but not C. `shade:` colours a region using set logic: `A and B`, `A or B`, `A only`, `not A`, `A minus B`, `neither` (use several `shade:` lines for several areas). `universe:` renames the box (default `U`; `universe: no` removes it).

```
:::venn
caption: Pupils who study Art and Music.
sets: Art, Music
shade: Art and Music
Art only: 12
Art and Music: 5
Music only: 9
neither: 4
:::
```

**Probability tree** `:::probtree`: a nested list, one line per branch as `Event: probability`, each level indented by two spaces. Probabilities can be decimals, fractions or percentages, and the end-of-branch products are worked out. Options: `format` (`decimal`, `fraction`, `percent`; default follows what you typed), `working: yes` (show `0.3 × 0.6 = 0.18`), `products: no`, `check: no` (switch off the warning when branches do not add to 1).

```
:::probtree
caption: Rain and lateness.
---
Rain: 0.3
  Late: 0.6
  On time: 0.4
No rain: 0.7
  Late: 0.2
  On time: 0.8
:::
```

**Normal curve** `:::normal`: `mean:` (or `mu`), `sd:` (or `sigma`), and one or more `shade:` lines: `85 to 115`, `between 85 and 115`, `below 85`, `above 130`, `outside 70 and 130`. The area is worked out and printed on the shaded part. Options: `unit` (label under the axis), `variable` (default `X`), `places` (default 3), `label` (`area`, `full` to print `P(X > 130) = 0.023`, or `no`), `z: yes` (adds a row of z-values).

```
:::normal
caption: Scores between 85 and 115.
mean: 100
sd: 15
shade: 85 to 115
unit: IQ score
:::
```

**Box plot** `:::boxplot`: one line per group as `Name: values` (raw data) or `Name: min 140, q1 150, median 160, q3 168, max 180` (summary; add `outliers 190, 200` if needed). Quartiles are medians of the halves; outliers are beyond 1.5 × IQR and drawn as circles. Options: `axis` (axis title with units), `orientation: vertical`, `values: yes` (print the five numbers), `outliers: no`, `axis-min`, `axis-max`.

```
:::boxplot
caption: Two classes compared.
axis: Height (cm)
---
Class A: 150, 155, 158, 160, 162, 165, 170, 171, 173, 200
Class B: min 140, q1 150, median 160, q3 168, max 180
:::
```

**Stem and leaf** `:::stemleaf`: a list of numbers (commas or spaces, over several lines). Two named lists (`Boys: ...` and `Girls: ...`) make a back-to-back diagram. The key is written for you. Options: `unit` (added to the key, such as `s`), `split: yes` (two rows per stem), `leaf` (leaf unit, found automatically), `key` (own key text or `no`). Values must be zero or more.

```
:::stemleaf
caption: Sprint times.
unit: s
---
23, 25, 31, 34, 34, 38, 41, 45, 52, 57, 57, 63
:::
```

**Triangle** `:::triangle`: `vertices:` (default `A, B, C`), then sides and angles, one per line: `AB = 5 cm` (or `a = 5`, lowercase is the side opposite that vertex), `A = 40°`, `AC = x` (unknown, shown as typed), and `right: B` for a right-angle mark. The triangle is drawn to scale whenever the values fix its shape (SSS, SAS, ASA, AAS, right angle with two sides); `scale: no` draws a neat generic triangle instead; `labels: no` hides side and angle labels. Impossible triangles are reported.

```
:::triangle
caption: A right-angled triangle.
right: B
AB = 3 cm
BC = 4 cm
AC = x
A = 53°
:::
```

**Number line** `:::numberline`: one line per row: `x > 2`, `-3 <= x < 4`, `x <= -1 or x > 3`, `x > 1 and x < 5`, interval notation `[1, 4)`, `x = 3`, or a list of points `1, 3, 5`. Open circles mean not included, filled circles included, arrows mean it goes on. Options: `range: -5 to 10`, `step`, `labels` (print each line beside its row; on by default when there is more than one row).

```
:::numberline
caption: Solving inequalities.
---
x > 2
-3 <= x < 4
x <= -1 or x > 3
:::
```

**Coordinate plane** `:::coordplane`: lines such as `A (2, 3)` (a labelled point), `A to B` (segment), `polygon A, B, C`, `circle (0, 0) radius 2`, `y = 2x + 1`, `y = x^2 - 3`, `y = sin(x)`, `x = 3`. Formulas understand `^`, implicit multiplication (`2x`), `sqrt`, `abs`, `sin`, `cos`, `tan`, `ln`, `log`, `exp`, `pi` and `e` (angles in radians). Add `: text` to give a curve or point its own label. Options: `x: -4 to 6`, `y: -3 to 8`, `range` (both), `step`, `grid: no`, `equal: no` (stretch to fill instead of equal scales), `coords: yes` (print coordinates by points), `labels: no`, `xlabel`, `ylabel`.

```
:::coordplane
caption: A line and a parabola.
x: -4 to 6
y: -3 to 8
---
A (1, 2)
B (4, 7)
A to B
y = 0.5x + 3
y = x^2 - 3
:::
```

**Vectors** `:::vectors`: define each vector as `a = (3, 2)` (or `a = 3i + 2j`; add `from (1, 1)` to start elsewhere), then write sums and differences on their own lines: `a + b`, `a - b`, `2a - b`, or name the result with `r = a + b`. Sums are drawn tip to tail with a dashed copy and the result in colour. Options: `components: yes` (print the coordinates), plus the axis options of `coordplane`.

```
:::vectors
caption: Adding vectors tip to tail.
components: yes
---
a = (3, 2)
b = (1, 4)
a + b
:::
```
