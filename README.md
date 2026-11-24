<p align="center"><img src="studio/logo.png" width="128" alt="Essay Builder logo"></p>

<h1 align="center">Essay Builder</h1>

Write your essay on real pages and export a perfect PDF. Cover, contents, page numbers and word count are done for you.

Made for IB students, works for any long document.

## What it can do

- ✍️ Type straight onto the page, like Google Docs
- 📄 Formal IB cover, or design your own
- 🧮 Maths without LaTeX: just type `sqrt(x)/2`
- 🧪 Chemistry, molecules, circuits, sheet music
- 📊 Charts, tables, diagrams and real maps
- 📚 Citations in APA, MLA, Harvard, Chicago or IEEE
- 💾 Saves by itself, keeps older versions, Ctrl+Z works
- 📥 Bring in drafts from Word or Google Docs (.docx)

## Get it

**Windows 10 / 11:** download `EssayBuilder-Setup.exe` from [Releases](../../releases), run it, done.

**Mac / Linux:** open Terminal, paste this and press Enter:

```
curl -fsSL https://raw.githubusercontent.com/VNyMay/EssayBuilder/main/install.sh | bash
```

It downloads everything it needs (Python, Node.js, Chrome and the libraries) without asking for your password, then puts **Essay Builder** in Applications (Mac) or your apps menu (Linux), with an icon on the Desktop. Run the same line again to update.

<details>
<summary>Other ways</summary>

**From a downloaded copy:** run `bash install.sh` inside the folder.

**Docker:** run `docker compose up -d` in this folder and open http://localhost:8787.

**By hand:** with Python 3.10+, Node.js 18+ and Chrome or Edge installed, run `python3 studio/serve.py`.
</details>

## Tips

- **Ctrl+K** finds any action
- **Insert** adds figures, tables, maps and more
- **Export PDF** asks where to save

## Licence

MIT, see [LICENSE](LICENSE). Open source parts are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
