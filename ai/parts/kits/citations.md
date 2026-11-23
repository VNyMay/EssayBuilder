### Citations and the reference list (automatic)

Students never format citations by hand. List the sources once, cite them with `[@key]`, and the builder writes the in-text citations and the reference list in the chosen style.

Setting (top of the file): `citations: apa` (default), `mla`, `harvard`, `chicago` (author-date) or `ieee` (numbered). A sources file can also be named there: `sources: references.bib` (BibTeX) or a CSL-JSON `.json` export from Zotero or Mendeley.

Sources are typed in a `:::sources` block. Each source starts with `@key` on its own line, then `field: value` lines, and sources are separated by a blank line.

```
:::sources
@smith2020
type: book
author: Smith, John; Lee, Ann
year: 2020
title: The Industrial Revolution
publisher: Oxford University Press
city: Oxford

@lee2019
type: article
author: Lee, Ann
year: 2019
title: Steam and the city
journal: Journal of Economic History
volume: 79
issue: 3
pages: 645-690
doi: 10.1017/s0022050719000421

@bbc2021
type: website
author: {BBC News}
date: 2021-05-02
title: How the Industrial Revolution changed Britain
site: BBC
url: https://www.bbc.co.uk/news/example
accessed: 2026-11-01
:::
```

Types: `book`, `article`, `website`, `chapter`, `report`, `thesis`, `newspaper`, `video`, `dataset`, `ai`, `lecture`, `interview`, `image`, `social`. Fields: `author` (several separated by `;`, written `Last, First`; an organisation in braces `{BBC News}`), `editor`, `year` or `date` (`2021-05-02`), `title`, `journal`/`site`/`book`/`container`, `publisher`, `city`, `volume`, `issue`, `pages`, `edition`, `url`, `doi`, `accessed`, `school`, `degree`, `version`.

In the text:

| Write | Result (APA) |
|---|---|
| `[@smith2020]` | (Smith & Lee, 2020) |
| `[@smith2020, p. 14]` | (Smith & Lee, 2020, p. 14) |
| `[@smith2020; @lee2019]` | (Lee, 2019; Smith & Lee, 2020) |
| `[-@smith2020]` | (2020) |
| `@smith2020` | Smith and Lee (2020) |

Put the list where it belongs: a `# References` heading followed by `:::bibliography` (add `all: yes` to list sources that were not cited). Only cited sources are listed, sorted for the style (numbered in order of appearance for IEEE), with hanging indents and italics. Missing keys are reported with a "did you mean" hint, and uncited sources are warned about.
