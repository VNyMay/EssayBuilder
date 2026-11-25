<p align="center"><img src="studio/logo.png" width="128" alt="Essay Builder logo"></p>

<h1 align="center">Essay Builder</h1>

<p align="center"><b>Write your essay on real pages. Get a perfect PDF.</b><br>
The cover, contents page, page numbers and word count are all done for you.</p>

Made for IB students (EE, IA, TOK), but it works for any long piece of writing.

## Get it

### Windows 10 / 11

Download `EssayBuilder-Setup.exe` from [Releases](../../releases), run it, and you're done. 🎉

### Mac / Linux

Open Terminal, paste this line and press Enter:

```
curl -fsSL https://raw.githubusercontent.com/VNyMay/EssayBuilder/main/install.sh | bash
```

That's it. It downloads everything else it needs by itself. If Google Chrome isn't installed yet, it shows the one command that installs it (or offers to run it for you), waits until Chrome is there, then carries on. It adds **Essay Builder** to your Applications (Mac) or apps menu (Linux), with an icon on your Desktop. The first start takes a few minutes; after that it opens in seconds. Run the same line again any time to update.

<details>
<summary>Other ways to run it</summary>

**From a downloaded copy:** run `bash install.sh` inside the folder.

**Docker:** run `docker compose up -d` in the folder, then open http://localhost:8787.

**By hand:** with Python 3.10+, Node.js 18+ and Chrome or Edge installed, run `python3 studio/serve.py`.
</details>

## First steps

The first time you open Essay Builder, you pick a look and a short tour shows you around. A few things worth knowing:

- **Insert** adds tables, charts, maps, equations and lots more. Not sure what something is? Press **? Help** and tap any block to see a real example, what it's for and how to use it.
- **Point between two blocks** and press **+** to add something exactly there.
- **Drag on an empty spot** to select several blocks at once.
- **Hover a page** to add a new one, duplicate it or drag it somewhere else.
- **Ctrl+K** finds any action, so you never have to hunt through menus.
- **Export PDF** saves your finished essay wherever you like.

## Stuck? Ask an AI 🤖

Upload the file `AI Prompt.txt` to any AI chat (ChatGPT, Claude, Gemini…) and ask it anything about Essay Builder. It knows every feature, so it can explain how something works, or even turn your notes into a ready-to-open essay file for you.

## Licence

MIT, see [LICENSE](LICENSE). The open source parts we use are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
