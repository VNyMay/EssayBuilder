const FONT_LIST = [
  'Cambria', 'Times New Roman', 'Georgia', 'Arial', 'Calibri', 'Verdana', 'Lora', 'Merriweather', 'Playfair Display',
  'Crimson Text', 'EB Garamond', 'Libre Baskerville', 'Source Serif 4', 'Montserrat', 'Open Sans', 'Roboto', 'Lato',
  'Poppins', 'Nunito', 'Raleway', 'Inter', 'Fira Code', 'JetBrains Mono', 'Source Code Pro', 'Caveat', 'Pacifico',
  'Amiri', 'Cairo', 'Tajawal',
];
const SIZE_LIST = ['8', '10', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48', '60', '72'];
const TEXT_COLORS = ['#141414', '#5d5d58', '#c0392b', '#d98200', '#f1a001', '#2e7d32', '#027554', '#0e8a8a', '#1f4e79', '#6a3d9a', '#b0245c', '#ffffff'];
const HIGHLIGHTS = ['#fff3a3', '#ffd9a8', '#ffc9c9', '#cdeccd', '#c9e4ff', '#e4d4ff'];
const MATH_ITEMS = [
  ['a/b', 'a/b'], ['x²', 'x^2'], ['x₁', 'x_1'], ['√x', 'sqrt(x)'], ['ⁿ√x', 'root(3)(x)'], ['Σ', 'sum_(i=1)^n i'],
  ['∫', 'int_a^b f(x) dx'], ['lim', 'lim_(x->0) f(x)'], ['|x|', '|x|'], ['vec', 'vec(v)'], ['x̄', 'bar(x)'], ['matrix', '[[1,2],[3,4]]'],
  ['±', '±'], ['×', '×'], ['÷', '÷'], ['≤', '≤'], ['≥', '≥'], ['≠', '≠'], ['≈', '≈'], ['∞', '∞'], ['→', '→'], ['°', '°'],
  ['α', 'α'], ['β', 'β'], ['γ', 'γ'], ['δ', 'δ'], ['θ', 'θ'], ['λ', 'λ'], ['μ', 'μ'], ['π', 'π'], ['σ', 'σ'], ['φ', 'φ'],
  ['ω', 'ω'], ['Δ', 'Δ'], ['Ω', 'Ω'], ['∈', '∈'], ['∪', '∪'], ['∩', '∩'], ['ℝ', 'RR'], ['ℕ', 'NN'],
];

function attrList(text) {
  const list = [];
  const pattern = /([A-Za-z][\w-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s"']+)|([A-Za-z][\w-]*)/g;
  let match = pattern.exec(text);
  while (match) {
    list.push(match[3] ? { flag: match[3] } : { key: match[1], value: match[2].replace(/^["']|["']$/g, '') });
    match = pattern.exec(text);
  }
  return list;
}

function attrString(list) {
  return list.map((item) => (item.flag ? item.flag : `${item.key}=${/\s/.test(item.value) ? `"${item.value}"` : item.value}`)).join(' ');
}

function setKey(list, key, value) {
  const rest = list.filter((item) => item.key !== key);
  return value === null ? rest : [...rest, { key, value }];
}

function toggleFlag(list, flag) {
  return list.some((item) => item.flag === flag) ? list.filter((item) => item.flag !== flag) : [...list, { flag }];
}

function wordRange(text, at) {
  let start = at;
  let end = at;
  while (start > 0 && /[\p{L}\p{N}'’_-]/u.test(text[start - 1])) start -= 1;
  while (end < text.length && /[\p{L}\p{N}'’_-]/u.test(text[end])) end += 1;
  return [start, end];
}

function commitField(ta, value, from, to, selectFrom, selectTo) {
  ta.value = value;
  ta.setSelectionRange(selectFrom, selectTo);
  ta.dispatchEvent(new Event('input'));
  ta.focus();
}

function styleSelection(ta, edit) {
  const text = ta.value;
  let [start, end] = [ta.selectionStart, ta.selectionEnd];
  if (start === end) [start, end] = wordRange(text, start);
  if (start === end) return;
  const after = text.slice(end).match(/^\]\{([^{}]*)\}/);
  if (text[start - 1] === '[' && after) {
    const list = edit(attrList(after[1]));
    const inner = text.slice(start, end);
    if (!list.length) return commitField(ta, text.slice(0, start - 1) + inner + text.slice(end + after[0].length), 0, 0, start - 1, start - 1 + inner.length);
    return commitField(ta, `${text.slice(0, start)}${inner}]{${attrString(list)}}${text.slice(end + after[0].length)}`, 0, 0, start, end);
  }
  const whole = text.slice(start, end).match(/^\[([\s\S]*)\]\{([^{}]*)\}$/);
  if (whole) {
    const list = edit(attrList(whole[2]));
    const replaced = list.length ? `[${whole[1]}]{${attrString(list)}}` : whole[1];
    return commitField(ta, text.slice(0, start) + replaced + text.slice(end), 0, 0, start, start + replaced.length);
  }
  const list = edit([]);
  if (!list.length) return;
  const inner = text.slice(start, end);
  commitField(ta, `${text.slice(0, start)}[${inner}]{${attrString(list)}}${text.slice(end)}`, 0, 0, start + 1, start + 1 + inner.length);
}

function wrapMarks(ta, mark) {
  const text = ta.value;
  let [start, end] = [ta.selectionStart, ta.selectionEnd];
  if (start === end) [start, end] = wordRange(text, start);
  if (start === end) return;
  const size = mark.length;
  if (text.slice(start - size, start) === mark && text.slice(end, end + size) === mark) {
    return commitField(ta, text.slice(0, start - size) + text.slice(start, end) + text.slice(end + size), 0, 0, start - size, end - size);
  }
  commitField(ta, `${text.slice(0, start)}${mark}${text.slice(start, end)}${mark}${text.slice(end)}`, 0, 0, start + size, end + size);
}

function insideMath(text, at) {
  const lineStart = text.lastIndexOf('\n', at - 1) + 1;
  const before = text.slice(lineStart, at).replace(/\\\$/g, '');
  return ((before.match(/\$/g) || []).length % 2) === 1;
}

function insertMath(ta, snippet) {
  const text = ta.value;
  const [start, end] = [ta.selectionStart, ta.selectionEnd];
  if (insideMath(text, start)) {
    return commitField(ta, text.slice(0, start) + snippet + text.slice(end), 0, 0, start + snippet.length, start + snippet.length);
  }
  const body = text.slice(start, end) || snippet;
  commitField(ta, `${text.slice(0, start)}$${body}$${text.slice(end)}`, 0, 0, start + 1, start + 1 + body.length);
}

function swatchMenu(anchor, colors, onPick, reset) {
  closeMenu();
  const node = h('div', { class: 'menu swatches' });
  const dot = (color) => h('button', { type: 'button', class: 'swatch-dot', style: `background:${color}`, title: color, onclick: () => { closeMenu(); onPick(color); } });
  colors.forEach((color) => node.append(dot(color)));
  const used = [...new Set((S.source.match(/color=(#[0-9a-fA-F]{3,8})\b/g) || []).map((item) => item.slice(6).toLowerCase()))].filter((color) => !colors.map((item) => item.toLowerCase()).includes(color)).slice(0, 12);
  if (used.length) {
    node.append(h('div', { class: 'swatch-title', text: 'In this essay' }));
    used.forEach((color) => node.append(dot(color)));
  }
  const custom = h('input', { type: 'color', class: 'swatch-custom', title: 'Custom colour' });
  custom.addEventListener('input', () => onPick(custom.value));
  custom.addEventListener('change', () => closeMenu());
  node.append(custom);
  node.append(h('button', { type: 'button', class: 'swatch-reset', text: reset, onclick: () => { closeMenu(); onPick(null); } }));
  node.addEventListener('mousedown', (event) => event.preventDefault());
  document.body.append(node);
  const k = UI.size;
  const rect = anchor.getBoundingClientRect();
  node.style.left = `${Math.max(8, rect.left) / k}px`;
  node.style.top = `${(rect.bottom + 8) / k}px`;
  openMenu = { node, button: anchor };
}

function mathPalette(anchor, ta) {
  closeMenu();
  const node = h('div', { class: 'menu mathpal' });
  MATH_ITEMS.forEach(([label, snippet]) => {
    node.append(h('button', { type: 'button', text: label, title: snippet, onclick: () => { closeMenu(); insertMath(ta, snippet); } }));
  });
  node.addEventListener('mousedown', (event) => event.preventDefault());
  document.body.append(node);
  const k = UI.size;
  const rect = anchor.getBoundingClientRect();
  node.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 360)) / k}px`;
  node.style.top = `${(rect.bottom + 8) / k}px`;
  openMenu = { node, button: anchor };
}

function mountFormatBar() {
  const { ta } = S.edit;
  const keep = (node) => {
    node.addEventListener('mousedown', (event) => event.preventDefault());
    return node;
  };
  const tool = (label, title, action, extra = '') => keep(h('button', { type: 'button', class: `fmt-btn ${extra}`.trim(), html: label, title, onclick: action }));
  const bar = h('div', { class: 'fmtbar' });
  const size = dropdown({
    choices: [...SIZE_LIST.map((v) => ({ value: v, label: v })), { value: '', label: 'Normal size' }],
    value: '',
    label: 'Size',
    keep: true,
    className: 'fmt-drop',
    onPick: (value) => styleSelection(ta, (list) => setKey(list, 'size', value || null)),
  });
  const font = dropdown({
    choices: [...FONT_LIST.map((v) => ({ value: v, label: v, style: `font-family:'${v}',sans-serif` })), { value: '', label: 'Document font' }],
    value: '',
    label: 'Font',
    keep: true,
    className: 'fmt-drop wide',
    onPick: (value) => styleSelection(ta, (list) => setKey(list, 'font', value || null)),
  });
  [size, font].forEach(keep);
  const colorBtn = tool('<span class="aa">A</span><i class="bar-color"></i>', 'Text colour', () => swatchMenu(colorBtn, TEXT_COLORS, (color) => styleSelection(ta, (list) => setKey(list, 'color', color)), 'Default'));
  const markBtn = tool(`${icon('highlight', 17)}`, 'Highlight', () => swatchMenu(markBtn, HIGHLIGHTS, (color) => styleSelection(ta, (list) => setKey(list.filter((item) => item.flag !== 'highlight'), 'bg', color)), 'None'));
  const mathBtn = tool('Σ', 'Equation (Ctrl+M)', () => mathPalette(mathBtn, ta), 'math');
  bar.append(
    tool('<b>B</b>', 'Bold (Ctrl+B)', () => wrapMarks(ta, '**')),
    tool('<i>I</i>', 'Italic (Ctrl+I)', () => wrapMarks(ta, '*')),
    tool('<u>U</u>', 'Underline (Ctrl+U)', () => styleSelection(ta, (list) => toggleFlag(list, 'underline'))),
    tool('<s>S</s>', 'Strikethrough', () => styleSelection(ta, (list) => toggleFlag(list, 'strike'))),
    tool('x<sup>2</sup>', 'Superscript', () => styleSelection(ta, (list) => toggleFlag(list.filter((item) => item.flag !== 'sub'), 'sup'))),
    tool('x<sub>2</sub>', 'Subscript', () => styleSelection(ta, (list) => toggleFlag(list.filter((item) => item.flag !== 'sup'), 'sub'))),
    h('span', { class: 'fmt-sep' }),
    size,
    font,
    colorBtn,
    markBtn,
    h('span', { class: 'fmt-sep' }),
    mathBtn,
    tool('Aa', 'Clear formatting', () => styleSelection(ta, () => [])),
  );
  ta.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'b') wrapMarks(ta, '**');
    else if (key === 'i') wrapMarks(ta, '*');
    else if (key === 'u') styleSelection(ta, (list) => toggleFlag(list, 'underline'));
    else if (key === 'm') mathPalette(mathBtn, ta);
    else return;
    event.preventDefault();
  });
  S.edit.bar = bar;
  ta.parentNode.append(bar);
  placeFormatBar();
}

function placeFormatBar() {
  if (!S.edit || !S.edit.bar) return;
  const { ta, bar } = S.edit;
  if (bar.parentNode !== ta.parentNode) ta.parentNode.append(bar);
  const above = ta.offsetTop - bar.offsetHeight - 8;
  bar.style.left = `${ta.offsetLeft}px`;
  bar.style.top = `${above >= -52 ? above : ta.offsetTop + ta.offsetHeight + 8}px`;
}
