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
