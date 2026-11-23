### Layout (notes, headers, columns, landscape, merged cells, small blocks)

**Footnotes.** Put `[^1]` where the mark goes and `[^1]: text.` on its own line anywhere after (a new line indented under it continues it), or write the note in place with `^[text]`. Notes are numbered in the order they appear. Setting `notes: footnotes` (default) puts each note at the bottom of the page that holds its mark; `notes: endnotes` collects them in a "Notes" section before the references; `notes: chapter` lists them at the end of each chapter and restarts the numbering. Notes can hold bold, italics, maths and citations but not another note.

**Running headers and footers** (settings at the top). `header: {title} | | {section}` and `footer: {author} | | Page {page} of {pages}` take `left | centre | right` parts (one part with no `|` is centred). Tokens: `{title}` `{author}` `{page}` `{pages}` `{section}` (the current level-1 heading) `{date}`. `header-on-first: no` hides the header on the first numbered page. A `footer` replaces the centred page number. `page-number-format:` is `arabic`, `roman`, `Roman`, `letter`, or a pattern such as `Page {n} of {pages}`. `watermark: DRAFT` prints a grey diagonal word on every page.

**Columns** `:::columns 2` (2 to 4) flows text into columns. Options: `gap: 8mm`, `rule: yes` (a line between; or a colour).

```
:::columns 2
gap: 8mm
rule: yes
---
Long text...
:::
```

**Landscape** `:::landscape` puts its content on landscape pages (a wide table or figure); the text before and after stays portrait.

**Merged table cells** in pipe tables: an arrow marker points at the cell that holds the text. `>>` merges the cell with the cell on its right, `<<` with the cell on its left, `^^` with the cell above. Merged cells must form a rectangle. `header-rows: 2` makes the first two rows header rows. Not with `transpose`, `cols`, `sort`, `rows` or `group`.

```
:::table
caption: Results.
header-rows: 2
---
| Group | Test | Score | << |
| ^^ | ^^ | Mean | SD |
| Control | A | 4.2 | 0.8 |
| ^^ | B | 4.6 | 0.7 |
:::
```

**Small blocks.** `:::tip`, `:::warning`, `:::info`, `:::important` are coloured callouts (a title after the name replaces the label: `:::tip Remember`). `:::abstract` is a box with a `keywords: a, b, c` option line, then `---`, then the text. `:::glossary` takes `term: definition` lines and sorts them (`sort: no` keeps the order). `:::checklist` takes `- [x] done` and `- [ ] to do` lines. `:::steps Title` takes one step per line (numbers are added).
