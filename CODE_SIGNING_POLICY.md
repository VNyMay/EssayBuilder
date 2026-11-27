# Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

## How releases are signed

Every Windows installer is built from the code in this repository by GitHub Actions ([release workflow](.github/workflows/release.yml)). Nothing is built on a personal computer. A release is signed only after an approver checks it and approves the signing request.

## Team roles

- Committers and reviewers: [VNyMay](https://github.com/VNyMay)
- Approvers: [VNyMay](https://github.com/VNyMay)

## Privacy policy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

Essay Builder connects to the internet only for these things:

- **Updates.** It asks GitHub whether a newer version exists, at most every 6 hours. It downloads the new version only when you press Update.
- **Fonts.** The first time an essay uses a font that is not on the computer, it downloads that font from Fontsource.
- **Sources.** When you paste a DOI, ISBN or link to add a source, it looks that source up (Crossref for DOIs, Open Library and Google Books for ISBNs, or the page you linked).
- **Problem reports.** When you press Send on GitHub in Report a problem, your browser opens a GitHub page with the report. You can read everything in it first. Essay text is never included.

Essays are saved on your computer, or in the folder you choose (for example a OneDrive or Google Drive folder). Essay Builder has no servers and no accounts, and it collects no usage data.
