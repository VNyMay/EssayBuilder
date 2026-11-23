# Format reference

## File layout

```
settings (key: value lines)
---
body (headings, paragraphs, blocks)
```

The settings come first and end with a line containing only `---`.

```
title: How Quickly Do Period-Doubling Estimates Converge?
subject: Mathematics: Analysis and Approaches
question: To what extent does ... ?
font: Cambria
numbers: latex
---
# Introduction
...
```

### Settings

| Key | Meaning | Default |
|---|---|---|
| `title` | Document title: PDF name and metadata. Also the cover band if `question` is missing | none (warns) |
| `subject` | Line at the top of the cover | empty |
| `question` | Text in the ruled band in the middle of the cover (research question / title). May contain `$maths$` | `title` |
| `cover-line` | Extra line at the bottom of the cover (candidate number, session...). Repeat the key for several lines | none |
| `font` | Body font: any font installed on the computer, or any of the 2,000+ Google Fonts (downloaded automatically the first time it is used; see **Fonts**). Write the name as on fonts.google.com, e.g. `Lora`. Fallbacks after commas: `Lora, Georgia` | `Cambria` |
| `heading-font` | A different font for headings, the cover and captions' headings, e.g. `Montserrat` | same as `font` |
| `code-font` | Font for code and inline code, e.g. `Fira Code` | `JetBrains Mono` |
| `numbers` | `latex` renders every number in LaTeX (maths / science essays), `text` leaves them | `text` |
| `font-size` | Body size in pt: `10`, `11` or `12`. The whole design scales with it (headings, captions, tables, code, spacing), so `11` is a smaller, tighter version of `12` with the same proportions | `11` |
| `line-spacing` | Line height multiplier | `1.8` |
| `paper` | `A4`, `Letter`, `A5`, `Legal` | `A4` |
| `margins` | Page margin in mm | `25` |
| `heading-numbers` | `yes` numbers `1`, `1.1`; `no` turns numbering off | `yes` |
| `look` | A ready-made bundle of settings: `essay` (cover, contents, numbered ruled headings, justified, airy: long essays), `document` (no cover or contents, underlined headings, indented left-aligned paragraphs, tight spacing: TOK exhibition, short reports), `compact` (no cover or contents, numbered navy headings without rules, 11 pt text, left-aligned, sections flow, tight: the clean modern look for short essays and reports). Any setting you write yourself overrides the look | `essay` |
| `section-breaks` | `yes`: every `#` section starts a new page; `no`: sections flow on one after another. It depends on the document, so **ask the user, or copy their original** (a TOK exhibition with one object per page wants `yes`; a short essay with half-empty pages wants `no`). Text above the first heading (a title block) always shares its page with that heading | `yes` |
| `heading-style` | `rule` (bold with a line under it), `underline` (plain underlined headings), `plain`, `accent` (bold headings in the accent colour, no rules: clean and modern) | `rule` |
| `heading-size` | Size of level-1 headings in pt (level 2 is 85% of it) | `20`, or `15` in `accent` style |
| `paragraph-indent` | First-line indent of body paragraphs, e.g. `1.3em` or `8mm` | none |
| `paragraph-spacing` | Space between paragraphs in pt | `10` |
| `justify` | `no` = left-aligned paragraphs | `yes` |
| `cover` / `contents` | `no` removes the cover page / contents page | `yes` |
| `page-numbers` | `no` hides page numbers | `yes` |
| `page-numbering` | `body`: the first section is page 1, the cover and contents pages are not numbered. `continuous`: every page counts from the first one as it really sits in the PDF, so with a cover and a contents page the Introduction is page 3 (the cover counts as 1 but shows no number; the contents list uses the same numbers) | `body` |
| `:::numbering` (block) | put `:::numbering hide`, `skip`, `start`, `restart 5`, `roman`, `Roman`, `letters` or `numbers` (words can be combined) just before the first block of a page: `hide` = no number on that page, `skip` = that page is not counted, `start` = numbering begins here (earlier pages unnumbered), `restart N` = count from N here, a style word changes the style from that page on | |
| `word-count` | `auto` (counted), `off` (not shown on the cover), or a number to print | `auto` |
| `word-count-label` | Text before the count on the cover | `Word count` |
| `word-limit` | e.g. `4000`: the build warns when exceeded | none |
| `equation-numbers` | `labeled` (only equations with an id), `all`, `none` | `labeled` |
| `list-of-figures` / `list-of-tables` | `yes` adds the list, with page numbers, under the contents | `no` |
| `image-width` | Default width of figures and charts | `86%` |
| `caption-size`, `code-size`, `table-size` | Exact final sizes in pt. Leave out to let them scale with `font-size` | scaled |
| `caption-style` | `bold` (bold "Figure 1:" label) or `italic` (the whole caption in italics, like a Word document) | `bold` |
| `accent` | Colour of links, and of headings in the `accent` heading style | `#1f4e79` |
| `assets` | An extra folder where images / data / code are looked up | none |

Everything is optional except `title`.

### Covers

`cover: yes` (default) makes a cover page. Choose its design with `cover-style` and fill in only the details the student wants shown.

| Style | Look |
|---|---|
| `classic` (default) | Subject on top, the title between two rules, the word count at the bottom |
| `formal` | Centred: subject, a ruled title block, details below |
| `modern` | Left aligned, a coloured bar beside a large title |
| `minimal` | A light, large title with a thin rule and small details |
| `banner` | A full-width coloured band across the top with the title in white |
| `split` | A coloured panel down the left with the details; the title on the right |
| `image` | A full-page picture (`cover-image`) with the title over it in white |
| `free` | Your own layout: any number of positioned boxes (see below) |

Details (all optional, shown only when written): `title`, `subtitle`, `subject`, `author`, `candidate` (candidate number), `school`, `supervisor`, `session`, `course`, `date` (`date: today` writes today's date), `word-count` (`auto`, a number, or `off`), and any number of extra `cover-line: text` lines.

Looks: `cover-color` (the band, bar or panel colour; default is `accent`), `cover-text` (the text colour on coloured or picture covers), `cover-align` (`left`, `center`, `right`), `cover-logo: path` (a small logo beside the subject), and `cover-image: path` (the full page picture in `image`; a picture strip above the title in `classic`, `formal`, `modern` and `minimal`).

Free cover (`cover-style: free`): every `cover-box: kind | settings | content` line adds one box, drawn in order (later boxes on top). `cover-color` is the page colour. Kinds: `text`, `rect`, `ellipse`, `line`, `image` (content = picture path). Position and size are percentages of the page: `x`, `y`, `w`, `h`. Text settings: `size` (pt), `bold`, `italic`, `underline`, `upper`, `font`, `color`, `align` (left/center/right/justify), `valign` (top/middle/bottom), `spacing`, `line`. Shape settings: `bg` (fill), `border`, `bw` (border width pt), `radius`, `opacity` (0-1), `rot` (degrees). Text content may use `{question}`, `{title}`, `{subject}`, `{subtitle}`, `{author}`, `{candidate}`, `{school}`, `{supervisor}`, `{session}`, `{course}`, `{date}`, `{words}`, and `
` for a new line.

```
cover-style: free
cover-color: #fdf6e3
cover-box: rect | x=8 y=12 w=2 h=40 bg=#1f4e79 |
cover-box: text | x=14 y=30 w=72 size=30 bold align=left | {question}
cover-box: text | x=14 y=62 w=60 size=13 color=#555555 | {author}
{session}
```

```
cover-style: banner
subject: History
title: How did steam power change British cities?
subtitle: A study of Manchester, 1780-1850
author: The student's name
school: The student's school
session: May 2027
cover-color: #1f4e79
```

## Writing the body

### Comments, spacing, escapes

- A line starting with `%%` (or `// `) is a private comment and is not printed.
- A blank line separates paragraphs. Lines inside one paragraph are joined; end a line with `\\` to force a line break.
- A literal dollar sign: `\$5`. (A lone `$` before a number such as `$4.5m` is already safe.) Other escapes: `\*`, `\_`, `\#`, `\[`, `\@`, `\\`.
- `:::pagebreak` starts a new page. `:::spacer 10mm` adds vertical space.
- `:::design` makes a full page laid out freely, like the free cover: one `box: kind | settings | content` line per box (same kinds and settings as `cover-box`) and an optional `color: #hex` line for the page colour, closed with `:::`. Use it for section dividers, posters or appendix title pages.
- `:::overlay` (same `box:` lines, closed with `:::`) placed just before the first block of a page draws those boxes on top of that normal page, which still flows as usual: stickers, arrows, callouts, a coloured band.

### Headings

```
# Section            level 1: numbered 1, 2, 3 and starts a new page
## Subsection        level 2: numbered 1.1, 1.2
### Minor heading    level 3: not numbered, not in the contents
# Results {nonumber}      no number
# Methods {#methods}      your own id (for @sec:methods)
```

These level-1 headings are recognised and **never numbered**: `References`, `Bibliography`, `Works Cited`, `Sources`, `Appendix ...` (and `Abstract`, `Acknowledgements`, `Preface`, ...). The word count covers everything from the first numbered section up to the first `References` / `Appendix`. Do **not** write a `# Contents` heading: it is generated.

### Text

```
**bold**   *italic*   ***both***   `inline code`   $x^2 + 1$   [link text](https://example.com)
```

Bare `https://...` links are linked automatically. Lists:

```
- bullet            1. numbered
  - nested bullet   2. next
```

A quotation (long quotes only; short ones stay in the paragraph):

```
> The quoted text goes here,
> across as many lines as you like.
```

`:::text` changes the look of one passage (`size` in pt, `align` left/center/right/justify, `style` bold and/or italic, `indent` as a length, `font` any font name):

```
:::text
size: 10
align: center
style: italic
---
Small, centred, italic text.
:::
```

### Fonts

Every build checks each font the essay asks for (`font`, `heading-font`, `code-font` and the `font:` option of `:::text`):

1. installed on the computer: used as it is;
2. already downloaded: used;
3. in the Google Fonts library (2,000+ families: serif, sans-serif, monospace, handwriting, display, and many non-Latin scripts such as Arabic, Cyrillic, Greek): **downloaded automatically with npm** the first time (about 2 MB, a few seconds, needs internet once), then kept;
4. none of these: a warning with "did you mean ...?" suggestions, and the default font is used instead.

So the AI only has to write the font name in the settings: `font: Lora`. Names are not case sensitive but must be spelled as Google spells them (`EB Garamond`, `Source Serif 4`, `Playfair Display`). Regular, bold and italic are loaded. Office fonts that Google does not offer (Cambria, Calibri, Arial, Times New Roman, Georgia, Courier New) are used from the computer; where missing, their metric-compatible twins are downloaded instead. To browse: `python engineuild.py --fonts serif` or `--fonts garamond`. To pre-download: `python engineuild.py --install-font "Lora"`.

Use at most two fonts in a document (one for the text, optionally one for headings). Handwriting and display fonts are for a single title or block, never for body text.

### Appendices

A level-1 heading `# Appendix B: Data` restarts the numbering of figures, tables and listings with the appendix letter: the first table below it is **Table B1**, the next **Table B2**, a figure **Figure B1**. Appendices come after the references and are outside the word count.

### Highlighted boxes and theorems

```
:::box
The highlighted statement, e.g. the research question.
:::
```

Also `:::note`, and numbered mathematical blocks `:::definition`, `:::theorem`, `:::lemma`, `:::proposition`, `:::corollary`, `:::example`, `:::remark`, plus `:::proof` (unnumbered, ends with a square). Give a name and id on the first line; the body is normal text and may contain `$maths$`, lists and several paragraphs:

```
:::definition Period-doubling cascade {#cascade}
A sequence of parameter values at which the period doubles.
:::
```

Refer to it with `@def:cascade` -> "Definition 1" (kinds: `def`, `thm`, `lem`, `prop`, `cor`, `ex`, `rem`).

### Cross-references

`@fig:id`, `@tbl:id`, `@eq:id`, `@code:id`, `@sec:id`, `@def:id`, ... turn into "Figure 3", "Table 2", "Equation (4)", "Listing 1", "Section 2.1", "Definition 1", with the correct auto-numbering and a clickable link. Give the target an `id` first (`id: bif` in a figure, `{#logistic}` on an equation). A reference to an id that does not exist is an error.

Only replace the user's own "Figure 3" with `@fig:id` when the automatic number would be exactly that. Otherwise leave their text alone.

### Equations written as plain text (preferred for students)

Maths between `$ ... $` (inside a sentence) or `$$ ... $$` (on its own lines) can be typed the way it is said, with no LaTeX. An equation alone on its line is centred automatically.

| Type | Result |
|---|---|
| `x^2 + 3x - 5 = 0`, `a_1`, `x_(n+1)` | powers and subscripts |
| `1/2`, `(a+b)/(c+d)`, `d/dx` | fractions |
| `sqrt(x)`, `root(3)(x)`, `abs(x)`, `\|x\|` | roots and absolute value |
| `sum_(i=1)^n i`, `int_0^1 x^2 dx`, `lim_(x->0) sin(x)/x` | sums, integrals, limits |
| `<=`, `>=`, `!=`, `+-`, `xx`, `-:`, `oo`, `->`, `=>`, `~~` | ≤ ≥ ≠ ± × ÷ ∞ → ⇒ ≈ |
| `alpha`, `beta`, `theta`, `pi`, `Delta`, `Sigma` | Greek letters |
| `in`, `subset`, `cup`, `cap`, `RR`, `NN`, `ZZ` | set symbols |
| `vec(v)`, `hat(x)`, `bar(x)`, `30^@` | vector, hat, bar, degrees |
| `[[1,2],[3,4]]` | a matrix |

Typed symbols such as `x²`, `√2`, `≥`, `π` and `×` also work. Several lines inside `$$ ... $$` are aligned at the first `=`. If an equation contains a backslash command or `^{...}` it is read as LaTeX, so existing LaTeX keeps working. The setting `math-input: auto` (default), `plain` or `latex` forces one reading.

### Equations (LaTeX)

Inline: `$\delta \approx 4.6692$`. Displayed equations stand in their own paragraph between `$$` markers:

```
$$ x_{n+1} = r x_n (1 - x_n) $$ {#logistic}
```

- `{#id}` numbers the equation `(1)`, `(2)` ... on the right and lets you cite it with `@eq:id`. No `{#id}` means no number (set `equation-numbers: all` to number everything; `{nonumber}` excludes one).
- `{tag="(May, 1976)"}` puts your own text where the number would be.
- Several lines are aligned automatically on the first `=` (or `\approx`, `<`, ...). No `&` or `\\` needed:

```
$$
r x (1 - x) = x
x [ r (1 - x) - 1 ] = 0
x = 0 \quad \text{or} \quad x = 1 - \frac{1}{r}
$$ {#fixed}
```

- Write `<`, `>`, `<=`, `>=`, `!=`, `->` freely inside maths; they become the right symbols. Use `\%` for a percent sign. Everything else is normal LaTeX (KaTeX supports `\frac`, `\sum`, `\int`, `\begin{cases}`, `\begin{pmatrix}`, `\mathbb`, `\text{}`, ...).
- Two or three short equations side by side:

```
:::eq-pair
f(x) = r x (1 - x)
g(x) = f(f(x))
:::
```

### Figures (images)

```
:::figure
src: images/bifurcation.png
caption: Bifurcation diagram of the logistic map.
id: bif
width: 70%
source: Own work
:::
```

| Option | Meaning |
|---|---|
| `src` | **Required.** Path to the image: relative to the essay file, or absolute (`C:\Users\...\pic.png`). PNG, JPG, GIF, WEBP, SVG |
| `caption` | Text after "Figure N:". May contain `$maths$`, `**bold**` |
| `id` | Name for `@fig:id` |
| `width` | `70%` (of the text width), `8cm`, `60mm`, `3in`, or `small` (45%) / `medium` (65%) / `large` (86%) / `full` (100%). Default `image-width` |
| `height` | Maximum height, same units |
| `align` | `center` (default), `left`, `right` |
| `source` | Credit line under the caption ("Source: " is added unless you write it) |
| `alt` | Alternative text (default: the caption) |
| `border` | `yes` draws a thin frame |
| `wrap` | `right` or `left`: the image floats to that side and the text flows around it, like a magazine layout (default `width` becomes 36%). Put the figure **before the paragraph it should sit beside**. Without `wrap` the image sits between paragraphs |

An image with **no `caption`** is just a picture: it gets no "Figure N" label, no number and is not listed. Give it a `caption` if it should be numbered or referred to with `@fig:`.

Figures are numbered automatically and always keep image and caption together on one page. Short form: `![Caption text](images/pic.png){#id width=60%}`.

Several images in one figure, labelled (a), (b), ...:

```
:::figures
cols: 2
caption: Two views of the data.
id: pair
---
images/a.png | Sub-caption of the first
images/b.png | Sub-caption of the second
:::
```

The build warns when an image would print blurry (< 110 dpi at the chosen size).

### Tables

From a CSV (or `.tsv`, `.json` (a list of records), or `.xlsx` with `sheet:`) file:

```
:::table
src: data/estimates.csv
caption: Period-doubling estimates.
id: est
cols: n, r_n = Bifurcation value, delta_n
rows: 1-10
decimals: r_n=6, delta_n=4
align: c r r
:::
```

Typed by hand (Markdown pipe table; `:--` left, `:-:` centre, `--:` right):

```
Table: Caption of the table. {#methods}

| Method | Error |
|:-------|------:|
| Direct | 0.0123 |
```

or with options, after a line containing only `---`, as a pipe table or as CSV lines.

| Option | Meaning |
|---|---|
| `src` / `sheet` | File and (for Excel) sheet name |
| `caption`, `id` | As for figures. Table captions go **above** the table |
| `cols` | Choose and reorder columns by header name or number; rename with `name = New label` |
| `rows` | Which data rows: `1-10`, `1-5, 8`, `12-` |
| `sort` | `column` or `column desc` |
| `decimals` | `3` for all numbers, or `col=4, other=2` (rounds half up) |
| `thousands` | `yes` -> 12,345 |
| `sci` | Show columns in scientific notation: `sci: residual=3` prints 3.3811209e-65 as 3.38 x 10^-65 (the number is the significant digits to keep; `0` keeps all the given digits). Columns are named as in the header (after any `cols` renaming) |
| `group-digits` | `5` prints long decimals in groups of five digits (3.44948 97427 83178 ...), easier to read in full-precision tables; a trailing `.0` is dropped |
| `align` | `l`/`c`/`r` for each column (`c r r`) or one letter for all. Default: numbers right, text left |
| `group` | Column whose value is printed once per group as one merged, vertically centred cell, with a rule between groups |
| `total` | `yes` makes the last row bold with a rule above (totals row) |
| `size` | `small` or `tiny` for wide tables |
| `width` | `82%`, `100%`, `12cm`, or `auto`. Default: narrow tables 82%, wide ones full width |
| `header` | `no` if the first row is data |
| `source` / `note` | Line under the table |
| `split` | `yes` lets a long table break across pages (header repeats; automatic above 24 rows) |
| `style` | `classic` (default), `grid` (all lines), `striped` (alternate rows shaded), `minimal` (no top and bottom rules) |
| `transpose` | `yes` swaps rows and columns |

Cells accept `$maths$`, `**bold**` and `*italic*`.

### Code

From a file (the file's own text is never retyped, so it cannot be mistyped):

```
:::code
src: code/feigenbaum.py
lines: 10-48
highlight: 12, 20-22
caption: The estimation function.
id: estimate
:::
```

| Option | Meaning |
|---|---|
| `src` | Path to the source file. The language is guessed from the extension |
| `lines` | Show only these lines, keeping the file's own line numbers |
| `highlight` | Lines to shade (file line numbers) |
| `lang` | Language name for inline code or to override the guess |
| `name` | Title on the card (default: the file name) |
| `numbers` | `no` hides line numbers |
| `caption`, `id` | Optional. A caption makes it "Listing N", citeable with `@code:id` |
| `start` | First line number for inline code |

Code typed in the essay (first line after the opening is the language):

````
:::code python
print("hello")
:::
````

or a fenced block, with optional `{name=demo.py caption="..." id=demo highlight=2}`:

````
```python {name=demo.py}
print("hello")
```
````

A terminal window. Lines starting with `$ ` are commands; other lines are output (if no line starts with `$ `, every line is a command):

```
:::run Running the script
$ python code/feigenbaum.py
[4.2, 4.6, 4.66]
:::
```

`src: results/log.txt` shows a text file as terminal output.

### Charts (drawn for you)

Plot data from a CSV (or an inline table after `---`):

```
:::chart
type: line
src: data/estimates.csv
x: n
y: delta_n = Estimate of delta
xlabel: Iteration n
ylabel: Estimate
hline: 4.6692 | limit
caption: Convergence of the estimates.
id: converge
:::
```

`type`: `line`, `scatter`, `bar`, `hbar`, `hist`, `pie`, `donut`, `function`.

| Option | Meaning |
|---|---|
| `src` / `sheet` | Data file (first row = headers) |
| `x` | Column for the x axis or the categories (default: first column) |
| `y` | Column(s) to plot, comma-separated; rename with `col = Label` (default: every numeric column) |
| `xlabel`, `ylabel` | Axis labels (plain text; Unicode such as δ, π is fine) |
| `xlog`, `ylog` | `yes` for a logarithmic axis |
| `xmin`, `xmax`, `ymin`, `ymax` | Fix the axis range |
| `hline`, `vline` | Reference line: `value | label`. May be repeated |
| `legend` | `none` hides it; `show` forces it for one series |
| `lines`, `markers` | `yes`/`no` to connect points / show markers |
| `labels` | `yes` prints values on bars; for `pie`: `value` instead of percent |
| `bins` | Number of bars for `hist` |
| `width`, `ratio` | Width as for figures; `ratio: 16:9` or `1.6` (width / height) |
| `grid` | `no` removes grid lines |
| `caption`, `id`, `source` | As for figures: a chart is a numbered figure |

Plot formulas without any data (`type: function`). Separate several with `;`, name with `| label`; `domain` accepts `pi`:

```
:::chart
type: function
f: sin(x) | sine ; cos(x) | cosine
domain: -2pi..2pi
caption: Two trigonometric functions.
id: trig
:::
```

Formula syntax: `x`, numbers, `+ - * / ^`, brackets, implicit products (`2x`, `3(x+1)`), constants `pi`, `e`, and `sin cos tan asin acos atan sinh cosh tanh exp ln log log2 sqrt abs floor ceil round sign`.

Charts are coloured for screen and still readable in black and white (different markers and dashes).

### Size, position and text wrapping (every picture, map, chart, diagram, table, molecule and score)

Any figure-like block takes the same three options:

| Option | Values |
|---|---|
| `width` | `25%`, `50%`, `75%`, `100%` of the text width (or `8cm`, `60mm`) |
| `align` | `left`, `center` (default) or `right`; for a table write `place:` instead, because a table's `align:` is for its columns |
| `wrap` | `left` puts the block on the left with the text flowing on its right; `right` puts it on the right with the text on its left; `no` (default) keeps it on its own lines. A wrapped block is 40% wide unless `width` says otherwise |

Put a wrapped block just before the paragraph it should sit beside:

```
:::map
focus: Egypt
wrap: right
width: 45%
caption: The student's own caption.
:::
```

### Maps (geography, ESS, history, digital society, economics)

`:::map` draws a real, print-quality map from built-in data: country borders for the whole world, 12,000+ cities, a proper projection, a scale bar, a north arrow and a legend. It is a numbered figure (`caption`, `id`, `source`, `width`, `ratio`). Options first, then layers, one per line, in any order. No `---` is needed unless a layer uses `here`.

```
:::map
focus: Egypt
level: 1
names: none
caption: Governorates of Egypt.
id: egypt
:::
```

**Where the map looks**

| Option | Meaning |
|---|---|
| `focus` | A country, several countries (`Egypt, Sudan`) or a region: `africa`, `europe`, `asia`, `middle east`, `north america`, `south america`, `oceania`, `north africa`, `east africa`, `west africa`, `southeast asia`, `south asia`, `scandinavia`. Leave out for the whole world |
| `bbox` | `west, south, east, north` in degrees |
| `center` + `span` | `center: Cairo` (a place or `30.04, 31.23`) and `span: 3 km` (width of the map): for local fieldwork |
| `basemap` | `world` (default: country borders), `none` (blank, for your own shapes), `osm` (street map), `topo` (contours and relief), `light` (quiet grey street map). The last three download map tiles once (internet needed), are cached, and print their credit on the map |
| `zoom` | Tile zoom level (usually chosen automatically) |
| `projection` | `auto` (default), `mercator`, `natural-earth`, `equal-earth`, `robinson`, `winkel-tripel`, `mollweide`, `orthographic` (a globe; add `rotate: lon, lat` to turn it), `albers`, `albers-usa`, `conic`, `conic-conformal`, `azimuthal`, `stereographic`, `equirectangular`, `transverse-mercator`. Auto picks an equal-area projection for data maps |
| `level` | `1` or `2`: draw the administrative areas of the focus country (governorates, states, provinces, districts). Downloaded once from geoBoundaries and cached. For the USA, `states` or `counties` work offline |
| `ratio` | Shape of the frame, e.g. `4:3` (default: fits the area) |

**Furniture and extras**: `names: auto/none/countries`, `cities: 8` (the 8 largest cities of the focus countries), `capitals: yes`, `graticule: yes` (or `10` for lines every 10 degrees), `scale: no`, `north: no`, `inset: yes` (a small world locator), `units: mi`, `ocean: #dbe9f4`, `land: #f0eee6`, `borders: no`, `mainland: no` (keep far-away territories when fitting a country), `numbered: yes` (numbers the `point:` markers and adds a key), `legend: none`, `detail: high` (sharper tiles), `online: no` (never look up place names online).

**Layers**: each is one line, `kind: target | text | option=value option=value`. The parts after the first `|` are optional; put values that contain spaces in quotes.

```
shade: data/gdp.csv | value="GDP per capita" classes=5 palette=blues legend="US$"
highlight: Egypt, Sudan | color=#c0392b legend=Study countries
point: Cairo | Capital | shape=star color=#c0392b size=7
points: data/sites.csv | size=Population color=Type label=Name legend="Population"
route: Cairo -> Luxor -> Aswan | Nile cruise | color=#1f4e79 width=2
line: 30.1, 31.2; 30.3, 31.5 | Transect A | dash="6 3"
area: 30.0, 31.2; 30.0, 31.3; 30.1, 31.3 | Study site | color=#d98200
circle: Cairo | 50 km | Commuter zone
flows: data/trade.csv | from=Origin to=Destination value=Tonnes legend=Tonnes
geojson: data/zones.geojson | label=Zone value=Cover palette=greens
label: 33.5, 28 | Mediterranean Sea | italic=yes angle=-8
```

- `shade` colours areas by a number (a choropleth). `value` is the number column, `join` the column of country or area names (both found automatically if left out), `classes` 2-9, `method` is `quantile` (default), `equal`, `jenks` or `log`, or give your own `breaks="10 25 50"`. `palette` is `accent` (default, follows the document accent), `blues`, `greens`, `oranges`, `reds`, `purples`, `greys`, `blue-green`, `heat`, or for data above and below a midpoint `red-blue`, `red-green`, `brown-teal`, `orange-purple`; `reverse=yes` flips it; `legend` titles the key.
- `highlight` fills whole countries or regions with a colour.
- `point` is one marker. `shape` is `circle`, `square`, `triangle`, `diamond`, `star` or `cross`; `label` is `left`, `right`, `top`, `bottom` or `none`.
- `points` plots a table. The `lat` and `lon` columns (or one `place` column) are found automatically. `size=Column` makes proportional circles with a size key (`min-size`, `max-size`); `size=6` is a fixed size. `color=Column` colours by category or by number with a key; `color=#c0392b` is a fixed colour. `label=Column` writes names.
- `route` joins places in order with an arrow (`arrow=no`, `stops=yes` marks every stop, `curve=straight`). `line` and `area` take coordinates (or place names) separated by `;`. `circle` draws a radius in `km` or `mi`.
- `flows` draws curved arrows between places from `from`, `to` and `value` columns, thicker for bigger values.
- `geojson` draws the shapes of a `.geojson` file. `label=Property` writes names, `value=Property` shades polygons by a number.
- `label` writes free text at a place: seas, rivers, regions.

A data layer can read the table typed into the block: write `shade: here`, then a line `---`, then a pipe table. Only one layer can use `here`.

**Places** are written as a name (`Cairo`, `Cairo, Egypt`, `Alexandria`, `Egypt`) or as coordinates: `30.04, 31.23` (latitude first, negative south and west) or `30°02′N 31°14′E`. A small place that is not in the built-in list is looked up once on OpenStreetMap; the warning prints its coordinates: paste them into the essay to keep the map identical offline.

**Data tables** need no special form: country names in a CSV are matched flexibly (`Egypt`, `Egypt, Arab Rep.`, `EGY`, `EG` are all Egypt), and rows that cannot be matched are reported by name.

Examples that work as they are: a quiet national map with cities `focus: Egypt` + `cities: 6`; a fieldwork map `basemap: osm` + `center: 30.0444, 31.2357` + `span: 2 km` + `numbered: yes` + several `point:` lines; a world data map `shade: gdp.csv | value=GDP palette=greens`; a flow map with `flows:`; a globe `focus: Brazil` + `projection: orthographic`.

### Chemistry, molecules and sheet music

- **Chemical equations** inside any text or `$$` block: `$\ce{2H2 + O2 -> 2H2O}$`, `$\ce{SO4^2-}$`, `$$ \ce{NH4+ <=> NH3 + H+} $$`.
- **Molecule structures** (2D, from a SMILES string; drawn with RDKit, so large molecules, rings, stereo bonds and sugars work. Options: `color: no` for black and white, `stereo: yes` to print R/S labels):

```
:::molecule
smiles: CC(=O)Oc1ccccc1C(=O)O
caption: Aspirin.
width: 45%
:::
```

- **Sheet music** (ABC notation, inline or from a `.abc` file with `src:`):

```
:::music
caption: A C major scale.
---
X:1
M:4/4
L:1/4
K:C
CDEF|GABc|
:::
```

### Diagrams

Besides `flow`, `tree`, `mindmap`, `timeline`, `swot` and `diagram`, these blocks take Mermaid notation after `---` (the first line naming the type is added for you): `sequence`, `er`, `class`, `state`, `gantt`, `journey`, `quadrant`, `sankey`, `radar`, `requirement`, `packet`, `gitgraph`.

Every diagram is a numbered figure: give it `caption:` and `id:`, and optionally `width:` / `source:`. Put the options first, then (optionally) a line `---`, then the content.

**Flowchart**: one chain per line, `->` between steps; `-label->` puts text on the arrow; a step ending in `?` is a decision; `(Text)` is a rounded terminal; `[(Text)]` a database; `/Text/` input/output; `Start`/`End` are terminals automatically. The same text always means the same box.

```
:::flow
direction: LR
caption: Algorithm overview.
id: algo
---
Start -> Pick r -> Iterate map -> Converged?
Converged? -yes-> Record value -> End
Converged? -no-> Iterate map
:::
```

`direction`: `TD` (top-down, default), `LR`, `RL`, `BT`.

**Keep diagrams readable.** A page is only about 16 cm wide, so a left-to-right (`LR`) flow of more than about 4 boxes, or long labels, gets shrunk and the text prints small. The build then prints a warning ("its text prints at only about 7 pt"). When you see it, use `TD`, shorten the labels, or split the flow into two diagrams. Never ignore that warning.

**Mind map**: an indented outline; the first line is the centre.

```
:::mindmap
caption: Ideas in this essay.
id: mind
---
Chaos
  Logistic map
    Fixed points
  Universality
:::
```

**Tree / hierarchy** (organisation chart, taxonomy): same outline, drawn top-down.

```
:::tree
caption: Organisation chart.
id: org
---
CEO
  Finance
    Accounts
  Operations
:::
```

**Timeline**: `when: what` per line (`|` separates several events in one period; a line `# Name` starts a section). Drawn as a clean vertical list of dates, so any number of events stays readable.

```
:::timeline
title: History
caption: Key dates.
id: time
---
1976: May publishes his survey
1978: Feigenbaum finds the constant | Universality noticed
:::
```

**Grid / SWOT / matrix** (2x2 or more boxes; titles end with a colon, content as bullets or plain lines; `cols` sets the number of columns, default 2):

```
:::swot
caption: SWOT analysis of the firm.
id: swot
---
Strengths:
- Strong brand
Weaknesses:
- High costs
Opportunities:
- New markets
Threats:
- Competitors
:::
```

**Anything else**: `:::diagram` takes raw [Mermaid](https://mermaid.js.org/intro/) code (sequence, class, state, ER, Gantt, journey, pie, quadrant, sankey, ...). Use it only for diagram types above that do not cover the need.

```
:::diagram
caption: Message flow.
id: seq
---
sequenceDiagram
  Student->>AI: Essay text
  AI-->>Student: PDF
:::
```

If a diagram fails, the error shows Mermaid's message; line numbers there count from the first diagram line.

### References

Write `# References` and then **one paragraph per source, in the order the user gave** (blank line between entries, or one per line). They are formatted with a hanging indent; `*italic*` for titles; URLs become links. Do not reformat or reorder the entries. Optional: `:::references` with `sort: yes` sorts alphabetically, only if the user asks.

```
# References

Feigenbaum, M. (1978). Quantitative universality. *Journal of Statistical Physics*, 19(1), 25-52.

May, R. (1976). Simple mathematical models. *Nature*, 261, 459-467. https://doi.org/10.1038/261459a0
```

An `# Appendix A: Title` section after the references is allowed and is outside the word count.

### Splitting a long essay

`:::include chapters/results.txt` pastes another file in at that place (path relative to the including file). Use it only if the user keeps the essay in several files.

### Word-count markers (rarely needed)

The count is automatic. To override, put `:::wc-start` before the first counted line and `:::wc-end` after the last.

## Mapping what the user gives you

| The user has | You write |
|---|---|
| "Figure 2: caption" and an image path | a `:::figure` with `src` and `caption` (without the words "Figure 2:") |
| A table in Word / pasted text | a pipe table (copy cells exactly), or `src` if they give a CSV |
| A table as a `.csv` / `.xlsx` | `:::table` with `src` |
| Python / other code | `:::code` with `src` to the file (never retype long code) |
| Console output | `:::run` |
| Results over time or categories as numbers | `:::chart` from their CSV |
| A flow, hierarchy, timeline, SWOT, mind map described in words | `:::flow`, `:::tree`, `:::timeline`, `:::swot`, `:::mindmap`, using only the items they listed |
| Equations in Word / LaTeX / plain text | `$$ ... $$`, translated faithfully; numbered `(n)` in the source -> give them `{#id}` |
| "Table 3 shows..." in the text | keep the words; link with `@tbl:id` only if the number is identical |
| Footnotes | not supported: ask the user to use in-text citations |
| A place, route, study area or data by country or region | `:::map` (see Maps): `focus`, then `shade`, `point`, `route`, `points` ... lines |
| A chemical equation or a molecule | `$\ce{...}$` in the text, or `:::molecule` with `smiles:` |
| A tune or a rhythm | `:::music` with ABC notation |

### Things the builder cannot do

Footnotes and endnotes, merged table cells, landscape pages, text in colours, two-column layout, maps of areas smaller than a town without internet access (the street, topographic and light base maps are downloaded once), whole right-to-left pages (Arabic or Hebrew words inside a left-to-right document are fine with a font that has them, e.g. `Amiri`), automatic citation formatting (type citations and references exactly as the user supplied them), tracked changes. If the essay needs one of these, say so.

### Formatting words, sentences and paragraphs

Put `[text]{options}` around any words. Options: `size=18` (points; also `large`, `xl`, `small`, `120%`), `font=Lora`, `color=#c0392b` or `color=red` (`color=accent` uses the accent colour), `bg=#fff3a3` or the flag `highlight`, `spacing=2pt`, `weight=300`, and the flags `bold`, `italic`, `underline`, `strike`, `smallcaps`, `caps`, `sup`, `sub`.

```
This word is [big]{size=24}, this one is [red and bold]{color=red bold}, this is [Lora italic]{font=Lora italic}, and H[2]{sub}O.
```

A whole paragraph or group of paragraphs: `:::text` with `size`, `font`, `color`, `bg`, `align`, `style` (`bold italic`), `indent`, `spacing`, `line` (line height). Headings take the same style words: `# Title {size=28 color=#c0392b align=center font="Playfair Display"}`.
