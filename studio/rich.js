const REF_KINDS = 'fig|tbl|eq|code|sec|def|thm|lem|prop|cor|ex|rem';
const UNICODE_MATH = {
  '²': '^2', '³': '^3', '¹': '^1', '⁰': '^0', '⁴': '^4', '⁵': '^5', '⁶': '^6', '⁷': '^7', '⁸': '^8', '⁹': '^9',
  '√': ' sqrt ', '×': ' xx ', '÷': ' -: ', '≤': ' <= ', '≥': ' >= ', '≠': ' != ', '∞': ' oo ', '±': ' +- ',
  '→': ' -> ', '⇒': ' => ', '·': ' * ', '−': '-', '∑': ' sum ', '∫': ' int ', '∈': ' in ', '∉': ' !in ',
  '⊂': ' subset ', '∪': ' cup ', '∩': ' cap ', '≈': ' ~~ ', '°': '^@',
};
const SPECIAL_CHARS = /[\\*$[\]`]/g;
const BREAK = ' ';
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

function nodesToMd(parent) {
  let out = '';
  parent.childNodes.forEach((node) => {
    if (node.nodeType === 3) {
      out += escapeText(node.nodeValue);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName;
    if (node.classList.contains('chip')) {
      out += node.dataset.src;
      return;
    }
    const inner = nodesToMd(node);
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
  const body = bodyMd(el);
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
  restoreSelection();
  selectWord();
  document.execCommand(command);
  savedRange = window.getSelection().rangeCount ? window.getSelection().getRangeAt(0).cloneRange() : savedRange;
  commitRich();
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
}

function splitParagraph() {
  const { ta: el, range, prefix, tail } = S.edit;
  const current = currentRange();
  if (!current) return;
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
  if (!head.trim()) return;
  const lines = `${prefix}${head}${tail}`.split('\n');
  const fresh = rest.trim() ? rest : 'New paragraph.';
  const out = [...lines, '', ...fresh.split('\n')];
  closeEditor(true);
  setRangeLines(range, out);
  S.pendingStart = range.start + lines.length + 1;
  S.focusNew = true;
  S.focusSelectAll = !rest.trim();
  S.caretStart = Boolean(rest.trim());
  lockHits();
  schedule(120);
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
    onPick: (value) => applyFmt((list) => setKey(list, 'size', value || null)),
  });
  const font = fontPicker('', (value) => {
    restoreSelection();
    applyFmt((list) => setKey(list, 'font', value || null));
  }, { keep: true, className: 'fmt-drop wide', empty: 'Font' });
  [size, font].forEach(keep);
  const colorBtn = tool('<span class="aa">A</span><i class="bar-color"></i>', 'Text colour', () => swatchMenu(colorBtn, TEXT_COLORS, (color) => applyFmt((list) => setKey(list, 'color', color)), 'Default'));
  const markBtn = tool(icon('highlight', 17), 'Highlight', () => swatchMenu(markBtn, HIGHLIGHTS, (color) => applyFmt((list) => setKey(list.filter((item) => item.flag !== 'highlight'), 'bg', color)), 'None'));
  const mathBtn = tool('Σ', 'Equation (Ctrl+M)', () => richMathPalette(mathBtn), 'math');
  const bar = h('div', { class: 'fmtbar' });
  bar.append(
    tool('<b>B</b>', 'Bold (Ctrl+B)', () => execFormat('bold')),
    tool('<i>I</i>', 'Italic (Ctrl+I)', () => execFormat('italic')),
    tool('<u>U</u>', 'Underline (Ctrl+U)', () => execFormat('underline')),
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
    h('span', { class: 'fmt-sep' }),
    tool(icon('alignLeft', 16), 'Align left (Ctrl+L)', () => setAlign('left')),
    tool(icon('alignCenter', 16), 'Centre (Ctrl+E)', () => setAlign('center')),
    tool(icon('alignRight', 16), 'Align right (Ctrl+R)', () => setAlign('right')),
    tool(icon('alignJustify', 16), 'Justify (Ctrl+J)', () => setAlign('justify')),
    h('span', { class: 'fmt-sep' }),
    tool(icon('up', 16), 'Move up', () => move(-1)),
    tool(icon('down', 16), 'Move down', () => move(1)),
    tool(icon('copy', 16), 'Duplicate', () => duplicate()),
    tool(icon('trash', 16), 'Delete', () => remove(S.sel), 'danger'),
  );
  if (S.edit.cover) [...bar.children].slice(-5).forEach((node) => node.remove());
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
  if (key === 'Enter' && mod) {
    event.preventDefault();
    splitParagraph();
  } else if (key === 'Enter') {
    event.preventDefault();
    document.execCommand('insertLineBreak');
  } else if (key === '/' && !mod && !event.shiftKey && (!S.edit.ta.textContent.trim() || window.getSelection().toString() === S.edit.ta.textContent)) {
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
  el.append(inlineNodes(body));
  S.edit = { range, ta: el, rich: true, prefix, tail, blank };
  savedRange = null;
  el.style.textAlign = currentAlign();
  el.addEventListener('input', () => {
    if (el.textContent.trim() === ':::') {
      el.replaceChildren();
      openSlash();
      return;
    }
    commitRich();
  });
  el.addEventListener('keydown', richKeys);
  el.addEventListener('paste', (event) => {
    event.preventDefault();
    const text = (event.clipboardData || window.clipboardData).getData('text/plain').replace(/\s+/g, ' ');
    document.execCommand('insertText', false, text);
  });
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
      if (el.contains(active) || (active && active.closest && active.closest('.menu, .cpop, .fpop, .fmtbar, .chip-pop, #palette'))) return;
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
  if (!selectAll) fresh.collapse(Boolean(S.caretStart));
  S.caretStart = false;
  selection.removeAllRanges();
  selection.addRange(fresh);
  savedRange = fresh.cloneRange();
}

function trackSelection() {
  if (!S.edit || !S.edit.rich) {
    document.removeEventListener('selectionchange', trackSelection);
    return;
  }
  const selection = window.getSelection();
  if (selection.rangeCount && S.edit.ta.contains(selection.anchorNode)) savedRange = selection.getRangeAt(0).cloneRange();
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
  items.push({ label: 'Link', hint: 'web address', run: () => newLink() });
  items.push({ label: 'Footnote', hint: 'note at the page foot', run: () => newNote() });
  items.push({ label: 'Symbols', hint: 'Greek, operators', run: () => richMathPalette(S.edit.bar.querySelector('.math')) });
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
  state.shown = inlineItems().filter((item) => !query || item.label.toLowerCase().includes(query) || item.hint.toLowerCase().includes(query));
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
