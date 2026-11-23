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

## Get it

**Windows 10 / 11:** download `EssayBuilder-Setup.exe` from [Releases](../../releases), run it, done.

**Mac / Linux:** install [Docker](https://www.docker.com/products/docker-desktop/), then in this folder run:

```
docker compose up -d
```

and open http://localhost:8787 in your browser.

<details>
<summary>Run from source instead</summary>

You need Python 3.10+, Node.js 18+ and Chrome or Edge.

```
python studio/serve.py
```

The first start downloads what it needs.
</details>

## Tips

- **Ctrl+K** finds any action
- **Insert** adds figures, tables, maps and more
- **Export PDF** asks where to save

## Licence

MIT, see [LICENSE](LICENSE). Open source parts are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
