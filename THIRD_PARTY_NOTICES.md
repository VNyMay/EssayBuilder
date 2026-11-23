# Third-party software

Essay Builder uses these open source projects. Each keeps its own licence.

| Project | Used for | Licence |
|---|---|---|
| PyMuPDF | reading and stamping PDFs | AGPL-3.0 (or a commercial licence from Artifex) |
| Pillow | images | HPND |
| pywebview, pythonnet | the native app window on Windows (uses Microsoft Edge WebView2) | BSD-3-Clause, MIT |
| RDKit (@rdkit/rdkit) | molecule drawings | BSD-3-Clause |
| Pygments | code highlighting | BSD-2-Clause |
| openpyxl | .xlsx tables | MIT |
| websockets | talking to the headless browser | BSD-3-Clause |
| KaTeX | maths | MIT |
| asciimath2tex | plain-text maths | MIT |
| Mermaid | diagrams | MIT |
| d3-geo, d3-geo-projection, d3-array, d3-scale-chromatic | maps | ISC / BSD-3-Clause |
| topojson-client | maps | ISC |
| world-atlas, us-atlas | country and state outlines | ISC (data from Natural Earth, public domain, and the US Census Bureau) |
| abcjs | sheet music | MIT |
| smiles-drawer | molecule drawings | MIT |
| Lucide | interface icons (`studio/icons.js`) | ISC |
| Fontsource packages | fonts downloaded on demand | the font licences, mostly SIL OFL 1.1 |
| Chromium / Chrome / Edge | turning pages into PDFs (not included) | their own licences |

Map data credits: OpenStreetMap contributors (ODbL), OpenTopoMap (CC-BY-SA), CARTO, geoBoundaries (CC BY 4.0), GeoNames (CC BY 4.0).

The Windows installer bundles Python (PSF licence), Node.js (MIT) and PyMuPDF. If you distribute it, the AGPL terms of PyMuPDF apply to that distribution: keep this notice and make the source of Essay Builder available.
