const PROSE_KINDS = new Set(['columns', 'abstract', 'tip', 'warning', 'info', 'important', 'box', 'note', 'proof', 'question', 'definition', 'theorem', 'lemma', 'proposition', 'corollary', 'example', 'remark']);
const LINE_KINDS = new Set(['glossary']);
const PROSE_UNSAFE = /^\s*([-*+]\s|\d+[.)]\s|#|\||:::|\$\$|```|>|!\[)/;
const LEAD_WORDS = {
  definition: 'Definition',
  theorem: 'Theorem',
  lemma: 'Lemma',
  proposition: 'Proposition',
  corollary: 'Corollary',
  example: 'Example',
  remark: 'Remark',
  note: 'Note.',
  proof: 'Proof.',
  tip: 'Tip',
  warning: 'Warning',
  info: 'Info',
  important: 'Important',
  abstract: 'Abstract',
};
const BOXED = new Set(['tip', 'warning', 'info', 'important', 'abstract']);

function proseModel(range) {
  if (!range || !(PROSE_KINDS.has(range.kind) || LINE_KINDS.has(range.kind))) return null;
  const model = S.panel && S.panel.range === range ? S.panel.model : parseBlock(range.kind, linesOf(range));
  if (!model || model.kind === 'raw') return null;
  if (model.body.some((item) => PROSE_UNSAFE.test(item))) return null;
  if (LINE_KINDS.has(range.kind) && model.body.some((item) => /^\s/.test(item) && item.trim())) return null;
  return model;
}

function isProse(range) {
  return Boolean(proseModel(range));
}

function proseText(model, byLine) {
  if (byLine) return model.body.filter((item) => item.trim()).join(BREAK);
  return model.body
    .join('\n')
    .replace(/\n\s*\n/g, BREAK + BREAK)
    .replace(/\\\\\n/g, BREAK)
    .replace(/\n/g, ' ');
}

function proseLines(el, byLine) {
  const md = bodyMd(el);
  if (byLine) return md.split(/\\\\\n|\n/).map((item) => item.trimEnd()).filter((item) => item.trim());
  return md.replace(/(?:\\\\\n){2,}/g, '\n\n').split('\n');
}

function proseLead(range, model) {
  const word = LEAD_WORDS[range.kind];
  if (!word) return null;
  const lead = h('span', { class: `rich-lead${BOXED.has(range.kind) ? ' block' : ''}`, contenteditable: 'false' });
  if (range.kind === 'abstract') lead.textContent = rowGet(model, 'title') || model.args || word;
  else if (BOXED.has(range.kind)) lead.textContent = model.args || word;
  else if (/\.$/.test(word)) lead.textContent = word;
  else {
    const count = S.ranges.filter((item) => item.kind === range.kind && item.start <= range.start).length;
    const title = (model.args || '').replace(/\s*\{[^{}]*\}\s*$/, '').trim();
    lead.append(h('b', { text: `${word} ${count}` }), h('span', { class: 'lead-title', text: title ? ` (${title}).` : '.' }));
  }
  return lead;
}

function proseColumns(ta, range, model) {
  if (range.kind !== 'columns') {
    ta.style.columnCount = '';
    ta.style.columnGap = '';
    ta.style.columnRule = '';
    return;
  }
  const given = String(model.args || '').trim();
  const count = /^\d$/.test(given) ? Number(given) : Number(rowGet(model, 'count')) || 2;
  const gap = String(rowGet(model, 'gap') || '8mm').trim();
  const size = parseFloat(gap) || 8;
  const points = /pt$/.test(gap) ? size : /cm$/.test(gap) ? size * 28.35 : /in$/.test(gap) ? size * 72 : size * 2.835;
  const rule = String(rowGet(model, 'rule') || 'no').toLowerCase();
  ta.style.columnCount = String(Math.min(Math.max(count, 2), 4));
  ta.style.columnGap = `${points * S.scale}px`;
  ta.style.columnRule = ['no', 'false', 'off', 'none', ''].includes(rule) ? '' : `1px solid ${['yes', 'true', 'on'].includes(rule) ? '#8a8a84' : rule}`;
}

function proseHint() {
  return h('div', { class: 'data-hint', html: `${icon('paragraph', 15)}<span>Type on the page</span>` });
}

const END_WORDS = ['references', 'bibliography', 'works cited', 'sources', 'appendix', 'appendices'];
const FRONT_WORDS = new Set(['abstract', 'acknowledgements', 'acknowledgments', 'preface', 'declaration', 'foreword', 'contents']);
const PAPER = new Map();

function headingNumber(range) {
  if (/^(no|off|false)$/i.test(String(S.settings['heading-numbers'] || 'yes').trim())) return '';
  let h1 = 0;
  let h2 = 0;
  let on = false;
  for (const item of S.ranges) {
    if (item.kind !== 'heading') continue;
    const match = (linesOf(item)[0] || '').match(/^(#{1,3})\s+(.*)$/);
    if (!match) continue;
    const level = match[1].length;
    const tail = match[2].match(/(?<!\])\s*\{([^{}]*)\}\s*$/);
    const off = /(^|\s)(nonumber|unnumbered)(\s|$)/.test(tail ? tail[1] : '');
    const title = (tail ? match[2].slice(0, tail.index) : match[2]).replace(/[*_`[\]]/g, '').trim().toLowerCase();
    let number = '';
    if (level === 1) {
      on = !END_WORDS.some((word) => title.startsWith(word)) && !FRONT_WORDS.has(title) && !off;
      if (on) {
        h1 += 1;
        h2 = 0;
        number = String(h1);
      }
    } else if (level === 2 && on && !off) {
      h2 += 1;
      number = `${h1}.${h2}`;
    }
    if (item === range) return number;
  }
  return '';
}

function paperCanvas(index) {
  const div = $('#pages').children[index];
  const img = div && div.querySelector('img');
  if (!img || !img.complete || !img.naturalWidth) return null;
  let entry = PAPER.get(img.src);
  if (!entry) {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    entry = { ctx, w: canvas.width, h: canvas.height };
    if (PAPER.size > 6) PAPER.clear();
    PAPER.set(img.src, entry);
  }
  return entry;
}

function paperPixel(entry, page, x, y) {
  const data = entry.ctx.getImageData(Math.round((x * entry.w) / page.w), Math.round((y * entry.h) / page.h), 1, 1).data;
  return { rgb: `rgb(${data[0]} ${data[1]} ${data[2]})`, light: data[0] + data[1] + data[2] };
}

function paperLook(span) {
  const page = S.pages[span.page];
  const entry = page && paperCanvas(span.page);
  if (!entry) return { bg: '#fff', edge: '' };
  const inner = page.w - 2 * marginPt();
  const y = span.y0 + 2.5;
  const bg = [0.35, 0.65, 0.92].map((part) => paperPixel(entry, page, marginPt() + inner * part, y)).sort((a, b) => b.light - a.light)[0];
  const fill = bg.light > 600 ? bg : { rgb: '#fff', light: 765 };
  const mid = span.y0 + Math.min((span.y1 - span.y0) / 2, 20);
  const edge = [0.4, 1, 1.6].map((step) => paperPixel(entry, page, marginPt() + step, mid)).sort((a, b) => a.light - b.light)[0];
  return { bg: fill.rgb, edge: fill.light - edge.light > 60 ? edge.rgb : '' };
}
