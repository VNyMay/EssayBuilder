const REF_KINDS = 'fig|tbl|eq|code|sec|def|thm|lem|prop|cor|ex|rem';
const UNICODE_MATH = {
  '²': '^2', '³': '^3', '¹': '^1', '⁰': '^0', '⁴': '^4', '⁵': '^5', '⁶': '^6', '⁷': '^7', '⁸': '^8', '⁹': '^9',
  '√': ' sqrt ', '×': ' xx ', '÷': ' -: ', '≤': ' <= ', '≥': ' >= ', '≠': ' != ', '∞': ' oo ', '±': ' +- ',
  '→': ' -> ', '⇒': ' => ', '·': ' * ', '−': '-', '∑': ' sum ', '∫': ' int ', '∈': ' in ', '∉': ' !in ',
  '⊂': ' subset ', '∪': ' cup ', '∩': ' cap ', '≈': ' ~~ ', '°': '^@',
};
const SPECIAL_CHARS = /[\\*$[\]`]/g;
const INLINE_MIME = 'application/x-essay-inline';
const BREAK =' ';
const NAMED_SIZES = { tiny: '0.7em', small: '0.85em', large: '1.25em', xl: '1.6em', xxl: '2.2em', huge: '3em' };

let savedRange = null;
let chipPop = null;

function plainToTex(source) {
  const text = source.replace(/[²³¹⁰⁴⁵⁶⁷⁸⁹√×÷≤≥≠∞±→⇒·−∑∫∈∉⊂∪∩≈°]/g, (c) => UNICODE_MATH[c]);
  return new window.AsciiMath().parse(text);
}

function mathHtml(source) {
  const clean = source.trim();
  const plain = !/\\[A-Za-z\\{}[\],;:!|]|[\^_]\{/.test(clean);
  try {
    return window.katex.renderToString(plain ? plainToTex(clean) : clean, { throwOnError: false, output: 'html' });
  } catch (error) {
    return null;
  }
}

function fmtStyle(list) {
  const css = [];
  const decorations = [];
  list.forEach((item) => {
    if (item.flag) {
      if (item.flag === 'underline') decorations.push('underline');
      else if (item.flag === 'strike') decorations.push('line-through');
      else if (item.flag === 'sup') css.push('vertical-align:super;font-size:0.75em');
      else if (item.flag === 'sub') css.push('vertical-align:sub;font-size:0.75em');
      else if (item.flag === 'caps') css.push('text-transform:uppercase');
      else if (item.flag === 'smallcaps') css.push('font-variant:small-caps');
      else if (item.flag === 'highlight') css.push('background-color:#fff3a3');
      else if (item.flag === 'bold') css.push('font-weight:700');
      else if (item.flag === 'italic') css.push('font-style:italic');
      return;
    }
    const value = item.value;
    if (item.key === 'size') css.push(NAMED_SIZES[value] ? `font-size:${NAMED_SIZES[value]}` : /^[\d.]+$/.test(value) ? `font-size:calc(${value} * var(--pt))` : `font-size:${value}`);
    else if (item.key === 'font') css.push(`font-family:"${value}",inherit`);
    else if (item.key === 'color') css.push(`color:${value === 'accent' ? 'var(--green)' : value}`);
    else if (item.key === 'bg' || item.key === 'highlight') css.push(`background-color:${value}`);
    else if (item.key === 'spacing') css.push(`letter-spacing:${/^[\d.]+$/.test(value) ? `${value}pt` : value}`);
    else if (item.key === 'weight') css.push(`font-weight:${value}`);
  });
  if (decorations.length) css.push(`text-decoration:${decorations.join(' ')}`);
  return css.join(';');
}

function chip(kind, source, label) {
  const node = document.createElement('span');
  node.className = `chip ${kind}`;
  node.contentEditable = 'false';
  node.dataset.src = source;
  if (kind === 'math') {
    const html = mathHtml(source.replace(/^\$+|\$+$/g, ''));
    if (html) node.innerHTML = html;
    else node.textContent = label;
  } else node.textContent = label;
  return node;
}

function inlineNodes(text) {
  const frag = document.createDocumentFragment();
  let buffer = '';
  let i = 0;
  const flush = () => {
    if (buffer) frag.append(document.createTextNode(buffer));
    buffer = '';
  };
  while (i < text.length) {
    const rest = text.slice(i);
    let m;
    if (text[i] === '\\' && i + 1 < text.length) {
      buffer += text[i + 1];
      i += 2;
    } else if (text[i] === BREAK) {
      flush();
      frag.append(document.createElement('br'));
      i += 1;
    } else if ((m = rest.match(/^\$(?!\s)([^$\n]+?)(?<!\s)\$/))) {
      flush();
      frag.append(chip('math', m[0], m[1]));
      i += m[0].length;
    } else if ((m = rest.match(/^\[\^([\w-]+)\]/))) {
      flush();
      frag.append(chip('note', m[0], '†'));
      i += m[0].length;
    } else if ((m = rest.match(/^\^\[([^\]]*)\]/))) {
      flush();
      frag.append(chip('note', m[0], '\u2020'));
      i += m[0].length;
    } else if ((m = rest.match(/^`([^`]+)`/))) {
      flush();
      const code = document.createElement('code');
      code.textContent = m[1];
      frag.append(code);
      i += m[0].length;
    } else if ((m = rest.match(/^\[(-?@[^\]]+)\](?![({])/))) {
      flush();
      frag.append(chip('cite', m[0], S.cites && S.cites[m[1]] ? S.cites[m[1]] : `(${m[1].replace(/^-?@/, '')})`));
      i += m[0].length;
    } else if ((m = rest.match(/^\[([^\]]*)\]\{([^{}]*)\}/))) {
      flush();
      const span = document.createElement('span');
      span.className = 'fmt';
      span.dataset.attrs = m[2];
      span.style.cssText = fmtStyle(attrList(m[2]));
      span.append(inlineNodes(m[1]));
      frag.append(span);
      i += m[0].length;
    } else if ((m = rest.match(/^\[([^\]]*)\]\(([^)\s]+)\)/))) {
      flush();
      const link = document.createElement('span');
      link.className = 'rlink';
      link.dataset.url = m[2];
      link.append(inlineNodes(m[1]));
      frag.append(link);
      i += m[0].length;
    } else if ((m = rest.match(/^\*\*\*(.+?)\*\*\*/))) {
      flush();
      const strong = document.createElement('b');
      const em = document.createElement('i');
      em.append(inlineNodes(m[1]));
      strong.append(em);
      frag.append(strong);
      i += m[0].length;
    } else if ((m = rest.match(/^\*\*(.+?)\*\*/))) {
      flush();
      const strong = document.createElement('b');
      strong.append(inlineNodes(m[1]));
      frag.append(strong);
      i += m[0].length;
    } else if ((m = rest.match(/^\*(?!\s)(.+?)(?<!\s)\*/))) {
      flush();
      const em = document.createElement('i');
      em.append(inlineNodes(m[1]));
      frag.append(em);
      i += m[0].length;
    } else if ((m = rest.match(new RegExp(`^@(${REF_KINDS}):([A-Za-z][\\w-]*)`)))) {
      flush();
      const label = S.labels && S.labels[`${m[1]}:${m[2]}`];
      frag.append(chip('ref', m[0], label || `${m[1]} ${m[2]}`));
      i += m[0].length;
    } else if ((m = rest.match(/^@([A-Za-z][A-Za-z0-9_-]*\d[A-Za-z0-9_-]*)/)) && S.cites && S.cites[m[0]]) {
      flush();
      frag.append(chip('cite', m[0], S.cites[m[0]]));
      i += m[0].length;
    } else {
      buffer += text[i];
      i += 1;
    }
  }
  flush();
  return frag;
}

function escapeText(text) {
  return text.replace(/ /g, ' ').replace(SPECIAL_CHARS, (c) => `\\${c}`);
}

function wrapEmphasis(inner, mark) {
  const lead = inner.match(/^\s*/)[0];
  const trail = inner.match(/\s*$/)[0];
  const core = inner.trim();
  return core ? `${lead}${mark}${core}${mark}${trail}` : inner;
}

function styledMd(node, inner) {
  const style = node.style;
  const tag = node.tagName;
  let out = inner;
  if (!style || !out.trim()) return out;
  if (/^(bold|bolder|[6-9]00)$/.test(style.fontWeight) && tag !== 'B' && tag !== 'STRONG') out = wrapEmphasis(out, '**');
  if (style.fontStyle === 'italic' && tag !== 'I' && tag !== 'EM') out = wrapEmphasis(out, '*');
  if (/underline/.test(style.textDecorationLine || style.textDecoration || '') && tag !== 'U') out = `[${out}]{underline}`;
  return out;
}

function nodesToMd(parent) {
  let out = '';
  parent.childNodes.forEach((node) => {
    if (node.nodeType === 3) {
      out += escapeText(node.nodeValue).replace(/\r?\n/g, '\\\\\n');
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName;
    if (node.classList.contains('rich-lead')) return;
    if (node.classList.contains('chip')) {
      out += node.dataset.src;
      return;
    }
    const inner = node.classList.contains('fmt') || node.classList.contains('rlink') ? nodesToMd(node) : styledMd(node, nodesToMd(node));
    if (tag === 'BR') out += '\\\\\n';
    else if (tag === 'B' || tag === 'STRONG') out += wrapEmphasis(inner, '**');
    else if (tag === 'I' || tag === 'EM') out += wrapEmphasis(inner, '*');
    else if (tag === 'U') out += inner.trim() ? `[${inner}]{underline}` : inner;
    else if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') out += inner.trim() ? `[${inner}]{strike}` : inner;
    else if (tag === 'SUP') out += inner.trim() ? `[${inner}]{sup}` : inner;
    else if (tag === 'SUB') out += inner.trim() ? `[${inner}]{sub}` : inner;
    else if (tag === 'CODE') out += `\`${node.textContent}\``;
    else if (node.classList.contains('fmt')) out += inner.trim() && node.dataset.attrs ? `[${inner}]{${node.dataset.attrs}}` : inner;
    else if (node.classList.contains('rlink')) out += `[${inner}](${node.dataset.url})`;
    else if (tag === 'DIV' || tag === 'P') out += inner + (node.nextSibling ? '\\\\\n' : '');
    else out += inner;
  });
  return out;
}

function currentRange() {
  const { ta: el } = S.edit;
  const selection = window.getSelection();
  if (selection.rangeCount && el.contains(selection.anchorNode)) return selection.getRangeAt(0);
  return savedRange;
}

function restoreSelection() {
  const { ta: el } = S.edit;
  el.focus({ preventScroll: true });
  if (!savedRange) return;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(savedRange);
}

function bodyMd(el) {
  return nodesToMd(el).replace(/(?:\\\\\n)+$/, '').replace(/\n$/, '');
}

function commitRich() {
  if (!S.edit || !S.edit.rich) return;
  if (S.edit.cover) {
    S.edit.cover.commit();
    return;
  }
  const { ta: el, prefix, tail } = S.edit;
  if (S.edit.prose) {
    S.edit.model.body = proseLines(el, S.edit.byLine);
    setRangeLines(S.edit.range, serializeBlock(S.edit.model));
    positionEditor();
    schedule(120);
    return;
  }
  const body = S.edit.list ? listMd(el) : bodyMd(el);
  const text = S.edit.blank && !body.trim() ? ':::blank' : `${prefix}${body}${tail}`;
  setRangeLines(S.edit.range, text.split('\n'));
  positionEditor();
  schedule(120);
}

function selectWord() {
  const range = currentRange();
  if (!range) return null;
  if (!range.collapsed) return range;
  const node = range.startContainer;
  if (node.nodeType !== 3) return null;
  const [start, end] = wordRange(node.nodeValue, range.startOffset);
  if (start === end) return null;
  const word = document.createRange();
  word.setStart(node, start);
  word.setEnd(node, end);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(word);
  return word;
}

function execFormat(command) {
  const selection = window.getSelection();
  if (!(selection.rangeCount && S.edit.ta.contains(selection.anchorNode))) restoreSelection();
  const collapsed = !selection.rangeCount || selection.getRangeAt(0).collapsed;
  document.execCommand(command);
  savedRange = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : savedRange;
  if (!collapsed) commitRich();
  paintCaret();
}

function caretBox(range) {
  const rects = range.getClientRects();
  if (rects.length) return rects[rects.length - 1];
  const node = range.startContainer;
  const offset = range.startOffset;
  if (node.nodeType === 3 && offset > 0 && node.nodeValue[offset - 1] !== '\n') {
    const probe = document.createRange();
    probe.setStart(node, offset - 1);
    probe.setEnd(node, offset);
    const rect = probe.getBoundingClientRect();
    return { left: rect.right, top: rect.top, height: rect.height };
  }
  if (node.nodeType === 3 && offset < node.nodeValue.length && node.nodeValue[offset] !== '\n') {
    const probe = document.createRange();
    probe.setStart(node, offset);
    probe.setEnd(node, offset + 1);
    const rect = probe.getBoundingClientRect();
    return { left: rect.left, top: rect.top, height: rect.height };
  }
  return null;
}

function paintCaret() {
  let caret = document.getElementById('typeCaret');
  const el = S.edit && S.edit.rich && !S.edit.cover ? S.edit.ta : null;
  const selection = window.getSelection();
  const live = el && document.activeElement === el && selection.rangeCount && selection.getRangeAt(0).collapsed && el.contains(selection.anchorNode);
  if (!live) {
    if (caret) caret.hidden = true;
    if (el) el.classList.remove('own-caret');
    return;
  }
  if (!caret) {
    caret = h('div', { id: 'typeCaret' });
    $('#scroll').append(caret);
  }
  const box = caretBox(selection.getRangeAt(0));
  if (!box || !box.height) {
    caret.hidden = true;
    el.classList.remove('own-caret');
    return;
  }
  const bold = document.queryCommandState('bold');
  const italic = document.queryCommandState('italic');
  const underline = document.queryCommandState('underline');
  caret.hidden = false;
  caret.className = `${bold ? 'bold' : ''}${italic ? ' italic' : ''}${underline ? ' underline' : ''}`;
  caret.style.left = `${box.left}px`;
  caret.style.top = `${box.top}px`;
  caret.style.height = `${box.height}px`;
  caret.style.setProperty('--ink', getComputedStyle(el).color);
  caret.style.animation = 'none';
  void caret.offsetWidth;
  caret.style.animation = '';
  el.classList.add('own-caret');
  ['bold', 'italic', 'underline'].forEach((name, index) => {
    const button = document.querySelector(`.fmtbar .is-${name}`);
    if (button) button.classList.toggle('on', [bold, italic, underline][index]);
  });
}

function selectionEmpty() {
  restoreSelection();
  const selection = window.getSelection();
  return !selection.rangeCount || selection.getRangeAt(0).collapsed || !S.edit.ta.contains(selection.anchorNode);
}

function blockSize() {
  const edit = S.edit;
  const base = parseFloat(S.settings['font-size']) || 12;
  if (edit.range.kind === 'heading') {
    const token = headTokens().find((item) => item.startsWith('size='));
    if (token) return parseFloat(token.slice(5));
    return [20, 14, 12][Math.min(2, (edit.prefix.match(/#/g) || []).length - 1)] || base;
  }
  const line = (edit.prefix || '').split('\n').find((item) => /^size\s*:/i.test(item));
  return line ? parseFloat(line.split(':')[1]) : base;
}

function blockOption(key, value) {
  const edit = S.edit;
  if (!edit || edit.cover || !edit.range) return false;
  if (edit.prose) {
    const all = document.createRange();
    all.selectNodeContents(edit.ta);
    const lead = edit.ta.querySelector(':scope > .rich-lead');
    if (lead) all.setStartAfter(lead);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(all);
    savedRange = all.cloneRange();
    return false;
  }
  const kind = edit.range.kind;
  const shown = value && /\s/.test(value) ? `"${value}"` : value;
  if (kind === 'heading') {
    const tokens = headTokens().filter((item) => !item.startsWith(`${key}=`));
    if (value) tokens.push(`${key}=${shown}`);
    edit.tail = tokens.length ? ` {${tokens.join(' ')}}` : '';
  } else if (['para', 'text', 'blank'].includes(kind)) {
    const own = (edit.prefix || '').startsWith(':::text');
    let head = own ? edit.prefix.replace(/\n---\n$/, '').split('\n') : [':::text'];
    head = head.filter((line) => !new RegExp(`^${key}\\s*:`, 'i').test(line));
    if (value) head.push(`${key}: ${value}`);
    if (head.length === 1 && !edit.blank) {
      edit.prefix = '';
      edit.tail = '';
    } else {
      edit.prefix = `${head.join('\n')}\n---\n`;
      edit.tail = '\n:::';
    }
  } else {
    return false;
  }
  if (key === 'size') edit.ta.style.fontSize = value ? `${parseFloat(value) * S.scale}px` : '';
  if (key === 'font') edit.ta.style.fontFamily = value ? `"${value}", ${docFont()}` : '';
  commitRich();
  return true;
}

function applyFmt(edit) {
  const { ta: el } = S.edit;
  restoreSelection();
  const range = selectWord();
  if (!range) return;
  const base = range.commonAncestorContainer;
  const host = (base.nodeType === 3 ? base.parentNode : base).closest && (base.nodeType === 3 ? base.parentNode : base).closest('span.fmt');
  let target = null;
  if (host && el.contains(host) && host.textContent === range.toString()) target = host;
  if (!target) {
    target = document.createElement('span');
    target.className = 'fmt';
    target.append(range.extractContents());
    range.insertNode(target);
  }
  let list = attrList(target.dataset.attrs || '');
  target.querySelectorAll('span.fmt').forEach((inner) => {
    attrList(inner.dataset.attrs || '').forEach((item) => {
      if (!list.some((own) => (own.key && own.key === item.key) || (own.flag && own.flag === item.flag))) list.push(item);
    });
    inner.replaceWith(...inner.childNodes);
  });
  list = edit(list);
  if (!list.length) {
    const parent = target.parentNode;
    const kids = [...target.childNodes];
    target.replaceWith(...kids);
    parent.normalize();
    if (kids.length) {
      const fresh = document.createRange();
      fresh.setStartBefore(kids[0]);
      fresh.setEndAfter(kids[kids.length - 1]);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(fresh);
    }
  } else {
    target.dataset.attrs = attrString(list);
    target.style.cssText = fmtStyle(list);
    const fresh = document.createRange();
    fresh.selectNodeContents(target);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(fresh);
  }
  savedRange = window.getSelection().getRangeAt(0).cloneRange();
  commitRich();
}

function currentPoints() {
  const range = currentRange();
  if (!range) return 11;
  const node = range.startContainer.nodeType === 3 ? range.startContainer.parentNode : range.startContainer;
  const px = parseFloat(getComputedStyle(node).fontSize) || 16;
  return px / (S.scale || 1);
}

function stepSize(direction) {
  const list = SIZE_LIST.map(Number);
  if (selectionEmpty() && !S.edit.cover) {
    const current = blockSize();
    const next = direction > 0 ? list.find((size) => size > current + 0.01) : [...list].reverse().find((size) => size < current - 0.01);
    if (next) blockOption('size', String(next));
    return;
  }
  const now = currentPoints();
  let index = list.findIndex((value) => value >= now - 0.4);
  if (index < 0) index = list.length - 1;
  const exact = Math.abs(list[index] - now) < 0.6;
  const next = direction > 0 ? (exact ? Math.min(index + 1, list.length - 1) : index) : Math.max((exact ? index : index) - 1, 0);
  applyFmt((items) => setKey(items, 'size', String(list[next])));
}

function insertChip(source) {
  restoreSelection();
  const range = window.getSelection().getRangeAt(0);
  range.deleteContents();
  const node = chip('math', source, source);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  savedRange = range.cloneRange();
  commitRich();
  return node;
}

function closeChipPop() {
  if (chipPop) chipPop.remove();
  chipPop = null;
}

function openChipPop(node) {
  closeChipPop();
  const { ta: el } = S.edit;
  const box = h('div', { class: 'chip-pop' });
  if (node.classList.contains('math')) {
    const input = h('input', { type: 'text', class: 'chip-input', spellcheck: 'false' });
    input.value = node.dataset.src.replace(/^\$+|\$+$/g, '');
    const preview = h('div', { class: 'chip-preview' });
    const paint = () => {
      const html = mathHtml(input.value);
      preview.innerHTML = html || '';
    };
    input.addEventListener('input', () => {
      const html = mathHtml(input.value);
      node.dataset.src = `$${input.value}$`;
      if (html) node.innerHTML = html;
      paint();
      commitRich();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault();
        closeChipPop();
        restoreSelection();
      }
    });
    box.append(input, preview);
    paint();
    setTimeout(() => input.focus(), 0);
  }
  if (node.classList.contains('rlink')) {
    const input = h('input', { type: 'text', class: 'chip-input', spellcheck: 'false', placeholder: 'https://' });
    input.value = node.dataset.url || '';
    input.addEventListener('input', () => {
      node.dataset.url = input.value;
      commitRich();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault();
        closeChipPop();
        restoreSelection();
      }
    });
    box.append(input);
    setTimeout(() => input.focus(), 0);
  }
  if (node.classList.contains('note')) {
    const area = h('textarea', { class: 'chip-input', rows: 3, spellcheck: 'false', placeholder: 'Footnote text' });
    area.value = node.dataset.src.replace(/^\^\[|\]$/g, '');
    area.addEventListener('input', () => {
      node.dataset.src = `^[${area.value.replace(/\]/g, ')')}]`;
      commitRich();
    });
    area.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Escape') {
        event.preventDefault();
        closeChipPop();
        restoreSelection();
      }
    });
    box.append(area);
    setTimeout(() => area.focus(), 0);
  }
  box.append(h('button', { type: 'button', class: 'chip-remove', text: 'Remove', onclick: () => { node.remove(); closeChipPop(); commitRich(); } }));
  box.addEventListener('mousedown', (event) => {
    if (event.target.tagName !== 'INPUT') event.preventDefault();
  });
  el.parentNode.append(box);
  const host = el.parentNode.getBoundingClientRect();
  const rect = node.getBoundingClientRect();
  box.style.left = `${Math.max(rect.left - host.left, 4)}px`;
  box.style.top = `${rect.bottom - host.top + 8}px`;
  chipPop = box;
  spotSoon();
}

function splitParagraph() {
  const { ta: el, range, prefix, tail } = S.edit;
  const current = currentRange();
  if (!current) return false;
  const before = document.createRange();
  before.selectNodeContents(el);
  before.setEnd(current.startContainer, current.startOffset);
  const after = document.createRange();
  after.selectNodeContents(el);
  after.setStart(current.endContainer, current.endOffset);
  const holder = document.createElement('div');
  holder.append(before.cloneContents());
  const head = bodyMd(holder);
  holder.replaceChildren(after.cloneContents());
  const rest = bodyMd(holder);
  if (!head.trim()) return false;
  const lines = `${prefix}${head}${tail}`.split('\n');
  const fresh = rest.trim() ? rest : 'New paragraph.';
  const out = [...lines, '', ...fresh.split('\n')];
  S.clickAt = null;
  closeEditor(true);
  setRangeLines(range, out);
  S.pendingStart = range.start + lines.length + 1;
  S.focusNew = true;
  S.focusSelectAll = !rest.trim();
  S.caretStart = Boolean(rest.trim());
  lockHits();
  schedule(120);
  return true;
}

function caretAtStart(el) {
  const current = currentRange();
  if (!current || !current.collapsed) return false;
  const probe = document.createRange();
  probe.selectNodeContents(el);
  const lead = el.querySelector(':scope > .rich-lead');
  if (lead) probe.setStartAfter(lead);
  probe.setEnd(current.startContainer, current.startOffset);
  return !probe.toString().replace(/​/g, '').length;
}

function caretEdgeLine(el, down) {
  const current = currentRange();
  if (!current || !current.collapsed) return false;
  const rects = current.getClientRects();
  const spot = rects.length ? rects[0] : current.startContainer.nodeType === 1 ? current.startContainer.getBoundingClientRect() : null;
  if (!spot) return false;
  const box = el.getBoundingClientRect();
  const line = parseFloat(getComputedStyle(el).lineHeight) || spot.height || 20;
  return down ? spot.bottom > box.bottom - line * 0.75 : spot.top < box.top + line * 0.75;
}

function textNeighbour(range, step) {
  let index = S.ranges.indexOf(range) + step;
  while (index >= 0 && index < S.ranges.length) {
    const next = S.ranges[index];
    if ((TEXT_KINDS.has(next.kind) && next.kind !== 'blank') || isRichText(next)) return next;
    index += step;
  }
  return null;
}

function moveAcross(step) {
  const next = textNeighbour(S.edit.range, step);
  if (!next) return false;
  S.clickAt = null;
  closeEditor(true);
  S.caretStart = step > 0;
  select(next);
  scrollToRange(next);
  return true;
}

function mergeBackward() {
  const { range, prefix } = S.edit;
  if (range.kind !== 'para' || prefix) return false;
  const index = S.ranges.indexOf(range);
  const prev = S.ranges[index - 1];
  if (!prev || prev.kind !== 'para') return false;
  commitRich();
  const all = lines();
  const above = all.slice(prev.start - 1, prev.end);
  const here = all.slice(range.start - 1, range.end);
  const shown = document.createElement('div');
  shown.append(inlineNodes(above.join(' ').replace(/\\\\$/, '').trim()));
  const chars = shown.textContent.length + 1;
  const merged = [...above.slice(0, -1), `${above[above.length - 1].replace(/\s+$/, '')} ${here[0].trim()}`, ...here.slice(1)];
  S.clickAt = null;
  closeEditor(true);
  all.splice(prev.start - 1, range.end - prev.start + 1, ...merged);
  S.source = all.join('\n');
  S.pendingStart = prev.start;
  S.focusNew = true;
  S.focusSelectAll = false;
  S.caretChars = chars;
  lockHits();
  schedule(120);
  return true;
}

function caretToChar(el, count) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let left = count;
  let node = walker.nextNode();
  while (node) {
    if (!node.parentElement.closest('.rich-lead, .chip')) {
      if (node.nodeValue.length >= left) {
        const spot = document.createRange();
        spot.setStart(node, left);
        spot.collapse(true);
        return spot;
      }
      left -= node.nodeValue.length;
    }
    node = walker.nextNode();
  }
  return null;
}

function mountRichBar() {
  const { ta: el } = S.edit;
  const keep = (node) => {
    node.addEventListener('mousedown', (event) => {
      if (event.target.tagName !== 'INPUT') event.preventDefault();
    });
    return node;
  };
  const tool = (label, title, action, extra = '') => keep(h('button', { type: 'button', class: `fmt-btn ${extra}`.trim(), html: label, title, onclick: action }));
  const size = dropdown({
    choices: [...SIZE_LIST.map((v) => ({ value: v, label: v })), { value: '', label: 'Normal size' }],
    value: '',
    label: 'Size',
    keep: true,
    className: 'fmt-drop',
    onPick: (value) => {
      if (selectionEmpty() && blockOption('size', value)) return;
      applyFmt((list) => setKey(list, 'size', value || null));
    },
  });
  const font = fontPicker('', (value) => {
    if (selectionEmpty() && blockOption('font', value)) return;
    restoreSelection();
    applyFmt((list) => setKey(list, 'font', value || null));
  }, { keep: true, className: 'fmt-drop wide', empty: 'Font' });
  [size, font].forEach(keep);
  const colorBtn = tool('<span class="aa">A</span><i class="bar-color"></i>', 'Text colour', () => swatchMenu(colorBtn, TEXT_COLORS, (color) => applyFmt((list) => setKey(list, 'color', color)), 'Default'));
  const markBtn = tool(icon('highlight', 17), 'Highlight', () => swatchMenu(markBtn, HIGHLIGHTS, (color) => applyFmt((list) => setKey(list.filter((item) => item.flag !== 'highlight'), 'bg', color)), 'None'));
  const mathBtn = tool('Σ', 'Equation (Ctrl+M)', () => richMathPalette(mathBtn), 'math');
  const bar = h('div', { class: 'fmtbar' });
  bar.append(
    tool('<b>B</b>', 'Bold (Ctrl+B)', () => execFormat('bold'), 'is-bold'),
    tool('<i>I</i>', 'Italic (Ctrl+I)', () => execFormat('italic'), 'is-italic'),
    tool('<u>U</u>', 'Underline (Ctrl+U)', () => execFormat('underline'), 'is-underline'),
    tool('<s>S</s>', 'Strikethrough (Ctrl+Shift+X)', () => execFormat('strikeThrough')),
    tool('x<sup>2</sup>', 'Superscript (Ctrl+Shift+=)', () => execFormat('superscript')),
    tool('x<sub>2</sub>', 'Subscript (Ctrl+=)', () => execFormat('subscript')),
    h('span', { class: 'fmt-sep' }),
    size,
    font,
    colorBtn,
    markBtn,
    h('span', { class: 'fmt-sep' }),
    mathBtn,
    tool('Aa', 'Clear formatting (Ctrl+Space)', () => {
      restoreSelection();
      selectWord();
      document.execCommand('removeFormat');
      applyFmt(() => []);
    }),
    h('span', { class: 'fmt-sep para-only' }),
    tool(icon('alignLeft', 16), 'Align left (Ctrl+L)', () => setAlign('left'), 'para-only'),
    tool(icon('alignCenter', 16), 'Centre (Ctrl+E)', () => setAlign('center'), 'para-only'),
    tool(icon('alignRight', 16), 'Align right (Ctrl+R)', () => setAlign('right'), 'para-only'),
    tool(icon('alignJustify', 16), 'Justify (Ctrl+J)', () => setAlign('justify'), 'para-only'),
    h('span', { class: 'fmt-sep para-only' }),
    tool(icon('list', 16), 'Bullet list (type - and a space)', () => toggleList(false), 'is-bullets para-only'),
    tool('<span class="num-glyph">1.</span>', 'Numbered list (type 1. and a space)', () => toggleList(true), 'is-numbers para-only'),
    h('span', { class: 'fmt-sep' }),
    tool(icon('up', 16), 'Move up', () => move(-1)),
    tool(icon('down', 16), 'Move down', () => move(1)),
    tool(icon('copy', 16), 'Duplicate', () => duplicate()),
    tool(icon('trash', 16), 'Delete', () => remove(S.sel), 'danger'),
  );
  if (S.edit.cover) [...bar.children].slice(-5).forEach((node) => node.remove());
  if (S.edit.prose) bar.querySelectorAll('.para-only').forEach((node) => node.remove());
  if (S.edit.range && S.edit.range.kind === 'heading') bar.prepend(headingTools(tool), h('span', { class: 'fmt-sep' }));
  S.edit.bar = bar;
  el.parentNode.append(bar);
  placeFormatBar();
}

function headTokens() {
  const match = (S.edit.tail || '').match(/\{([^{}]*)\}/);
  return match ? match[1].trim().split(/\s+/).filter(Boolean) : [];
}

function headingTools(tool) {
  const level = () => Math.min(3, (S.edit.prefix.match(/#/g) || []).length || 1);
  const box = h('span', { class: 'head-tools' });
  const write = (tokens) => {
    S.edit.tail = tokens.length ? ` {${tokens.join(' ')}}` : '';
    commitRich();
    paint();
  };
  const toggle = (name) => {
    const tokens = headTokens();
    write(tokens.includes(name) ? tokens.filter((item) => item !== name) : [...tokens, name]);
  };
  const levels = ['Section heading', 'Sub-heading', 'Minor heading'].map((title, index) => tool(`H${index + 1}`, title, () => {
    S.edit.prefix = `${'#'.repeat(index + 1)} `;
    commitRich();
    paint();
  }, 'lvl'));
  const number = tool('#', 'Numbered', () => toggle('nonumber'), 'flag');
  const page = tool(icon('newFile', 15), 'Starts on a new page', () => toggle('samepage'), 'flag');
  const toc = tool(icon('list', 15), 'Shown in Contents', () => toggle('notoc'), 'flag');
  const paint = () => {
    const tokens = headTokens();
    levels.forEach((button, index) => button.classList.toggle('on', level() === index + 1));
    number.classList.toggle('on', !tokens.includes('nonumber'));
    page.classList.toggle('on', !tokens.includes('samepage'));
    toc.classList.toggle('on', !tokens.includes('notoc'));
    number.hidden = level() === 3;
    page.hidden = level() !== 1;
    toc.hidden = level() === 3;
  };
  box.append(...levels, h('span', { class: 'fmt-sep' }), number, page, toc);
  paint();
  return box;
}

function richMathPalette(anchor) {
  closeMenu();
  const node = h('div', { class: 'menu mathpal' });
  MATH_ITEMS.forEach(([label, snippet]) => {
    node.append(
      h('button', {
        type: 'button',
        text: label,
        title: snippet,
        onclick: () => {
          closeMenu();
          const made = insertChip(`$${snippet}$`);
          openChipPop(made);
        },
      }),
    );
  });
  node.addEventListener('mousedown', (event) => event.preventDefault());
  document.body.append(node);
  const k = UI.size;
  const rect = anchor.getBoundingClientRect();
  node.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 360)) / k}px`;
  node.style.top = `${(rect.bottom + 8) / k}px`;
  openMenu = { node, button: anchor };
}

function richKeys(event) {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key;
  const lower = key.toLowerCase();
  if (S.inline) return inlineKey(event);
  if (S.edit && S.edit.cover && ((key === 'Enter' && mod) || key === '/' || event.altKey)) return;
  if (key === '@' && !mod) {
    event.preventDefault();
    return openInline();
  }
  if (S.edit && S.edit.list && !mod && (key === 'Tab' || key === 'Enter') && listKeys(event)) return;
  const plain = S.edit && !S.edit.cover && !S.edit.prose && !S.edit.list;
  if (key === 'Enter') {
    event.preventDefault();
    if (plain && !event.shiftKey && !mod && splitParagraph()) return;
    document.execCommand('insertLineBreak');
  } else if (key === 'Backspace' && plain && !mod && !event.shiftKey && caretAtStart(S.edit.ta) && mergeBackward()) {
    event.preventDefault();
  } else if ((key === 'ArrowDown' || key === 'ArrowUp') && plain && !mod && !event.shiftKey && !event.altKey && caretEdgeLine(S.edit.ta, key === 'ArrowDown') && moveAcross(key === 'ArrowDown' ? 1 : -1)) {
    event.preventDefault();
  } else if (key === '/' && !mod && !event.shiftKey && !S.edit.prose && (!S.edit.ta.textContent.trim() || window.getSelection().toString() === S.edit.ta.textContent)) {
    event.preventDefault();
    openSlash();
  } else if (event.altKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
    event.preventDefault();
    move(key === 'ArrowUp' ? -1 : 1);
  } else if (key === 'Escape') {
    event.preventDefault();
    closeEditor();
  } else if (mod && !event.shiftKey && lower === 'b') {
    event.preventDefault();
    execFormat('bold');
  } else if (mod && !event.shiftKey && lower === 'i') {
    event.preventDefault();
    execFormat('italic');
  } else if (mod && !event.shiftKey && lower === 'u') {
    event.preventDefault();
    execFormat('underline');
  } else if (mod && event.shiftKey && lower === 'x') {
    event.preventDefault();
    execFormat('strikeThrough');
  } else if (mod && event.shiftKey && (key === '+' || key === '=')) {
    event.preventDefault();
    execFormat('superscript');
  } else if (mod && !event.shiftKey && key === '=') {
    event.preventDefault();
    execFormat('subscript');
  } else if (mod && (((key === '>' || key === '.' || event.code === 'Period') && event.shiftKey) || key === ']')) {
    event.preventDefault();
    stepSize(1);
  } else if (mod && (((key === '<' || key === ',' || event.code === 'Comma') && event.shiftKey) || key === '[')) {
    event.preventDefault();
    stepSize(-1);
  } else if (!mod && event.shiftKey && (key === '>' || key === '<') && window.getSelection().toString()) {
    event.preventDefault();
    stepSize(key === '>' ? 1 : -1);
  } else if (mod && !event.shiftKey && ['l', 'e', 'r', 'j'].includes(lower)) {
    event.preventDefault();
    setAlign({ l: 'left', e: 'center', r: 'right', j: 'justify' }[lower]);
  } else if (mod && lower === 'm') {
    event.preventDefault();
    richMathPalette(S.edit.bar.querySelector('.math'));
  } else if (mod && key === ' ') {
    event.preventDefault();
    applyFmt(() => []);
  }
}

function textParts(range) {
  if (range.kind !== 'text') return null;
  const all = linesOf(range);
  const split = all.findIndex((line) => line.trim() === '---');
  if (!/^:::\s*text\b/i.test(all[0]) || all[all.length - 1].trim() !== ':::' || split < 1) return null;
  const inner = all.slice(split + 1, -1);
  if (!inner.length || inner.some((line) => !line.trim())) return null;
  return { head: all.slice(0, split), inner };
}

function isRichText(range) {
  return Boolean(textParts(range));
}

function openRich(range, selectAll) {
  const parts = textParts(range);
  const lines = range.kind === 'blank' ? [''] : parts ? parts.inner : linesOf(range);
  const blank = range.kind === 'blank' || Boolean(parts && parts.head.some((line) => /^page:\s*(new|yes|true)\s*$/i.test(line.trim())));
  let prefix = range.kind === 'blank' ? ':::text\npage: yes\n---\n' : parts ? `${parts.head.join('\n')}\n---\n` : '';
  let tail = range.kind === 'blank' || parts ? '\n:::' : '';
  let body = lines.join('\n').replace(/\\\\\n/g, BREAK).replace(/\n/g, ' ');
  if (range.kind === 'heading') {
    const head = lines[0].match(/^(#{1,3}\s+)(.*)$/);
    prefix = head ? head[1] : '';
    body = head ? head[2] : lines[0];
    const end = body.match(/(?<!\])\s*(\{[^{}]*\})\s*$/);
    if (end) {
      tail = ` ${end[1]}`;
      body = body.slice(0, end.index);
    }
  }
  const el = h('div', { class: 'editor rich', contenteditable: 'true', spellcheck: 'false' });
  el.style.setProperty('--pt', `${S.scale}px`);
  const prose = proseModel(range);
  const byLine = LINE_KINDS.has(range.kind);
  if (prose) {
    prefix = '';
    tail = '';
    const lead = proseLead(range, prose);
    if (lead) el.append(lead);
    el.append(inlineNodes(proseText(prose, byLine)));
  } else if (range.kind === 'list') {
    prefix = '';
    tail = '';
    el.append(listDom(listItems(lines)));
  } else {
    const number = range.kind === 'heading' && !/(^|\s)(nonumber|unnumbered)(\s|$)/.test(tail) ? headingNumber(range) : '';
    if (number) el.append(h('span', { class: 'rich-lead num', contenteditable: 'false', text: number }));
    el.append(inlineNodes(body));
  }
  S.edit = { range, ta: el, rich: true, prefix, tail, blank, list: range.kind === 'list' };
  if (prose) Object.assign(S.edit, { prose: true, model: prose, byLine, keep: true, list: false });
  savedRange = null;
  el.style.textAlign = currentAlign();
  el.addEventListener('input', () => {
    if (el.textContent.trim() === ':::') {
      el.replaceChildren();
      openSlash();
      return;
    }
    listAutoformat(el);
    commitRich();
  });
  el.addEventListener('keydown', richKeys);
  let fitting = 0;
  new MutationObserver(() => {
    cancelAnimationFrame(fitting);
    fitting = requestAnimationFrame(() => {
      if (S.edit && S.edit.ta === el) positionEditor();
    });
  }).observe(el, { childList: true, subtree: true, characterData: true });
  const copyStyled = (event, cut) => {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed) return;
    const picked = selection.getRangeAt(0);
    let content = picked.cloneContents();
    let node = picked.commonAncestorContainer;
    if (node.nodeType === 3) node = node.parentNode;
    while (node && node !== el && el.contains(node)) {
      const shell = node.cloneNode(false);
      shell.append(content);
      content = shell;
      node = node.parentNode;
    }
    const holder = document.createElement('div');
    holder.append(content);
    event.preventDefault();
    event.stopPropagation();
    event.clipboardData.setData('text/plain', selection.toString());
    event.clipboardData.setData(INLINE_MIME, nodesToMd(holder));
    if (cut) document.execCommand('delete');
  };
  el.addEventListener('copy', (event) => copyStyled(event, false));
  el.addEventListener('cut', (event) => copyStyled(event, true));
  el.addEventListener('paste', (event) => {
    event.preventDefault();
    const block = !S.edit.cover && readBlockClip(event);
    if (block) {
      if (block.page) {
        toast('Pages paste between pages');
        return;
      }
      pasteBlock(block);
      return;
    }
    const styled = event.clipboardData.getData(INLINE_MIME);
    if (styled) {
      const selection = window.getSelection();
      if (!selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const frag = inlineNodes(styled.replace(/\\\\\n/g, BREAK).replace(/\n/g, ' '));
      const last = frag.lastChild;
      range.insertNode(frag);
      if (last) {
        range.setStartAfter(last);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      commitRich();
      return;
    }
    const text = (event.clipboardData || window.clipboardData).getData('text/plain').replace(/\r\n?/g, '\n').replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    text.split('\n').forEach((part, index) => {
      if (index) document.execCommand('insertLineBreak');
      if (part) document.execCommand('insertText', false, part);
    });
  });
  el.addEventListener('blur', () => requestAnimationFrame(paintCaret));
  el.addEventListener('focus', () => requestAnimationFrame(paintCaret));
  el.addEventListener('click', (event) => {
    const node = event.target.closest && event.target.closest('.chip');
    const link = event.target.closest && event.target.closest('.rlink');
    if (node && (node.classList.contains('math') || node.classList.contains('ref') || node.classList.contains('cite') || node.classList.contains('note'))) openChipPop(node);
    else if (link) openChipPop(link);
    else closeChipPop();
  });
  el.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!S.edit || S.edit.ta !== el) return;
      const active = document.activeElement;
      if (el.contains(active) || (active && active.closest && active.closest('.menu, .cpop, .fpop, .fmtbar, .chip-pop, #palette, .src-back'))) return;
      closeChipPop();
      closeEditor();
    }, 0);
  });
  document.addEventListener('selectionchange', trackSelection);
  positionEditor();
  mountRichBar();
  el.focus({ preventScroll: true });
  const selection = window.getSelection();
  const fresh = document.createRange();
  fresh.selectNodeContents(el);
  const leadNode = el.querySelector(':scope > .rich-lead');
  if (leadNode) fresh.setStartAfter(leadNode);
  if (!selectAll) fresh.collapse(Boolean(S.caretStart));
  S.caretStart = false;
  selection.removeAllRanges();
  selection.addRange(fresh);
  savedRange = fresh.cloneRange();
  const click = S.clickAt;
  const chars = S.caretChars;
  S.clickAt = null;
  S.caretChars = null;
  if (selectAll) return;
  requestAnimationFrame(() => {
    let spot = null;
    if (chars != null) spot = caretToChar(el, chars);
    else if (click && Date.now() - click.t < 1500 && document.caretRangeFromPoint) {
      const found = document.caretRangeFromPoint(click.x, click.y);
      if (found && el.contains(found.startContainer)) spot = found;
    }
    if (!spot || !S.edit || S.edit.ta !== el) return;
    const live = window.getSelection();
    live.removeAllRanges();
    live.addRange(spot);
    savedRange = spot.cloneRange();
  });
}

function trackSelection() {
  if (!S.edit || !S.edit.rich) {
    document.removeEventListener('selectionchange', trackSelection);
    return;
  }
  const selection = window.getSelection();
  if (selection.rangeCount && S.edit.ta.contains(selection.anchorNode)) savedRange = selection.getRangeAt(0).cloneRange();
  requestAnimationFrame(paintCaret);
}

function currentAlign() {
  const { range, prefix, tail } = S.edit;
  if (range.kind === 'text') {
    const line = prefix.split('\n').find((item) => /^align\s*:/i.test(item));
    return line ? line.split(':')[1].trim().toLowerCase() : 'left';
  }
  if (range.kind === 'heading') {
    const match = tail.match(/align=([a-z]+)/i);
    return match ? match[1].toLowerCase() : 'left';
  }
  return 'left';
}

function restartAt(range, lines) {
  const keep = range.start;
  closeEditor(true);
  setRangeLines(range, lines);
  S.pendingStart = keep;
  S.focusNew = true;
  S.focusSelectAll = false;
  lockHits();
  schedule(100);
}

function setAlign(value) {
  const edit = S.edit;
  if (!edit || !edit.rich) return;
  if (edit.cover) {
    edit.cover.align(value);
    return;
  }
  const { range, ta: el } = edit;
  const body = bodyMd(el);
  if (range.kind === 'para') {
    if (value === 'left') return;
    restartAt(range, [':::text', `align: ${value}`, '---', ...body.split('\n'), ':::']);
  } else if (range.kind === 'text') {
    const head = edit.prefix.replace(/\n---\n$/, '').split('\n');
    const at = head.findIndex((line) => /^align\s*:/i.test(line));
    if (value === 'left') {
      if (at >= 0) head.splice(at, 1);
    } else if (at >= 0) head[at] = `align: ${value}`;
    else head.push(`align: ${value}`);
    if (head.length === 1) return restartAt(range, body.split('\n'));
    edit.prefix = `${head.join('\n')}\n---\n`;
    el.style.textAlign = value;
    commitRich();
  } else if (range.kind === 'heading') {
    const tokens = edit.tail.trim().replace(/^\{|\}$/g, '').split(/\s+/).filter((token) => token && !token.startsWith('align='));
    if (value !== 'left') tokens.push(`align=${value}`);
    edit.tail = tokens.length ? ` {${tokens.join(' ')}}` : '';
    el.style.textAlign = value;
    commitRich();
  }
}

function inlineItems() {
  const items = [{ label: 'Equation', hint: 'maths', run: () => newMath() }];
  Object.entries(S.labels || {}).forEach(([key, label]) => items.push({ label, hint: 'reference', run: () => insertInlineChip('ref', `@${key}`, label) }));
  Object.entries(S.sources || {}).forEach(([key, label]) => items.push({ label, hint: 'source', run: () => insertInlineChip('cite', `[@${key}]`, (S.cites && S.cites[`@${key}`]) || label) }));
  if (typeof openSourceLookup === 'function') items.push({ label: 'Add source', hint: 'DOI, ISBN or link', run: () => openSourceLookup() });
  items.push({ label: 'Link', hint: 'web address', run: () => newLink() });
  items.push({ label: 'Footnote', hint: 'note at the page foot', run: () => newNote() });
  items.push({ label: 'Symbols', hint: 'Greek, operators', run: () => richMathPalette(S.edit.bar.querySelector('.math')) });
  TEMPLATES.forEach((template) => items.push({ label: template.label, hint: template.group, template, run: () => inlineBlock(template) }));
  return items;
}

function caretRect() {
  const range = currentRange();
  if (!range) return null;
  const copy = range.cloneRange();
  copy.collapse(true);
  const rects = copy.getClientRects();
  if (rects.length) return rects[0];
  const rect = copy.startContainer.nodeType === 1 ? copy.startContainer.getBoundingClientRect() : S.edit.ta.getBoundingClientRect();
  return rect;
}

function paintInline() {
  const state = S.inline;
  const query = state.query.toLowerCase();
  const all = inlineItems();
  const basic = all.filter((item) => !item.template && (!query || item.label.toLowerCase().includes(query) || item.hint.toLowerCase().includes(query)));
  const blocks = query ? all.filter((item) => item.template && templateMatches(item.template, query)).slice(0, 12) : [];
  state.shown = [...basic, ...blocks];
  state.active = Math.min(state.active, Math.max(state.shown.length - 1, 0));
  state.node.replaceChildren(
    h('div', { class: 'inline-query', text: `@${state.query}` }),
    h(
      'div',
      { class: 'menu-list' },
      state.shown.length
        ? state.shown.map((item, index) =>
            h('button', {
              type: 'button',
              class: index === state.active ? 'active' : '',
              html: `<span>${item.label}</span><span class="inline-hint">${item.hint}</span>`,
              onmouseenter: () => {
                state.active = index;
                paintInline();
              },
              onclick: () => chooseInline(index),
            }),
          )
        : [h('div', { class: 'inline-empty', text: 'Nothing found' })],
    ),
  );
}

function openInline() {
  savedRange = currentRange() ? currentRange().cloneRange() : savedRange;
  const node = h('div', { class: 'menu inline-menu' });
  node.addEventListener('mousedown', (event) => event.preventDefault());
  document.body.append(node);
  S.inline = { node, query: '', active: 0, shown: [] };
  const rect = caretRect();
  const k = UI.size;
  node.style.left = `${Math.max(8, rect ? rect.left : 100) / k}px`;
  node.style.top = `${(rect ? rect.bottom + 6 : 100) / k}px`;
  paintInline();
}

function inlineBlock(template) {
  if (!S.edit || !S.edit.range) return insertTemplate(template);
  const empty = !S.edit.ta.textContent.trim();
  S.target = { range: S.edit.range, where: empty ? 'replace' : 'after' };
  insertTemplate(template);
}

function closeInline() {
  if (S.inline) S.inline.node.remove();
  S.inline = null;
}

function inlineKey(event) {
  const state = S.inline;
  const key = event.key;
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    event.preventDefault();
    state.active = (state.active + (key === 'ArrowDown' ? 1 : -1) + state.shown.length) % Math.max(state.shown.length, 1);
    paintInline();
  } else if (key === 'Enter' || key === 'Tab') {
    event.preventDefault();
    chooseInline(state.active);
  } else if (key === 'Escape') {
    event.preventDefault();
    closeInline();
  } else if (key === 'Backspace') {
    event.preventDefault();
    if (state.query) {
      state.query = state.query.slice(0, -1);
      paintInline();
    } else closeInline();
  } else if (key.length === 1 && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    state.query += key;
    paintInline();
  } else if (key !== 'Shift') closeInline();
}

function chooseInline(index) {
  const item = S.inline.shown[index];
  closeInline();
  if (item) {
    restoreSelection();
    item.run();
  }
}

function insertInlineChip(kind, source, label) {
  restoreSelection();
  const range = window.getSelection().getRangeAt(0);
  range.deleteContents();
  const node = chip(kind, source, label);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  savedRange = range.cloneRange();
  commitRich();
  return node;
}

function newMath() {
  const node = insertInlineChip('math', '$x^2$', 'x^2');
  openChipPop(node);
  setTimeout(() => {
    const input = document.querySelector('.chip-pop .chip-input');
    if (input) input.select();
  }, 20);
}

function newNote() {
  const node = insertInlineChip('note', '^[]', '\u2020');
  openChipPop(node);
}

function newLink() {
  restoreSelection();
  const range = window.getSelection().getRangeAt(0);
  const label = range.toString() || 'link text';
  range.deleteContents();
  const node = document.createElement('span');
  node.className = 'rlink';
  node.dataset.url = '';
  node.textContent = label;
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  savedRange = range.cloneRange();
  commitRich();
  openChipPop(node);
}
