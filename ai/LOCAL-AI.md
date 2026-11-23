# For an AI that can read files and run commands (Claude Code and similar)

Read **`AI Prompt.txt`** in the folder above this one: it is the complete skill (rules, interview, design craft, cheat sheet, common mistakes, format reference, templates). It is written for an AI that cannot see files; you can do more, so:

- Instead of asking the student to run **List my files.bat**, list their folder yourself and read the image sizes and table headers directly.
- Write the essay file next to the student's material, then check it:
  `python "<Essay Builder folder>\engine\build.py" "<essay>.txt" --check`
  Fix every ERROR (it prints line numbers and suggestions). Read every warning and fix or explain it.
- Build it: `python "<Essay Builder folder>\engine\build.py" "<essay>.txt"` and **look at the PDF** (render a few pages to images): contents, a figure page, a table page, the references. Compare it with the student's original if they gave one.
- Browse fonts: `python "<Essay Builder folder>\engine\build.py" --fonts serif` (or a word). A font named in the settings is downloaded automatically.
- The interview, the confirmation table and the rules about the student's words are **not** optional just because you can run things.
