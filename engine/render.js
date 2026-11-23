const fs = require('fs');
const path = require('path');
const katex = require('katex');
require('katex/dist/contrib/mhchem.js');

const { pathToFileURL } = require('url');

function renderFile(input, output, mode, pagesFile) {
let html = fs.readFileSync(input, 'utf8');
const pages = (mode === 'final' || mode === 'both') && fs.existsSync(pagesFile)
  ? JSON.parse(fs.readFileSync(pagesFile, 'utf8'))
  : {};
const latexNumbers = /<meta name="numbers" content="latex"/.test(html);

let heading = 0;
html = html.replace(/<h([12])(\s[^>]*)?>/g, (tag, level, attrs = '') => {
  heading += 1;
  return /\sid="/.test(attrs) ? tag : `<h${level} id="section-${heading}"${attrs}>`;
});

const entries = [];
html.replace(/<h([12])[^>]*\sid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g, (_, level, id, inner) => {
  if (id === 'contents') return;
  const match = inner.match(/^<span class="num">([^<]*)<\/span>([\s\S]*)$/);
  entries.push({
    level,
    id,
    num: match ? match[1] : '',
    title: (match ? match[2] : inner).trim(),
  });
});

const start = entries.length && pages[entries[0].id] !== undefined ? pages[entries[0].id] : 1;
const continuous = /<meta name="page-numbering" content="continuous"/.test(html);
const pageOf = (id) => (pages[id] === undefined ? '00' : continuous ? pages[id] : pages[id] - start + 1);

const toc = entries
  .map((e) => {
    const cls = e.level === '1' ? 'l1 b' : 'l2';
    return `<a class="${cls}" href="#${e.id}"><span class="n">${e.num}</span>`
      + `<span class="t">${e.title}</span><span class="dots"></span>`
      + `<span class="pg">${pageOf(e.id)}</span></a>`;
  })
  .join('\n');
html = html.replace('<!--TOC-->', `<nav class="toc">\n${toc}\n</nav>`);

html = html.replace(/@PG:([\w-]+)@/g, (_, id) => pageOf(id));

if (mode === 'probe' || mode === 'both') {
  html = html.replace(/<h([12])[^>]*\sid="([^"]+)"[^>]*>/g, (tag, _, id) => `${tag}<span class="probe">@@${id}@@</span>`);
  html = html.replace(/<figure\b[^>]*\sid="((?:fig|tbl)-[\w-]+)"[^>]*>/g, (tag, id) => `${tag}<span class="probe">@@${id}@@</span>`);
  html = html.replace(/<sup class="fnr" data-n="(\d+)">/g, (tag, n) => `${tag}<span class="probe">@@FN${n}@@</span>`);
}

const VOID = new Set(['img', 'br', 'hr', 'meta', 'link', 'col', 'source', 'input', 'wbr']);
const BOLD = new Set(['h1', 'h2', 'h3', 'h4', 'strong', 'b', 'th']);
const ITALIC = new Set(['em', 'i']);
const SKIP = new Set(['head', 'style', 'script', 'pre', 'code', 'svg']);
const NUMBER = '(?<![\\w.#&\\\\-])(\\d+(?:\\.\\d+)?)(?=(?:st|nd|rd|th)\\b|[^\\w]|$)';
const MATH = new RegExp(
  `\\$\\$([\\s\\S]+?)\\$\\$|([(\\[]?)(?:\\$([^$]+?)\\$${latexNumbers ? `|${NUMBER}` : '()'})([.,;:!?)\\]]*)`,
  'g',
);

let count = 0;
const AsciiMath = require('asciimath2tex');

const ascii = new (AsciiMath.default || AsciiMath)();
const PLAIN = '\uE000';
const UNICODE = {
  '²': '^2', '³': '^3', '¹': '^1', '⁰': '^0', '⁴': '^4', '⁵': '^5', '⁶': '^6', '⁷': '^7', '⁸': '^8', '⁹': '^9',
  '√': ' sqrt ', '×': ' xx ', '÷': ' -: ', '≤': ' <= ', '≥': ' >= ', '≠': ' != ', '∞': ' oo ', '±': ' +- ',
  '→': ' -> ', '⇒': ' => ', '·': ' * ', '−': '-', '∑': ' sum ', '∫': ' int ', '∈': ' in ', '∉': ' !in ',
  '⊂': ' subset ', '∪': ' cup ', '∩': ' cap ', '≈': ' ~~ ', '°': '^@',
};
const RELATIONS = ['\\le', '\\ge', '\\ne', '\\approx', '\\equiv', '\\sim', '\\to', '\\Rightarrow', '\\in', '='];

const decode = (text) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

function relationAt(tex) {
  let depth = 0;
  for (let i = 0; i < tex.length; i += 1) {
    const c = tex[i];
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (depth === 0) {
      const hit = RELATIONS.find((r) => tex.startsWith(r, i) && !/[A-Za-z]/.test(tex[i + r.length] || ''));
      if (hit) return i;
    }
  }
  return -1;
}

function fromPlain(source) {
  const lines = decode(source)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ascii.parse(line.replace(/[²³¹⁰⁴⁵⁶⁷⁸⁹√×÷≤≥≠∞±→⇒·−∑∫∈∉⊂∪∩≈°]/g, (c) => UNICODE[c])));
  if (lines.length < 2) return lines[0] || '';
  const rows = lines.map((line) => {
    const at = relationAt(line);
    return at <= 0 ? `&${line}` : `${line.slice(0, at)}&${line.slice(at)}`;
  });
  return `\\begin{aligned}${rows.join(' \\\\[3pt] ')}\\end{aligned}`;
}

const tex = (source, display, state, number) => {
  let s = source.trim();
  if (s.startsWith(PLAIN)) s = fromPlain(s.slice(1));
  if (s.includes('\\ce{')) s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  if (number && state.italic && !state.bold) s = `\\mathit{${s}}`;
  if (state.bold) s = `\\boldsymbol{${s}}`;
  count += 1;
  return katex.renderToString(s, {
    displayMode: display,
    throwOnError: true,
    strict: 'ignore',
    output: 'html',
  });
};

const stack = [{ name: '', bold: false, italic: false, skip: false }];

const openTag = (tag) => {
  const name = tag.match(/^<([a-zA-Z0-9]+)/)[1].toLowerCase();
  if (VOID.has(name) || tag.endsWith('/>')) return;
  const classes = (tag.match(/\bclass="([^"]*)"/) || [null, ''])[1].split(/\s+/);
  const top = stack[stack.length - 1];
  stack.push({
    name,
    bold: top.bold || BOLD.has(name) || classes.includes('b'),
    italic: top.italic || ITALIC.has(name),
    skip: top.skip || SKIP.has(name) || classes.includes('nonum') || classes.includes('url'),
  });
};

const closeTag = (tag) => {
  const name = tag.slice(2, -1).trim().toLowerCase();
  for (let i = stack.length - 1; i > 0; i -= 1) {
    if (stack[i].name === name) {
      stack.length = i;
      return;
    }
  }
};

const text = (part) => {
  const state = stack[stack.length - 1];
  if (state.skip) return part;
  return part.replace(MATH, (match, display, open, inline, number, close) => {
    if (display !== undefined) return tex(display, true, state, false);
    if (inline === undefined && !number) return match;
    const math = inline !== undefined ? tex(inline, false, state, false) : tex(number, false, state, true);
    return open || close ? `<span class="nw">${open}${math}${close}</span>` : math;
  });
};

html = html
  .split(/(<[^>]+>)/)
  .map((part) => {
    if (!part.startsWith('<')) return text(part);
    if (part.startsWith('</')) closeTag(part);
    else if (/^<[a-zA-Z]/.test(part)) openTag(part);
    return part;
  })
  .join('');

const dist = path.join(__dirname, 'node_modules', 'katex', 'dist');
const css = fs
  .readFileSync(path.join(dist, 'katex.min.css'), 'utf8')
  .replace(/,url\(fonts\/[^)]+\.(?:woff|ttf)\) format\("(?:woff|truetype)"\)/g, '')
  .replace(/url\(fonts\/([^)]+\.woff2)\)/g, (_, font) => {
    if (mode === 'both') return `url(${pathToFileURL(path.join(dist, 'fonts', font)).href})`;
    const data = fs.readFileSync(path.join(dist, 'fonts', font)).toString('base64');
    return `url(data:font/woff2;base64,${data})`;
  });
const quiet = mode === 'both' ? '<style>.probe{color:transparent !important;position:absolute;font-size:1px;line-height:0;white-space:nowrap}</style>' : '';
html = html.replace('</head>', `<style>${css}</style>\n<style>.katex{font-size:1.06em}</style>${quiet}\n</head>`);

fs.writeFileSync(output, html);
return `${mode}: ${entries.length} headings, ${count} formulas`;
}

module.exports = { renderFile };

if (require.main === module) {
  const [input, output, mode, pagesFile] = process.argv.slice(2);
  console.log(renderFile(input, output, mode, pagesFile));
}
