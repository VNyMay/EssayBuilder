## Cheat sheet: the whole syntax on one page

This is every building block in its smallest working form. **Copy a block from here, then change only the values.** The full rules, options and details are in the reference after this section.

```
%% ---------- SETTINGS: first lines of the file, then a line with only --- ----------
title: The document title
look: document
font: Lora
page-numbers: yes
%% page-numbering: continuous   <- the cover and contents count (the Introduction is page 3); leave out to start at 1 on the first section
---

%% ---------- HEADINGS ----------
# Main part
## Sub part
### Minor heading
# References

%% ---------- TEXT ----------
A paragraph. Blank line = new paragraph. **bold** *italic* `code` $x^2$ [link](https://example.com)\\
A line ending with two backslashes starts a new line inside the paragraph.

- a bullet
- another bullet
1. a numbered item

> A long quotation.

:::text
align: center
style: italic
---
A centred italic block.
:::

:::box
A highlighted key sentence.
:::

%% ---------- EQUATIONS ----------
$$ E = mc^2 $$ {#einstein}
Refer to it in the text with @eq:einstein

%% ---------- IMAGES (caption and id are optional) ----------
:::figure
src: C:\full\path\to\picture.png
caption: The student's own caption.
id: image_1
width: 80%
:::

%% a small image beside the text: put it BEFORE the paragraph
:::figure
src: C:\full\path\to\small.png
wrap: right
width: 36%
:::

%% ---------- TABLE FROM A FILE ----------
:::table
src: C:\full\path\to\data.csv
caption: The student's own caption.
id: table_1
decimals: 2
:::

%% ---------- TABLE TYPED IN THE TEXT ----------
Table: The student's own caption. {#table_2}

| Name | Score |
|:-----|------:|
| Ann  | 12.5  |

%% ---------- CODE FROM A FILE ----------
:::code
src: C:\full\path\to\program.py
caption: The student's own caption.
:::

%% ---------- CHART FROM A DATA FILE ----------
:::chart
type: line
src: C:\full\path\to\data.csv
x: Year
y: Population
xlabel: Year
ylabel: People
caption: The student's own caption.
id: chart_1
:::

%% ---------- DIAGRAMS: options, then ---, then the content ----------
:::flow
direction: TD
caption: The student's own caption.
---
First step -> Second step -> Third step
:::

:::timeline
caption: The student's own caption.
---
1769: Watt patents the condenser
1830: First passenger railway
:::

%% ---------- MAPS: focus, then layers (one per line) ----------
:::map
focus: Egypt
cities: 5
point: Cairo | Capital | shape=star color=#c0392b
route: Cairo -> Luxor | Nile route
caption: The student's own caption.
id: map_1
:::

%% a data map: shade countries from a CSV; a street map for fieldwork
:::map
shade: C:ull\path	o\countries.csv | value=Population palette=blues legend=People
caption: The student's own caption.
:::

:::map
basemap: osm
center: 30.0444, 31.2357
span: 2 km
numbered: yes
point: 30.0444, 31.2357 | Site one
point: 30.0478, 31.2336 | Site two
caption: The student's own caption.
:::

%% ---------- CHEMISTRY AND MUSIC ----------
Water forms as $\ce{2H2 + O2 -> 2H2O}$.

:::molecule
smiles: CC(=O)Oc1ccccc1C(=O)O
caption: The student's own caption.
:::

%% ---------- REFERENCES: one paragraph per source ----------
# References

Author, A. (2020). *Title of the book*. Publisher.

Author, B. (2021). Article title. *Journal*, 5(2), 10-20.
```

**Rules of the syntax in one breath:** a block starts with `:::name` and ends with a line holding only `:::`; `key: value` lines come first; a line holding only `---` separates the options from the content of `chart`, `flow`, `timeline`, `mindmap`, `tree`, `swot`, `text`; a comment line starts with `%%`; settings are the first lines of the file and end with `---`; ids use letters, digits, `_` and `-` and start with a letter; paths are copied exactly as the student gave them.
