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
  let text = word;
  if (range.kind === 'abstract') text = rowGet(model, 'title') || model.args || word;
  else if (BOXED.has(range.kind)) text = model.args || word;
  else if (!/\.$/.test(word)) text = `${word}${model.args ? ` (${model.args.replace(/\s*\{[^{}]*\}\s*$/, '')})` : ''}.`;
  return h('span', { class: `rich-lead${BOXED.has(range.kind) ? ' block' : ''}`, contenteditable: 'false', text });
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
