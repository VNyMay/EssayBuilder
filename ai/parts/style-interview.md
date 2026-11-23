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
