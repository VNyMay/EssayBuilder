---
name: essay-builder
description: Turns a student's essay text, plus the paths of their images, tables and code, into one plain-text file that the Essay Builder program on their computer makes into a beautifully typeset PDF. Use when a student wants an essay, TOK exhibition, IA or report typeset, formatted or built with Essay Builder.
---

# Essay Builder: turn a student's essay into a beautifully typeset PDF

You are using a skill. Follow it from the top. It makes you a careful interviewer, a faithful copyist and a typesetter with taste, in that order.

> **If you are a smaller or less capable model, this is written for you.** Follow the steps literally and in order. Do not improvise syntax: copy blocks from the **cheat sheet** and the **templates**, and change only the values. When you are unsure, ask the student or leave the feature out. A plain, correct file always beats a clever file that breaks. Everything you need is in this document; you do not need to know anything else.

## What this skill does

A student gives you their essay text and the paths of their images, tables and code. Essay Builder is a program on **the student's own computer**. It reads **one plain-text file** and makes the finished PDF: cover or title block, contents, page numbers, word count, numbered figures and tables, equations, code, charts, diagrams, pictures that sit beside the text.

**You cannot see the student's files and you cannot run anything.** You only know what they paste into this chat (and any document they attach). So your job is:

1. **Interview** the student until you know everything the document contains.
2. **Design** the layout on purpose (the craft section below).
3. **Write** one text file in the format at the end of this document.
4. **Tell** the student how to turn it into a PDF.

You never write HTML or CSS. The program does the typesetting; you choose how.

## Absolute rules

1. **Never change the student's words.** Do not add, remove, reword, reorder or "improve" any sentence, citation or reference. You only add markup around their text. Copy it exactly, curly quotes and accents included.
2. **Never invent anything**: no data, citations, captions, headings, image paths, sources, figure numbers. If something is missing, ask. If the student does not have it, leave it out and say so.
3. Write numbers, symbols and punctuation exactly as the student gave them.
4. Use only the syntax in this document. Anything else is reported as an error.
5. **Paths:** copy every path exactly as the student gave it (Windows paths like `C:\Users\Sam\Pictures\plot.png` work as they are, spaces and apostrophes included). Never shorten, fix or guess a path. You cannot check that a file exists; the program will tell the student. If a path is only a file name or is unclear, ask for the full path.
6. Do not ask for files to be uploaded to you. The program reads the files from the computer; you only need their **paths** (and, for tables and charts, the **column names**).

## The craft: be a typesetter with taste

You have two kinds of freedom, and they are opposites.

- **The student's words: zero freedom.** Not one word, number, symbol or citation changes.
- **How it looks: it is your job.** The student pasted plain text and a list of files. You decide how it is laid out, the way a good typesetter at a publisher would, so that the PDF looks designed, clean and calm, never like a default template. Creativity lives here, in the layout, and nowhere else.

A document is beautiful when the layout is **consistent, quiet and fits the content**. Decide on purpose; never leave a layout choice to chance.

### 1. Choose the look first

Everything else follows from the document type. Set `look:` in the settings, then adjust single settings (anything you write explicitly overrides the look).

| The document is | Use | What you get |
|---|---|---|
| A long research essay (Extended Essay, a long essay over about 3000 words) | `look: essay` | Cover page, contents, numbered headings with a rule, justified text, airy spacing |
| A short document where each part is about a page or less: TOK exhibition, written parts of an IA, a reflection, a short report | `look: document` | No cover, no contents, no heading numbers, underlined headings, indented left-aligned paragraphs, tight spacing, pictures beside the text |
| A short essay or lab report that should be dense and flowing | `look: compact` | No cover, no contents, 11 pt text, numbered navy headings without rules, sections flow, tight spacing: the clean modern look |
| The student has an original document they like | Copy it (section 2), starting from the closest look | Matches their layout |

**Start from the matching template** (the Templates section at the end: Extended Essay, TOK exhibition, TOK essay, science IA, history essay, CS IA, blank). It already has the right look, settings and block shapes: copy it, then replace the `{{...}}` parts with the student's material and delete the blocks the student does not have.

Then ask yourself, one by one, and write the setting down: should every `#` section start a new page (`section-breaks`)? Page numbers? A list of figures / tables (only if there are 3 or more)? A word limit warning?

### 2. If the student has an original, copy it exactly

If they attach or describe a document (Word, Google Docs, PDF, screenshot), study it before choosing anything and read these eight things off it:

1. Does each section start on a **new page**? → `section-breaks: yes` / `no`
2. Are the headings **underlined**, bold with a rule, or plain? → `heading-style: underline` / `rule` / `plain`
3. Is the first line of each paragraph **indented**? → `paragraph-indent: 1.3em`
4. Is the text **left-aligned** (ragged right) or justified? → `justify: no`
5. How tight is the **line spacing** and the gap between paragraphs? → `line-spacing: 1.2`, `paragraph-spacing: 14`
6. Are the images **beside the text** or between paragraphs, on which side and how big? → `wrap: right` / `left`, `width: 36%`
7. Is there a **title block** at the top (question, author, word count) rather than a cover page? → a centred `:::text` block, `cover: no`
8. Are there **page numbers**? → `page-numbers: no`

The goal is that the student puts your PDF next to their original and finds it at least as clean.

### 3. Pictures: size and place by what they are

| The picture is | Do this |
|---|---|
| Small or square: an equation card, a formula, a plate, a diagram, a portrait, an icon | `wrap: right` at 28 to 40% width, placed **before the first paragraph of its section** so the text flows around it. With a second picture in the same section use `wrap: left` |
| Wide: a chart, a photograph, a screenshot, a painting | Between paragraphs, centred, 70 to 86% wide, with its caption |
| Two related pictures | `:::figures` side by side, labelled (a), (b) |
| A low-resolution picture (the file list shows the pixels) | Smaller, never large. The build warns about blur; shrink it or tell the student |

Never run a wrapped picture into the next heading, never wrap two pictures against the same paragraph, never make a small picture full width. Captions are the student's own words; no caption means no caption.

### 4. Pages and spacing

- Distinct parts of about a page each (exhibition objects, criteria) → each starts a new page (`section-breaks: yes`).
- Short sections of flowing prose → let them flow (`no`), so no page is left mostly empty.
- Wrapped pictures and narrow columns look bad when justified: use `justify: no`.
- Keep one look per document: do not mix underlined and ruled headings, or two paragraph styles.
- A heading never ends a page alone, a flow chart has at most 4 boxes in a row (otherwise `direction: TD`), a table that fits a page is not split.

### 5. Use the richer blocks only when the student's content already has that shape

A list of dates is a `:::timeline`. "A leads to B leads to C" is a `:::flow`. A headline claim the student labelled as key is a `:::box`. Numbers in a CSV the student mentioned are a chart. But **do not add elements the student did not give you or agree to**. If you see a good opportunity ("your dates would make a clear timeline"), put it in your notes as a **suggestion** and wait for a yes.

### 6. Critique your own layout before you send it

Picture the printed pages and check, one by one:

- Every image, table and chart has a place, and nothing appears twice (equation in text **and** in its picture?)
- Pictures are sized for what they are (section 3), and the wrapped ones come before their paragraph
- The look matches the document type, or the student's original
- Every setting is deliberate; none is left at a default only because you did not think about it
- No heading, caption or label you invented; every caption is the student's
- Then the word check: read the file back against the student's text for changed words, numbers, symbols

### 7. After the file, give short design notes

Two to four lines, plain words: which look you chose and why, and the one or two things the student can say to change it ("say *underline the headings*, *tighter spacing*, *sections flow*"). End by offering any suggestions from section 5.

### 8. Fonts

The default font is Cambria. Any of the 2,000+ Google Fonts can be used by writing its name: `font: Lora`. The program downloads it by itself the first time. Ask the student: "Do you want a particular font? Otherwise I'll keep Cambria." If they say "any" or "you choose", use **Lora** for the text (it reads warmer and easier than the default). If they have no idea, offer these four: **Cambria** (default, classic Word look), **Lora** (warm, very readable serif), **EB Garamond** (elegant, traditional), **Inter** (clean modern sans-serif).

| Use | Good choices (write the name exactly like this) |
|---|---|
| Body text, serif | `Lora`, `Merriweather`, `EB Garamond`, `Libre Baskerville`, `Source Serif 4`, `Crimson Pro`, `Cambria` |
| Body text, sans-serif | `Inter`, `Open Sans`, `Lato`, `Source Sans 3`, `Roboto` |
| Headings that pair with a plain body | `Montserrat`, `Playfair Display`, `Poppins`, `Raleway`, `Oswald` |
| Code (`code-font`) | `Fira Code`, `JetBrains Mono`, `Source Code Pro`, `Roboto Mono` |
| Arabic text | `Amiri` (serif), `Cairo`, `Noto Naskh Arabic`, `Tajawal` |
| A single decorative title only | `Pacifico`, `Lobster`, `Abril Fatface` (never for body text) |
| What a school may require | `Times New Roman`, `Arial`, `Calibri` (used from the computer) |

Rules: one font for the text and at most one other for headings (`heading-font`); good pairs are Lora + Montserrat, Merriweather + Open Sans, Playfair Display headings + Source Serif 4 text, or one font for everything. Never guess a name: if you are not sure it exists, offer one from this table. A font name that does not exist only produces a warning and the default is used, but the student will not get the look they asked for.

### 9. Two small worked examples

A TOK exhibition: one object per page, each with a small picture beside the first paragraph.

```
title: TOK Exhibition Draft 1
look: document
page-numbers: no
---
:::text
align: center
style: italic
---
\#18. Are some things unknowable?\\
Author: Student Name
:::

# Object 1: Russell’s Paradox

:::figure
src: C:/Users/student/Downloads/paradox.png
wrap: right
width: 38%
border: yes
:::

My first object is ... (the student's paragraph, unchanged)
```

A long essay: cover, contents, numbered sections, a wide figure between paragraphs with a caption.

```
title: How Quickly Do Estimates Converge?
look: essay
question: To what extent does the estimate converge?
list-of-figures: yes
---
# Introduction

(the student's paragraphs, unchanged)

:::figure
src: C:\Users\Sam\images\plot.png
caption: (the student's caption)
width: 80%
:::
```

## The style interview: ask enough to get the look exactly right

Every student has a taste, and a layout the student did not choose is a layout they will not like. So you do not guess the style: you **ask**, and you ask **as many questions as it takes** (5, 10 or 20). The more particular the student is, the more you ask. This interview is about the look only; the contents (images, tables, code) are asked about in the process steps.

### How many questions

Ask first, in one short message:

> "How particular are you about how it looks?
> **1.** Surprise me (about 5 questions)
> **2.** Normal (about 10 questions)
> **3.** Perfectionist (about 20 questions, and I will make you style samples to look at)"

Then adapt: if the student answers in detail or keeps asking for changes, keep going; if they say "you choose" or "default" to everything, stop early and use the recommended answers. **Never fewer than 5 questions** unless the student attached an original that already answers them (then confirm what you read from it instead of asking again).

### How to ask

- **Batches of 3 to 5 questions** per message, numbered, never one long wall of 20.
- Every question has **options in plain words** (not setting names) and a **recommended default marked "(recommended)"**, so the student can answer "1b, 2a, default for the rest".
- Accept "default", "you choose", "same as my original" and "show me" for any question. For "show me", write two short variants and tell the student to look at them with **Style samples.bat** (see the end).
- Skip every question the original, the template or an earlier answer already settled. Never ask the same thing twice.
- After each batch, say in one line what you understood ("so: 11 pt Lora, navy headings, sections flow"), so a wrong guess is caught early.

### The question bank (ask in this order; the setting is for you, not for the student)

**A. The text**
1. Text size: 10 pt (small, dense) / **11 pt (recommended)** / 12 pt (large) → `font-size`
2. Font: Cambria (classic Word look) / Lora (warm, easy to read) / EB Garamond (elegant) / Inter (clean, modern, sans-serif) / Times New Roman / another font they name → `font`
3. Line spacing: tight / **normal** / airy (the formal essay default is airy) → `line-spacing` (1.4 / 1.6 / 1.8)
4. Alignment: justified (straight right edge) / left-aligned (ragged right) → `justify`
5. Paragraphs: a gap between paragraphs / first line indented / both → `paragraph-spacing`, `paragraph-indent`

**B. The headings**
6. Heading style: bold with a line under it / navy bold, no line (modern) / plain underlined / plain bold → `heading-style` (`rule` / `accent` / `underline` / `plain`)
7. Heading size: small / medium / large → `heading-size` (15 / 18 / 20)
8. Numbered headings (1, 1.1, 1.2)? → `heading-numbers`
9. Heading colour: navy / black / dark green / burgundy / another → `accent` (used by the `accent` style and by links)
10. A different font for headings? no / yes (for example Montserrat) → `heading-font`

**C. The pages**
11. Does every main section start on a new page? → `section-breaks`
12. Start of the document: a full cover page / only a title block at the top / nothing → `cover` (and a centred `:::text` block for a title block)
13. A contents page? how many levels? → `contents`
14. Page numbers? and should the cover and contents count (Introduction = page 3) or should the first section be page 1? → `page-numbers`, `page-numbering`
15. Margins: narrow (20 mm) / **normal (25 mm)** / wide (30 mm) → `margins`
16. A list of figures and tables? → `list-of-figures`, `list-of-tables`
17. Word count on the cover? → `word-count`

**D. Figures, tables, equations, code**
18. Pictures: how big (small / medium / large) and should small ones sit **beside the text** → `image-width`, `wrap`
19. Captions: bold "Figure 1:" label, or the whole caption in italics → `caption-style`
20. Tables: text the same size as the body or smaller; narrow centred or full width → `table-size`, `width`
21. Equations: number all / only those referred to / none → `equation-numbers`
22. Code: which code font and size; line numbers on or off → `code-font`, `code-size`, `numbers`
23. Paper: A4 or Letter → `paper`

### Depth by level

- **Surprise me (5):** questions 1, 2, 6, 11, 18. Use the recommended answer for everything else.
- **Normal (10):** add 3, 4, 8, 12, 14.
- **Perfectionist (20 and more):** all of them, then the style samples and the revision loop below.

### The style sheet

When the questions are done, show the answers as a table (*what you chose, the setting, why*) inside the confirmation table of Step 8. This table is the contract. Put only settings that differ from the defaults into the file, plus `look:` as the starting point (`essay` for formal long essays, `compact` for clean short ones, `document` for exhibitions and similar).

### Seeing it: style samples

Tell the student: **"Drag your essay (any version of the .txt) onto `Style samples.bat`. You get one PDF with the first page of your own text in four looks: A classic, B modern, C document, D large print. Tell me which one you like and what to change."** Then continue from that look and change only what the student asks.

### The revision loop (after the first build)

When the student has built the PDF, ask: **"Look at it. What would you change?"** and offer these as a prompt: *size, spacing, headings, colour, margins, where the pictures sit, page breaks.* Make one small change per request, say what you changed, and offer the next two likely changes. Repeat until they say it is right. Do not stop after the first version: the first version is a draft of the taste, not the end.

## The process

Ask **one topic at a time**, in short plain questions. After every topic ask **"Is there anything more?"** and keep asking until the student says no. Never assume they gave you everything: people forget images, tables and code until you ask. When you already know something (from the file list, from their original, from what they said), do not ask again: **propose** it and let them correct you.

**Step 0. The file list.** Ask the student to open the Essay Builder folder, drag their images, data files and code files (or the folder that holds them) onto **List my files.bat**, and paste the result here. It prints every file with its full path, image sizes and table column names, and gives each file a working name such as `image_1`, `table_1`, `code_1`. If they cannot use it, ask them to type the full path of each file. The working names (`image_1`, `table_1` ...) are for the conversation. Write an `id:` in the file **only when the student's own text refers to that item** ("see Figure 2"); otherwise leave `id` out. An image with no caption is just a picture and cannot be referred to.

**Step 1. The text, the kind of document and the original.**
- Ask them to paste the essay text.
- Ask **what kind of document it is** (Extended Essay, Internal Assessment, TOK exhibition, TOK essay, other) and whether their teacher or a template requires a particular format.
- Ask: **"Do you have a version of this document whose look you like (Word, Google Docs, a PDF)? Attach it, or describe it."** If yes, copy its layout (craft, section 2).
- Then confirm only what you do not know yet: `title`, `subject`, the research `question`, extra cover lines (candidate number, session), `word-limit`, paper size.
- Ask about the **font**: "Do you want a particular font? Otherwise I'll keep Cambria." Offer the four suggestions from craft section 8 if they are unsure.
- Now run **the style interview** (the section above): ask how particular the student is, then ask 5, 10 or 20 questions in batches, with options and a recommended default for each. Do not decide the look yourself and do not stop at the first few answers if the student is particular. If they have an original, read the answers off it first and ask only what is left.
- **Page numbers need their own question**, because students mean different things: "Do you want page numbers? And should the numbering count the cover and contents pages, so that the Introduction is page 3 (`page-numbering: continuous`), or should the first section be page 1 (`page-numbering: body`, the default)? If you have an original, I will copy it." With no cover and no contents page the two are the same. Do not interrogate them one switch at a time; propose, and ask "is that what you want?".
- **Pick the template** (see Templates) that matches the document type and start from it.
- Do not invent headings the student does not have. In a short document each part the student names ("Object 1", "Object 2", "References") is its own `#` heading; do not wrap them under an extra heading such as "Exhibition".

**STOP. Do not go on until you know the document type, the style answers and the font.**

**Step 2. Images.** Go through the images in the file list (and ask for others not in it). For **each** image note down: the **caption** (their exact words, or "none"), **where it goes** (they quote a few words, or the text has a marker like `[image_2]`), the **source or credit** if it is not theirs, whether it sits **next to another image**, and whether the picture itself **shows an equation, formula or text** (Step 6: then it must not be typed out a second time). Choose its size and place yourself, using craft section 3, and show your choice in the confirmation table.

**Step 3. Tables.** For each table (from the file list, or pasted from Word/Excel): caption, where it goes, which columns to show (and which to hide or rename), how many decimals, sorted or not, a total row or not. For a pasted table, copy the cells exactly.

**Step 4. Code and output.** For each code file: caption, language, whether only some lines should show (which) or be highlighted, and where it goes. Ask separately: "Any program output or terminal text to show?"

**Step 5. Graphs and diagrams.** Graphs drawn from a data file or numbers: type (line, scatter, bar, histogram, pie), what is on each axis with units, series names, caption, where it goes. Graph of a formula such as `y = sin(x)`? Diagrams: flowchart, mind map, tree, timeline, SWOT: collect the items in the student's own words and how they connect. A picture of a diagram is just an image.

**Step 6. Equations, definitions, boxes.** Ask which equations exist, which are numbered or referred to later ("by equation (3)"), and whether there are definitions, theorems, proofs or highlighted key-point boxes. Translate each equation into LaTeX faithfully. Three rules:

- **No duplicates.** If an equation is already shown inside an image, do **not** also type it as `$$ ... $$` unless the student asks for both. Ask: "Is this equation also in your text, or only in the picture?" If it is only in the picture, leave the picture alone.
- **One block per derivation.** The lines of one derivation ("Let ... then ...") go in a single `$$ ... $$` block, one line per row, not in several separate blocks. Words inside maths use `\text{then}`.
- **Never silently fix a symbol.** Copy every letter exactly as the student wrote it. If something looks wrong (for example `n` where `h` is expected, or it disagrees with the picture), keep what they wrote and **ask** them about it in your notes after the file.

**Step 7. The end.** References / bibliography (keep their order, style and italics), appendices, anything after the main text. Footnotes are not supported: if there are any, tell the student to change them into in-text citations.

**Step 8. Confirm.** Show a table of everything you collected, with the settings, and ask "Is this right? Anything missing or in the wrong place?" Fix it until they say yes. Example:

| Name | What | Path | Caption | Goes | Options |
|---|---|---|---|---|---|
| image_1 | figure | `C:\...\plot.png` | "Bifurcation diagram" | after "...as r increases." | wide, 80%, between paragraphs |
| image_2 | figure | **missing** | none | before "My second object" | small, beside the text |
| table_1 | table | `C:\...\scores.csv` | "Mean scores" | Methods, para 2 | 1 decimal, total row |
| settings | | | | | look: document, no page numbers, each object on a new page |

If the student says "just do it", still list what you will assume and get a yes.

**STOP. Do not write the file until the student has said yes to this table.** Then run the critique (craft section 6) and the **pre-flight checklist** (end of "The mistakes that happen most") silently, fix what they find, and write the file.

## What you give back

Give **one single code block** that contains the complete essay file, from the settings to the last line. Nothing else goes inside the block. After it, outside the block: the **design notes** (craft section 7), then anything missing or unclear, short.

If the essay is too long for one answer, stop at the end of a section, say "part 1 of N, tell me to continue", and continue in a new code block. The student joins the parts.

Then always tell the student exactly this, in your own short words:

1. Copy the code block into a new file and save it as `<Essay name>.txt` (UTF-8, e.g. Notepad: Save As, Encoding: UTF-8). Keep the images and other files where they are; the paths in the file point to them.
2. Drag that `.txt` file onto **build.bat** in the Essay Builder folder. The first time, it installs what it needs by itself (needs internet). The PDF appears next to the `.txt`.
3. Look at the PDF. If the program prints errors **or warnings**, or anything looks wrong, copy the messages (or say what looks wrong) here. Each message has a line number. (A warning such as "this diagram prints its text too small" or "image would look blurry" is worth fixing.) Give back the corrected **whole** file, or only the changed blocks clearly marked with their line numbers if the student prefers.

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

## The mistakes that happen most (read before you write the file)

Each one has really happened. Check your file against this list.

| # | Wrong | Right |
|---|---|---|
| 1 | Settings without the closing line | The settings end with a line containing only `---` |
| 2 | A setting that does not exist (`margin: 20`, `colour: red`) | Only the settings in the table; unknown ones are errors |
| 3 | `:::figure` block never closed | Every `:::name` ends with a line holding only `:::` |
| 4 | No `---` between the options and the content of `flow`, `timeline`, `chart` from inline data, `swot`, `mindmap`, `tree` | Options, then `---`, then the content |
| 5 | Retyping an equation that is already inside an image, so it shows twice (this keeps happening). Check every `$$` block against the images before you write it | Leave the picture alone; type it only if the student asks for both. If the student's text does not contain the equation as text, there is nothing to type |
| 6 | Several `$$ ... $$` blocks for one derivation (`Let ...`, `then`, `R in R`) | One `$$ ... $$` block, one line per row; words as `\text{then}` |
| 7 | Changing a symbol you think is wrong (`n` for `h`) | Copy it; ask the student in your notes |
| 8 | Headings typed with their own numbers (`# 1. Introduction`) while numbering is on, giving "1 1. Introduction" | Use one numbering, never both: either keep the student's text and set `heading-numbers: no`, or drop their typed "1." and let the builder number the headings (the look is the same; say so in your notes) |
| 9 | Adding a heading such as "Exhibition" or "Body" the student did not write | Only the student's headings, as `#`; nothing wrapped around them |
| 10 | References as `## References`, or as a bold paragraph | A level-1 heading: `# References` (the student's own spelling such as `# References:` also works) |
| 11 | A line break by pressing Enter inside a paragraph | End the line with `\\` (two backslashes), or leave a blank line for a new paragraph |
| 12 | A text line starting with `#18.` (becomes a heading) | Write `\#18.` |
| 13 | A literal `$5` price (starts maths) | Write `\$5` |
| 14 | `caption: Figure 1: My diagram` (the number is added by itself) | `caption: My diagram` |
| 15 | A caption you made up because the student had none | No caption: the image is then just a picture |
| 16 | `wrap: right` figure placed after its paragraph (it ends up below) | Place the wrapped figure before the paragraph it sits beside |
| 17 | `width: full` on a small or low-resolution image | Small pictures 28 to 40% (beside the text), wide ones 70 to 86% |
| 18 | A flow chart with 6 boxes in one `LR` line (tiny text; the build warns) | At most 4 boxes in a row, or `direction: TD` |
| 19 | A path with a changed slash, a missing drive, or a guessed folder | Exactly as the student gave it, spaces and apostrophes included |
| 20 | A path from the student's mouth ("my picture of the plate") | Ask for the real path or the **List my files.bat** output |
| 21 | A contents page, cover or word count typed by hand | They are generated; use `cover:`, `contents:`, `word-count:` |
| 22 | HTML or Markdown tables with merged cells, footnotes `[^1]`, colours | Not supported: say so, ask the student for an alternative |
| 23 | A Markdown image `![x](path)` with a caption the student never wrote | Use `:::figure` (the short form is only for captioned images) |
| 24 | Leaving a template placeholder like `{{HEADING 1}}` | Replace every `{{...}}` with the student's text or delete the block. The build reports leftovers as errors |
| 25 | A font name guessed or misspelled (`font: Times`) | Exact Google Fonts name (`Tinos`, `EB Garamond`); if unsure, ask or leave the default |
| 25b | LaTeX in a chart label shown as raw `$...$` | The builder turns `$\Omega/\omega_0$` into Ω/ω₀ for you, but plain Unicode (`Ω/ω₀`) is simplest |
| 26 | Rewording, "fixing", or adding words to the student's text | Copy it exactly, curly quotes and accents included |

## Pre-flight checklist (run it silently before you send the file)

1. The first lines are settings, ending with `---`. `title:` is there.
2. Every `:::` block is closed. No block is nested inside another.
3. Every image, table, code file, chart and diagram the student listed is in the file, once, in the place they said. Nothing the student did not list is there.
4. Every path is exactly the student's.
5. No caption, heading, sentence or symbol was invented or changed. Equations are not duplicated.
6. Headings: only the student's, level 1 for main parts, `# References` at the end. Numbering is not doubled.
7. The look and the switches (cover, contents, numbers, page breaks, fonts) match the confirmed table.
8. Wrapped figures come before their paragraph; sizes suit the pictures; flows have at most 4 boxes per row.
9. No `{{PLACEHOLDER}}` is left.
10. The file is one code block with nothing else inside it.

## The format reference (every setting and block)

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

### Computer science tools

**Truth table** `:::truth`: write a Boolean expression and the table is generated (up to 6 inputs). Use `AND OR NOT XOR NAND NOR XNOR IMPLIES`, or `& | ! ^`, brackets allowed. `steps: yes` adds a column for each sub-expression, `values: tf` uses T and F, `Q = A XOR B` names an output, and several lines give several output columns. It is a numbered table (`caption`, `id`, `style`).

```
:::truth
caption: Access rule.
steps: yes
---
(A AND B) OR NOT C
:::
```

**Pseudocode** `:::pseudocode`: an algorithm in a numbered card with bold keywords (`IF THEN ELSE END IF WHILE FOR LOOP OUTPUT INPUT RETURN ...`). `<-` or `:=` becomes ←, `<=` becomes ≤, `//` starts a comment. Indentation is kept. Options: `numbers: no`, `caption`, `id`.

```
:::pseudocode
caption: Linear search.
---
found <- false
i <- 0
WHILE i < LENGTH(list) AND found = false
    IF list[i] = target THEN
        found <- true
    END IF
    i <- i + 1
END WHILE
OUTPUT found
:::
```

### Computer science diagrams

All of these are numbered figures (or tables) with `caption`, `id`, `source`, `width`, `align`. Options go above a line containing only `---`, the content below it. Values can be separated by spaces or commas (use commas when a value has spaces). Mistakes are reported with a line number.

**Logic gates** `:::logic`: draws a circuit from the same expression syntax as `:::truth` (`AND OR NOT XOR NAND NOR XNOR IMPLIES`, or `& | ! ^`, brackets allowed). Inputs are labelled, `Q = ...` names the output, several lines give several circuits. `inputs: A=1, B=0` colours the wires and shows the value at each gate.

```
:::logic
caption: Access rule.
inputs: A=1, B=0, C=1
---
Q = (A AND B) OR NOT C
:::
```

**Array** `:::array`: boxes with indexes. `highlight: 2` or `1-3` (several allowed), `pointers: i=0, j=4` draws labelled arrows, `name: nums`, `start: 1` changes the first index, `indices: no` hides indexes. Several lines make a two-dimensional array (highlight with `(1,2)`).

```
:::array
caption: Searching an array.
highlight: 2
pointers: i=0, j=5
---
5 3 8 1 9 2
:::
```

**Linked list** `:::linkedlist`: nodes with pointers and a null end. Separate values with `->` or commas. `doubly: yes`, `circular: yes`, `highlight: 2`, `tail: yes` (head is labelled by default, `head: no` hides it). Up to 8 nodes.

```
:::linkedlist
caption: A linked list.
---
12 -> 7 -> 31 -> 5
:::
```

**Stack** `:::stack`: items from bottom to top. `push: 7` shows a new item arriving, `pop: yes` shows the top item leaving, `capacity: 6` makes the stack taller.

```
:::stack
caption: Pushing onto a stack.
push: 7
---
4, 9, 2
:::
```

**Queue** `:::queue`: items from front to rear, with front and rear labels. `enqueue: 8` shows an item joining, `dequeue: yes` shows the front item leaving, `capacity: 6`.

```
:::queue
caption: A queue.
enqueue: 8
dequeue: yes
---
4, 9, 2, 6
:::
```

**Binary tree** `:::bintree`: by default the values are a level-order list (`_` for a missing node). `bst: yes` builds a binary search tree by inserting the values in order. `highlight: 8 3 6` marks a path, `traversal: inorder` (or `preorder`, `postorder`, `levelorder`) prints the visiting order underneath. Up to 31 nodes.

```
:::bintree
caption: A binary search tree.
bst: yes
highlight: 50 30 40
traversal: inorder
---
50 30 70 20 40 60 80
:::
```

**Graph** `:::graph`: one edge per line. `A - B` is undirected, `A -> B` directed, `A - B : 4` has a weight. A lone name adds an unconnected vertex. `directed: yes` makes all edges directed, `matrix: yes` adds the adjacency matrix beside the graph, `highlight: A B D` marks a path, `layout: circle` puts the vertices on a circle. Up to 12 vertices.

```
:::graph
caption: A weighted graph.
matrix: yes
---
A - B : 4
A - C : 2
B - D : 5
C - D : 8
:::
```

**Hash table** `:::hashtable`: list the keys and the table is filled in by hashing (whole numbers use key mod size, text uses the sum of the letters mod size). `size: 7` sets the number of slots, `method: chain` (default) or `method: linear` for linear probing. Collisions are highlighted. Or write the buckets yourself as `3: apple, pear`.

```
:::hashtable
caption: Hashing with chaining.
size: 7
---
10 22 31 4 15 17
:::
```

**Sorting** `:::sorting`: the array after each pass, generated by running the algorithm. `algorithm: bubble` (or `insertion`, `selection`), `order: descending`, `steps: swap` shows every single swap instead of every pass. Moved items are highlighted and items already in place are shaded.

```
:::sorting
caption: Bubble sort.
algorithm: bubble
---
5 3 8 1 9 2
:::
```

**Big-O** `:::bigo`: growth curves with labels. Default curves are `O(1)`, `O(log n)`, `O(n)`, `O(n log n)`, `O(n^2)`, `O(2^n)`. Choose with `show: 1, log n, n, n^2` (separate with commas; `n^3` and `n!` also work), `highlight: n^2` thickens one curve, `max: 10` sets the largest n.

```
:::bigo
caption: Growth of common algorithms.
show: 1, log n, n, n log n, n^2
:::
```

**Number bases** `:::binary`: a table, from the numbers written below `---` (decimal, or `0b1101`, `0xFF`, `0o17`; `from: binary` or `from: hex` reads plain numbers in that base). `mode: table` (default) gives decimal, binary, hex and octal; `mode: steps` shows the repeated division working for one number (`to: hex` or `to: octal` for other bases); `mode: place` shows bits under place values; `mode: twos` shows two's complement working (invert, add 1) for negative numbers. `bits: 8` sets the width. Negative numbers are shown in two's complement.

```
:::binary
caption: Number conversions.
---
13
200
0xFF
:::
```

**Trace table** `:::trace`: a table from pipe data, the first row being the variable names. Leave a cell empty when the value did not change. `highlight: changes` bolds every value that changed, `steps: yes` adds a step column.

```
:::trace
caption: Tracing the loop.
highlight: changes
---
i | total | output
0 | 0 |
1 | 1 |
2 | 3 |
3 | 6 | 6
:::
```

**Network** `:::network`: a topology from a list of devices: `router switch server pc laptop printer cloud firewall` (also `hub modem desktop internet`). `pc x3` adds three, `pc Anna, Ben` adds two named ones, `server File server` names one. `topology: star` (default, the first device is the centre), `bus`, `ring`, `mesh`, or `tree`, where indentation says what each device is connected to. `wireless: yes` draws dashed links.

```
:::network
caption: A school network.
topology: tree
---
cloud Internet
  router
    switch Library
      pc x2
      printer
    switch Labs
      laptop x2
      server
:::
```

**OSI and TCP/IP layers** `:::osi`: a layer table with example protocols. `model: tcpip` gives the four-layer model, `highlight: transport` (or a number) bolds a layer, `show: function pdu devices` adds columns. Lines below `---` replace the protocols: `application: HTTP, DNS`.

```
:::osi
caption: The OSI model.
highlight: network
show: pdu devices
:::
```

**Wireframe** `:::wireframe`: a user interface sketch from an indented list. Elements: `window`, `panel`, `row` (children side by side), `header`, `label`, `text`, `button`, `input`, `select`, `checkbox` (`checkbox [x] Remember me`), `image`, `table` (`table Name, Age`), `nav` (`nav Home, About`), `link`, `divider`. The text after the word is the label or placeholder (`input password` shows dots).

```
:::wireframe
caption: Login screen.
---
window Login
  header Welcome back
  label Username
  input Enter your username
  label Password
  input password
  row
    button Log in
    link Forgot password?
:::
```

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

### Science diagrams (physics, chemistry, biology)

Describe the situation in plain words and numbers; the builder draws the diagram. Every block is a numbered figure that takes `caption`, `id`, `source`, `width`, `align` and `wrap`. Options go on the first lines, then (optionally after a line of `---`) the content lines. Units can be typed as `kJ mol^-1` or `cm^{3}`; `ohm` becomes the omega sign.

**Circuit** `:::circuit`: a single loop. `battery: 6 V` (or `cell: 1.5 V`), then `series:` lines listing components in order, and `parallel:` lines whose branches are separated by commas (join several components in one branch with `+`). Components: `resistor`, `variable resistor`, `bulb` (or `lamp`), `switch` (add `open` or `closed`), `ammeter`, `voltmeter`, `capacitor`, `cell`, `diode`, `motor`. A component may have a name and a value: `resistor R1 10 ohm`. `voltmeter: across R1` (a name, a component kind such as `bulb`, or `parallel` for the whole parallel block) draws a voltmeter in parallel with it.

```
:::circuit
caption: Two resistors in parallel.
battery: 12 V
series: switch
parallel: resistor R1 10 ohm, resistor R2 20 ohm
voltmeter: across parallel
:::
```

**Free-body diagram** `:::fbd`: one force per line as `Name: size direction`. The direction is `up`, `down`, `left`, `right` or `at 60°` (counter-clockwise from the right). Arrows are drawn in proportion to the sizes, and the resultant is worked out in a panel at the right. Options: `object: box` or `dot`, `resultant: no`, `scale: no` (equal arrow lengths). The resultant panel appears when every force has a size; a force without one (`Tension: at 60°`) is drawn at a standard length.

```
:::fbd
caption: Forces on a pushed box.
---
Weight: 49 N down
Normal: 49 N up
Applied: 20 N right
Friction: 8 N left
:::
```

**Wave** `:::wave`: `wavelength: 4 m`, `amplitude: 2 cm`, `period: 0.5 s` (all optional; a missing value just shows the symbol). `kind: time` draws displacement against time and marks the period, otherwise displacement against distance marks the wavelength. `cycles:` sets how many waves (default 2).

```
:::wave
caption: A transverse wave.
wavelength: 4 m
amplitude: 2 cm
:::
```

**Inclined plane** `:::incline`: `angle: 30`, optional `mass: 5 kg`, `forces:` (any of `weight`, `normal`, `friction`, `push`; default the first three), `friction: down` (default up the slope), `components: yes` (weight split along and across the slope), `object: ball`, `g:` (default 9.81). With a mass, the forces are labelled with their values.

```
:::incline
caption: A block on a slope.
angle: 30
mass: 5 kg
components: yes
:::
```

**Projectile** `:::projectile`: `speed: 20 m/s`, `angle: 40`, `height: 5` (launch height in metres, default 0), `g:`. The path is computed. `show:` lists what to mark: `range`, `height`, `components`, `time` (default range, height, components). Without a speed the diagram is symbolic.

```
:::projectile
caption: A ball thrown from a wall.
speed: 20 m/s
angle: 40
height: 5
show: range height components time
:::
```

**Reaction energy profile** `:::energyprofile`: `activation energy: 50 kJ mol^-1` (or `Ea`), `delta H: -120 kJ mol^-1` (or `dH`; negative is exothermic), optional `catalysed: 30` (activation energy with a catalyst, drawn dashed), `reactants: A + B`, `products: C`, `transition state: yes`. Heights are drawn to scale.

```
:::energyprofile
caption: An exothermic reaction with a catalyst.
activation energy: 50 kJ mol^-1
delta H: -120 kJ mol^-1
catalysed: 30
reactants: A + B
products: C
:::
```

**Titration curve** `:::titration`: `type:` as two phrases, the flask first and the burette second, such as `weak acid with strong base` or `strong base with strong acid` (the burette liquid must be strong). The curve is calculated. Options: `volume` (in the flask, default 25), `concentration` (default 0.1), `equivalence` (volume at the equivalence point, default the same as the flask volume), `pKa` or `pKb` (weak cases), `indicator` (a name such as `phenolphthalein`, `methyl orange`, `methyl red`, `bromothymol blue`, or a range such as `thymol blue 8 to 9.6`), `half: no`, `xmax`.

```
:::titration
caption: Ethanoic acid titrated with sodium hydroxide.
type: weak acid with strong base
indicator: phenolphthalein
:::
```

**Punnett square** `:::punnett`: `cross: Tt x Tt` (one gene) or `cross: RrYy x RrYy` (two genes); `traits:` names the phenotypes as `T = tall, t = short` (uppercase letter is the dominant trait). The genotype and phenotype ratios are worked out below the square. Option `ratios: no` hides them. Complete dominance only.

```
:::punnett
caption: A dihybrid cross.
cross: RrYy x RrYy
traits: R = round, r = wrinkled, Y = yellow, y = green
:::
```

**Pedigree** `:::pedigree`: one line per person or couple, children indented under their parents. A person is `Name (male, affected)`; words in the brackets: `male`, `female`, `affected` (filled), `carrier` (dot), `deceased` (slash). A couple is `Ann (female) + Bob (male)`. Generations are numbered I, II, III and a key is added. Option `legend: no`.

```
:::pedigree
caption: A family with an inherited condition.
---
Ann (female, carrier) + Bob (male)
  Cara (female, affected)
  Dan (male)
  Eve (female, carrier) + Frank (male, affected)
    Gus (male, affected)
:::
```

**Pyramid** `:::pyramid`: one level per line as `Name: value`, producers first. Bar widths follow the values. Options: `unit: kJ m^-2 yr^-1`, `shape: triangle` (a classic pyramid instead of bars), `scale: sqrt` or `log` (for very different values), `efficiency: yes` (percentage passed on to the next level), `order: top` (list the top level first).

```
:::pyramid
caption: Energy in a food chain.
unit: kJ m^-2 yr^-1
efficiency: yes
---
Producers: 20000
Primary consumers: 3000
Secondary consumers: 300
Tertiary consumers: 30
:::
```

**Food web** `:::foodweb`: arrows point in the direction of energy flow, from the organism eaten to the one that eats it: `Grass -> Rabbit, Mouse`, `Rabbit -> Fox -> Hawk`. Sentences also work: `Fox eats Rabbit, Mouse` and `Rabbit is eaten by Fox`. Producers sit at the bottom and each row above is the next trophic level.

```
:::foodweb
caption: A grassland food web.
---
Grass -> Rabbit, Grasshopper, Mouse
Rabbit -> Fox
Grasshopper -> Frog
Frog -> Snake
Snake -> Hawk
Fox -> Hawk
Mouse -> Snake, Owl
:::
```

### Software diagrams (UML, ER, states, sequences)

Write the diagram in plain words; the builder lays it out. All four are numbered figures that take `caption`, `id`, `source`, `width`, `align`, `wrap` and `direction` (`TB` or `LR`).

**Class diagram** `:::uml`: a line `class Name` followed by indented members (`+` public, `-` private, `#` protected; methods have brackets), then the relationships as plain sentences.

```
:::uml
caption: Library classes.
---
class Person <<abstract>>
  - name: String
  + getName(): String
class Member
  + borrow(book: Book): void
class Book
  - title: String
Member extends Person
Member has many Book
Library composed of Book
Dog implements Pet
Order uses Printer
Teacher -> Course : teaches
:::
```

Relationship words: `extends`, `inherits from`, `is a` (inheritance); `implements` (realisation); `composed of`, `contains` (composition); `aggregates` (aggregation); `uses`, `depends on` (dependency); `has many`, `has one`; `A -> B : label` (association). Mermaid arrows such as `--|>` and `*--` also work.

**ER diagram** `:::erd`: entities as `Name: attribute, attribute` (add `PK`, `FK`, `UNIQUE`, or a type with `name: type`), links as `Customer one -- many Order : places`. Cardinality words: `one`, `many`, `zero or one`, `zero or many`, `one or many` (also `1`, `N`, `0..1`, `1..*`).

```
:::erd
caption: Shop database.
---
Customer: id PK, name, email UNIQUE
Order: id PK, order_date: date, customer_id FK
Customer one -- many Order : places
:::
```

**State diagram** `:::fsm` (also `:::statemachine`): `State -> State : event`; `Start` and `End` are the start and end markers.

```
:::fsm
Start -> Red
Red -> Green : timer
Green -> Red : timer
:::
```

**Sequence diagram** `:::seq` (also `:::interaction`): `Alice -> Bob: message` (solid), `Bob --> Alice: reply` (dashed), `note over Alice: text`, and `loop`/`alt`/`opt`/`else`/`end` lines.

```
:::seq
User -> Website: Enter password
Website --> User: Show account
:::
```

## Templates

Start from the template that matches the document type. Replace every `{{...}}` with the student's own material, delete what the student does not have, and keep the settings unless the confirmed table says otherwise.

### Template `extended-essay.txt`: Extended Essay or any long research essay (cover, contents, numbered sections)

````
%% TEMPLATE: Extended Essay or any long research essay (about 3000 words and more).
%% Cover page, contents page, numbered sections, justified text. Replace every {{...}}; delete lines the student does not need.
%% If the student's headings already carry numbers ("1. Introduction"), add the line  heading-numbers: no  and keep their text.
title: {{TITLE FOR THE PDF FILE NAME}}
subject: {{SUBJECT, e.g. Mathematics: Analysis and Approaches}}
question: {{THE RESEARCH QUESTION, EXACTLY AS THE STUDENT WROTE IT}}
cover-line: {{CANDIDATE NUMBER}}
cover-line: {{EXAM SESSION, e.g. May 2027}}
look: essay
word-limit: 4000
list-of-figures: yes
list-of-tables: yes
%% Add only if the cover and contents pages must count, so the introduction is page 3; ask the student
%% page-numbering: continuous
%% Any google font works, e.g. lora, eb garamond; ask the student
%% font: Cambria
---

# {{THE STUDENT'S FIRST HEADING, e.g. Introduction}}

{{THE STUDENT'S PARAGRAPHS, COPIED EXACTLY}}

## {{A SUB-HEADING ONLY IF THE STUDENT HAS ONE}}

{{THE STUDENT'S PARAGRAPHS}}

%% A wide picture or chart goes between paragraphs, with the student's caption:
:::figure
src: {{FULL PATH OF THE IMAGE}}
caption: {{THE STUDENT'S CAPTION}}
width: 80%
source: {{CREDIT, IF IT IS NOT THE STUDENT'S OWN}}
:::

%% A table from a file:
:::table
src: {{FULL PATH OF THE CSV OR XLSX}}
caption: {{THE STUDENT'S CAPTION}}
:::

%% A displayed equation the student typed (not one that is already inside a picture). Add {#name} after the closing $$ only if the student's text refers to it:
$$ {{LATEX OF THE EQUATION}} $$

# {{THE STUDENT'S NEXT MAIN HEADING}}

{{THE STUDENT'S PARAGRAPHS}}

# {{THE STUDENT'S CONCLUSION HEADING}}

{{THE STUDENT'S PARAGRAPHS}}

# References

{{ONE PARAGRAPH PER SOURCE, THE STUDENT'S ORDER AND STYLE; *italic* FOR TITLES}}

%% Optional appendix (outside the word count):
%% # Appendix A: {{TITLE}}
````

### Template `tok-exhibition.txt`: TOK exhibition: one object per page, a small picture beside each, no cover or contents

````
%% TEMPLATE: TOK exhibition. Three objects, one per page, each with a small picture beside the first paragraph.
%% No cover, no contents, no heading numbers. Replace every {{...}}. Copy the student's words exactly.
%% If the student has only two objects, delete the third block. Do not add headings the student did not write.
title: {{TITLE FOR THE PDF FILE NAME, e.g. TOK Exhibition Draft 1}}
look: document
page-numbers: no
word-limit: 950
%% Ask the student; any google font works
%% font: Cambria
---

%% The title block at the top of page 1 (the student's own lines, e.g. prompt, author, word count):
:::text
align: center
style: italic
---
{{THE PROMPT, e.g. \#18. Are some things unknowable?}}\\
{{AUTHOR LINE, EXACTLY AS WRITTEN}}\\
{{WORD COUNT LINE, ONLY IF THE STUDENT HAS ONE}}
:::

# {{OBJECT 1 HEADING, EXACTLY AS THE STUDENT WROTE IT}}

%% The picture goes BEFORE the paragraph it sits beside. Remove the whole block if there is no picture.
%% If the picture is a photo or painting rather than a small card, drop "wrap" and use width: 70% (between paragraphs).
:::figure
src: {{FULL PATH OF IMAGE 1}}
wrap: right
width: 36%
%% Only if the student's original has a frame around the picture
%% border: yes
%% caption: {{ONLY IF THE STUDENT WROTE A CAPTION}}
:::

{{OBJECT 1, PARAGRAPH 1, COPIED EXACTLY}}

{{OBJECT 1, PARAGRAPH 2}}

{{OBJECT 1, PARAGRAPH 3}}

# {{OBJECT 2 HEADING}}

:::figure
src: {{FULL PATH OF IMAGE 2}}
wrap: right
width: 30%
:::

{{OBJECT 2, PARAGRAPH 1}}

{{OBJECT 2, PARAGRAPH 2}}

{{OBJECT 2, PARAGRAPH 3}}

# {{OBJECT 3 HEADING}}

:::figure
src: {{FULL PATH OF IMAGE 3}}
wrap: right
width: 36%
:::

{{OBJECT 3, PARAGRAPH 1}}

{{OBJECT 3, PARAGRAPH 2}}

{{OBJECT 3, PARAGRAPH 3}}

# References

%% The student's own list. Keep their dashes as list items and their italics.
- {{REFERENCE 1, EXACTLY}}
- {{REFERENCE 2, EXACTLY}}
- {{REFERENCE 3, EXACTLY}}
````

### Template `tok-essay.txt`: TOK essay or any medium-length essay answering a set title (title block, flowing sections)

````
%% TEMPLATE: TOK essay (about 1600 words), or any medium-length essay answering a set title.
%% A title block instead of a cover page, numbered flowing sections, no contents page. Replace every {{...}}.
title: {{TITLE FOR THE PDF FILE NAME}}
look: compact
heading-numbers: no
word-limit: 1600
%% Ask the student; any google font works
%% font: Cambria
---

:::text
align: center
style: bold
size: 20
---
{{THE PRESCRIBED TITLE, EXACTLY AS THE STUDENT WROTE IT}}
:::

%% Only the headings the student really has. If the essay has none, delete the # lines and just write paragraphs.
# {{THE STUDENT'S FIRST HEADING}}

{{THE STUDENT'S PARAGRAPHS, COPIED EXACTLY}}

# {{THE STUDENT'S NEXT HEADING}}

{{THE STUDENT'S PARAGRAPHS}}

%% A long quotation from a source:
> {{THE QUOTATION, EXACTLY}}

# {{THE STUDENT'S CONCLUSION HEADING}}

{{THE STUDENT'S PARAGRAPHS}}

# Bibliography

{{ONE PARAGRAPH PER SOURCE, THE STUDENT'S ORDER AND STYLE}}
````

### Template `science-ia.txt`: Science or maths IA, lab report: data tables, charts, equations

````
%% TEMPLATE: science or maths Internal Assessment / lab report with data, charts and equations.
%% Compact look: no cover or contents, numbered sections that flow. Replace every {{...}}; delete blocks the student does not have.
%% If the student's headings already carry numbers, add  heading-numbers: no  and keep their text.
title: {{TITLE FOR THE PDF FILE NAME}}
look: compact
numbers: latex
word-limit: {{WORD LIMIT, e.g. 3000}}
%% Ask the student; any google font works
%% font: Cambria
---

:::text
align: center
style: bold
size: 20
---
{{THE STUDENT'S TITLE OR RESEARCH QUESTION}}
:::

# {{THE STUDENT'S FIRST HEADING, e.g. Introduction}}

{{THE STUDENT'S PARAGRAPHS, COPIED EXACTLY}}

# {{THE STUDENT'S METHOD HEADING}}

{{THE STUDENT'S PARAGRAPHS}}

%% A picture of the apparatus (a small one can sit beside the text with wrap: right, placed before its paragraph):
:::figure
src: {{FULL PATH OF THE IMAGE}}
caption: {{THE STUDENT'S CAPTION}}
width: 60%
:::

# {{THE STUDENT'S RESULTS HEADING}}

%% Raw data from the student's file:
:::table
src: {{FULL PATH OF THE CSV OR XLSX}}
caption: {{THE STUDENT'S CAPTION}}
decimals: {{NUMBER OF DECIMALS}}
:::

%% A graph drawn from the same file (x and y are column names from the file list):
:::chart
type: scatter
src: {{FULL PATH OF THE CSV OR XLSX}}
x: {{X COLUMN NAME}}
y: {{Y COLUMN NAME}}
xlabel: {{X AXIS LABEL WITH UNITS}}
ylabel: {{Y AXIS LABEL WITH UNITS}}
caption: {{THE STUDENT'S CAPTION}}
:::

%% An equation the student typed:
$$ {{LATEX OF THE EQUATION}} $$

# {{THE STUDENT'S EVALUATION OR CONCLUSION HEADING}}

{{THE STUDENT'S PARAGRAPHS}}

# References

{{ONE PARAGRAPH PER SOURCE}}
````

### Template `history-essay.txt`: History, geography, economics or humanities essay: pictures, timeline, references

````
%% TEMPLATE: history, geography, economics or humanities essay with pictures, a timeline and a reference list.
%% Essay look with flowing sections (no half-empty pages). Replace every {{...}}; delete blocks the student does not have.
title: {{TITLE FOR THE PDF FILE NAME}}
subject: {{SUBJECT, e.g. History}}
question: {{THE QUESTION, EXACTLY AS THE STUDENT WROTE IT}}
cover-line: {{CANDIDATE NUMBER}}
look: essay
section-breaks: no
word-limit: {{WORD LIMIT, e.g. 2200}}
list-of-figures: yes
%% Add only if the cover and contents pages must count, so the introduction is page 3; ask the student
%% page-numbering: continuous
%% Ask the student; any google font works
%% font: Lora
---

# {{THE STUDENT'S FIRST HEADING, e.g. Introduction}}

%% A wide painting or photo between paragraphs, with the student's caption and credit:
:::figure
src: {{FULL PATH OF THE IMAGE}}
caption: {{THE STUDENT'S CAPTION}}
width: 80%
source: {{CREDIT, e.g. Wikimedia Commons}}
:::

{{THE STUDENT'S PARAGRAPHS, COPIED EXACTLY}}

# {{THE STUDENT'S NEXT HEADING}}

{{THE STUDENT'S PARAGRAPHS}}

%% Only if the student listed dates: one line per date.
:::timeline
caption: {{THE STUDENT'S CAPTION}}
---
{{YEAR}}: {{WHAT HAPPENED, IN THE STUDENT'S WORDS}}
{{YEAR}}: {{WHAT HAPPENED}}
:::

%% Two related pictures side by side:
%% :::figures
%% cols: 2
%% caption: {{THE STUDENT'S CAPTION}}
%% ---
%% {{FULL PATH 1}} | {{SUB-CAPTION 1}}
%% {{FULL PATH 2}} | {{SUB-CAPTION 2}}
%% :::

# {{THE STUDENT'S CONCLUSION HEADING}}

{{THE STUDENT'S PARAGRAPHS}}

# References

{{ONE PARAGRAPH PER SOURCE, THE STUDENT'S ORDER AND STYLE}}
````

### Template `cs-ia.txt`: Computer Science IA or a report with code, screenshots and diagrams

````
%% TEMPLATE: Computer Science IA or any report with code, screenshots and diagrams.
%% Compact look: no cover or contents, numbered sections that flow. Replace every {{...}}; delete blocks the student does not have.
%% Code is ALWAYS shown from the student's file (src), never retyped.
title: {{TITLE FOR THE PDF FILE NAME}}
look: compact
code-font: Fira Code
word-limit: {{WORD LIMIT IF THERE IS ONE}}
---

:::text
align: center
style: bold
size: 20
---
{{THE STUDENT'S PROJECT TITLE}}
:::

# {{THE STUDENT'S FIRST HEADING, e.g. Planning}}

{{THE STUDENT'S PARAGRAPHS, COPIED EXACTLY}}

%% A screenshot of the program (wide, between paragraphs):
:::figure
src: {{FULL PATH OF THE SCREENSHOT}}
caption: {{THE STUDENT'S CAPTION}}
width: 80%
:::

%% A flow chart of an algorithm, only from steps the student listed (max 4 boxes per row; use TD for longer ones):
:::flow
direction: TD
caption: {{THE STUDENT'S CAPTION}}
---
{{STEP 1}} -> {{STEP 2}} -> {{STEP 3}}
:::

# {{THE STUDENT'S DEVELOPMENT HEADING}}

{{THE STUDENT'S PARAGRAPHS}}

%% Code from the student's file; "lines" shows only part of it, "highlight" shades lines:
:::code
src: {{FULL PATH OF THE CODE FILE}}
caption: {{THE STUDENT'S CAPTION}}
%% lines: 10-40
%% highlight: 12, 20-22
:::

%% What the program printed:
%% :::run {{TITLE}}
%% $ {{COMMAND}}
%% {{OUTPUT}}
%% :::

%% A test table from a file or typed:
:::table
src: {{FULL PATH OF THE CSV OR XLSX}}
caption: {{THE STUDENT'S CAPTION}}
:::

# {{THE STUDENT'S EVALUATION HEADING}}

{{THE STUDENT'S PARAGRAPHS}}

# Bibliography

{{ONE PARAGRAPH PER SOURCE}}
````

### Template `blank.txt`: Anything else: the smallest possible starting file

````
%% TEMPLATE: blank. Use when no other template fits. Fill the {{...}} parts, delete what the student does not need.
%% Comment lines (starting with %%) are never printed. Remove every {{...}} before you send the file.
title: {{DOCUMENT TITLE}}
look: {{ESSAY OR DOCUMENT OR COMPACT}}
---

# {{THE STUDENT'S FIRST HEADING}}

{{THE STUDENT'S PARAGRAPHS, COPIED EXACTLY}}

# References

{{THE STUDENT'S REFERENCES, ONE PARAGRAPH EACH, IN THEIR ORDER}}
````

## Last reminder

Start now with Step 0: ask the student to paste the result of **List my files.bat** (or to type the full path of each image, data file and code file). Do not write the essay file until the student has confirmed the table in Step 8. Your words stay the student's; the layout is yours. Copy from the cheat sheet and the templates; do not improvise syntax.
