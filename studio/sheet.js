const SHEET = { root: null, grid: null, range: null, anchor: null, picked: new Set(), active: null, timer: 0 };

function sheetMode(range) {
  if (!range || !S.panel || S.panel.range !== range || rowGet(S.panel.model, 'src')) return null;
  if (['table', 'pipetable'].includes(range.kind)) return 'over';
  if (range.kind === 'chart' && rowGet(S.panel.model, 'type') !== 'function' && S.panel.model.body.some((line) => line.trim())) return 'below';
  return null;
}

function sheetable(range) {
  return Boolean(sheetMode(range));
}

function cellKey(r, c) {
  return `${r},${c}`;
}

function cellAt(r, c) {
  return SHEET.root ? SHEET.root.querySelector(`td[data-r="${r}"][data-c="${c}"]`) : null;
}

function cellMd(td) {
  return nodesToMd(td).replace(/\\\\\n/g, ' ').replace(/\s+/g, ' ').replace(/(?<!\\)\|/g, '\\|').trim();
}

function cellTokens(text) {
  const whole = text.match(/^\[(.*)\]\{([^{}]*)\}$/);
  return { inner: whole ? whole[1] : text, tokens: whole ? whole[2].match(/[A-Za-z][\w-]*="[^"]*"|\S+/g) || [] : [] };
}

function cellStyle(text, change) {
  const { inner, tokens } = cellTokens(text);
  let kept = tokens;
  if (change.flag) {
    kept = tokens.filter((item) => item !== change.flag);
    if (change.on) kept.push(change.flag);
  } else {
    kept = tokens.filter((item) => !item.startsWith(`${change.key}=`));
    if (change.value) kept.push(`${change.key}=${/\s/.test(change.value) ? `"${change.value}"` : change.value}`);
  }
  if (change.clear) kept = [];
  return kept.length && inner.trim() ? `[${inner}]{${kept.join(' ')}}` : inner;
}

function readSheet() {
  if (!SHEET.root) return;
  SHEET.root.querySelectorAll('td[data-r]').forEach((td) => {
    SHEET.grid.rows[Number(td.dataset.r)][Number(td.dataset.c)] = cellMd(td);
  });
}

function sheetCommit(delay = 450) {
  if (!SHEET.root || !S.panel) return;
  readSheet();
  S.panel.model.body = serializeGrid(SHEET.grid);
  commitPanel(delay);
  clearTimeout(SHEET.timer);
  SHEET.timer = setTimeout(() => {
    if (S.panel && SHEET.root) {
      const active = document.activeElement;
      renderPanel();
      if (active && SHEET.root.contains(active)) active.focus({ preventScroll: true });
    }
  }, delay + 250);
}

function targets() {
  if (SHEET.picked.size) return [...SHEET.picked].map((key) => key.split(',').map(Number));
  return SHEET.active ? [[Number(SHEET.active.dataset.r), Number(SHEET.active.dataset.c)]] : [];
}

function bounds() {
  const list = targets();
  if (!list.length) return null;
  return {
    top: Math.min(...list.map(([r]) => r)),
    bottom: Math.max(...list.map(([r]) => r)),
    left: Math.min(...list.map(([, c]) => c)),
    right: Math.max(...list.map(([, c]) => c)),
  };
}

function paintPicked() {
  if (!SHEET.root) return;
  SHEET.root.querySelectorAll('td[data-r]').forEach((td) => td.classList.toggle('picked', SHEET.picked.has(cellKey(td.dataset.r, td.dataset.c))));
  SHEET.root.classList.toggle('picking', SHEET.picked.size > 0);
}

function pickRect(from, to) {
  SHEET.picked = new Set();
  const [r1, r2] = [Math.min(from[0], to[0]), Math.max(from[0], to[0])];
  const [c1, c2] = [Math.min(from[1], to[1]), Math.max(from[1], to[1])];
  for (let r = r1; r <= r2; r += 1) for (let c = c1; c <= c2; c += 1) SHEET.picked.add(cellKey(r, c));
  if (SHEET.picked.size === 1) SHEET.picked = new Set();
  paintPicked();
}

function restyle(change) {
  readSheet();
  const list = targets();
  if (!list.length) return;
  if (change.flag && change.on === undefined) {
    change.on = !list.every(([r, c]) => cellTokens(SHEET.grid.rows[r][c]).tokens.includes(change.flag));
  }
  list.forEach(([r, c]) => {
    SHEET.grid.rows[r][c] = cellStyle(SHEET.grid.rows[r][c], change);
  });
  drawSheet();
  sheetCommit(250);
}

function alignColumns(value) {
  readSheet();
  const box = bounds();
  if (!box) return;
  const width = SHEET.grid.rows[0].length;
  if (!SHEET.grid.sep || SHEET.grid.sep.length !== width) SHEET.grid.sep = Array(width).fill('---');
  for (let c = box.left; c <= box.right; c += 1) SHEET.grid.sep[c] = { left: ':---', center: ':---:', right: '---:' }[value] || '---';
  drawSheet();
  sheetCommit(250);
}

function changeShape(kind) {
  readSheet();
  const box = bounds() || { top: SHEET.grid.rows.length - 1, bottom: SHEET.grid.rows.length - 1, left: 0, right: 0 };
  const rows = SHEET.grid.rows;
  const width = rows[0].length;
  if (kind === 'rowAbove' || kind === 'rowBelow') rows.splice(kind === 'rowAbove' ? Math.max(1, box.top) : box.bottom + 1, 0, Array(width).fill(''));
  if (kind === 'colLeft' || kind === 'colRight') {
    const at = kind === 'colLeft' ? box.left : box.right + 1;
    rows.forEach((row, r) => row.splice(at, 0, r === 0 ? `Column ${width + 1}` : ''));
    if (SHEET.grid.sep) SHEET.grid.sep.splice(at, 0, '---');
  }
  if (kind === 'delRows' && rows.length - (box.bottom - box.top + 1) >= 2) rows.splice(box.top, box.bottom - box.top + 1);
  if (kind === 'delCols' && width - (box.right - box.left + 1) >= 1) {
    rows.forEach((row) => row.splice(box.left, box.right - box.left + 1));
    if (SHEET.grid.sep) SHEET.grid.sep.splice(box.left, box.right - box.left + 1);
  }
  SHEET.picked = new Set();
  drawSheet();
  sheetCommit(200);
}

function moveTo(r, c) {
  const rows = SHEET.grid.rows;
  if (r >= rows.length) {
    readSheet();
    rows.push(Array(rows[0].length).fill(''));
    drawSheet();
    sheetCommit(400);
  }
  const td = cellAt(Math.max(0, r), Math.max(0, c));
  if (!td) return;
  td.focus();
  const range = document.createRange();
  range.selectNodeContents(td);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function pasteGrid(td, text) {
  readSheet();
  const lines = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((line) => line.split('\t'));
  const r0 = Number(td.dataset.r);
  const c0 = Number(td.dataset.c);
  const rows = SHEET.grid.rows;
  lines.forEach((cells, i) => {
    const r = r0 + i;
    while (rows.length <= r) rows.push(Array(rows[0].length).fill(''));
    cells.forEach((value, j) => {
      const c = c0 + j;
      if (c >= rows[0].length) {
        rows.forEach((row, index) => row.push(index === 0 ? `Column ${row.length + 1}` : ''));
        if (SHEET.grid.sep) SHEET.grid.sep.push('---');
      }
      rows[r][c] = escapeText(value.trim()).replace(/\|/g, '\\|');
    });
  });
  drawSheet();
  sheetCommit(250);
}

function sheetKeys(event) {
  const td = event.target.closest('td[data-r]');
  if (!td) return;
  const r = Number(td.dataset.r);
  const c = Number(td.dataset.c);
  const width = SHEET.grid.rows[0].length;
  const mod = event.ctrlKey || event.metaKey;
  if (event.key === 'Tab') {
    event.preventDefault();
    if (event.shiftKey) moveTo(c > 0 ? r : r - 1, c > 0 ? c - 1 : width - 1);
    else moveTo(c < width - 1 ? r : r + 1, c < width - 1 ? c + 1 : 0);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    moveTo(event.shiftKey ? r - 1 : r + 1, c);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    deselect();
  } else if (SHEET.picked.size && mod && ['b', 'i', 'u'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    restyle({ flag: { b: 'bold', i: 'italic', u: 'underline' }[event.key.toLowerCase()] });
  } else if (SHEET.picked.size && (event.key === 'Delete' || event.key === 'Backspace')) {
    event.preventDefault();
    readSheet();
    targets().forEach(([row, col]) => {
      SHEET.grid.rows[row][col] = '';
    });
    drawSheet();
    sheetCommit(250);
  }
}

function sheetBar(mode) {
  const tool = (html, title, action, extra = '') => {
    const button = h('button', { type: 'button', class: `fmt-btn ${extra}`.trim(), html, title });
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', action);
    return button;
  };
  const sep = () => h('span', { class: 'fmt-sep' });
  const size = dropdown({
    choices: [...SIZE_LIST.map((value) => ({ value, label: value })), { value: '', label: 'Normal size' }],
    value: '',
    label: 'Size',
    keep: true,
    className: 'fmt-drop',
    onPick: (value) => restyle({ key: 'size', value }),
  });
  const font = fontPicker('', (value) => restyle({ key: 'font', value }), { keep: true, className: 'fmt-drop wide', empty: 'Font' });
  const colour = tool('<span class="aa">A</span><i class="bar-color"></i>', 'Text colour', () => swatchMenu(colour, TEXT_COLORS, (value) => restyle({ key: 'color', value }), 'Default'));
  const marker = tool(icon('highlight', 17), 'Highlight', () => swatchMenu(marker, HIGHLIGHTS, (value) => restyle({ key: 'bg', value }), 'None'));
  [size, font].forEach((item) => item.addEventListener('mousedown', (event) => {
    if (event.target.tagName !== 'INPUT') event.preventDefault();
  }));
  const shape = [
    tool('<span class="shape">+ Row ↑</span>', 'Insert row above', () => changeShape('rowAbove')),
    tool('<span class="shape">+ Row ↓</span>', 'Insert row below', () => changeShape('rowBelow')),
    tool('<span class="shape">+ Col ←</span>', 'Insert column left', () => changeShape('colLeft')),
    tool('<span class="shape">+ Col →</span>', 'Insert column right', () => changeShape('colRight')),
    sep(),
    tool('<span class="shape">− Row</span>', 'Delete rows', () => changeShape('delRows'), 'danger'),
    tool('<span class="shape">− Col</span>', 'Delete columns', () => changeShape('delCols'), 'danger'),
  ];
  if (mode === 'below') return h('div', { class: 'fmtbar sheet-bar' }, h('span', { class: 'sheet-name', text: 'Chart data' }), sep(), ...shape);
  return h(
    'div',
    { class: 'fmtbar sheet-bar' },
    tool('<b>B</b>', 'Bold (Ctrl+B)', () => restyle({ flag: 'bold' })),
    tool('<i>I</i>', 'Italic (Ctrl+I)', () => restyle({ flag: 'italic' })),
    tool('<u>U</u>', 'Underline (Ctrl+U)', () => restyle({ flag: 'underline' })),
    tool('<s>S</s>', 'Strikethrough', () => restyle({ flag: 'strike' })),
    sep(),
    size,
    font,
    colour,
    marker,
    sep(),
    tool(icon('alignLeft', 16), 'Align column left', () => alignColumns('left')),
    tool(icon('alignCenter', 16), 'Centre column', () => alignColumns('center')),
    tool(icon('alignRight', 16), 'Align column right', () => alignColumns('right')),
    sep(),
    ...shape,
    tool(icon('close', 14), 'Clear formatting', () => restyle({ key: 'size', value: '', clear: true })),
  );
}

function drawSheet() {
  if (!SHEET.root) return;
  const table = SHEET.root.querySelector('table');
  const rows = SHEET.grid.rows;
  const width = Math.max(...rows.map((row) => row.length));
  SHEET.grid.rows = rows.map((row) => [...row, ...Array(width - row.length).fill('')]);
  const sep = SHEET.grid.sep || [];
  const head = !/^(no|off|false)$/i.test(rowGet(S.panel.model, 'header') || 'yes');
  const body = [];
  const handles = h('tr', { class: 'sheet-handles' }, h('th', { class: 'corner', title: 'Select all' }));
  for (let c = 0; c < width; c += 1) handles.append(h('th', { class: 'col-handle', 'data-c': c, title: 'Select column' }));
  body.push(handles);
  SHEET.grid.rows.forEach((row, r) => {
    const tr = h('tr', { class: r === 0 && head ? 'head' : '' }, h('th', { class: 'row-handle', 'data-r': r, title: 'Select row' }));
    row.forEach((text, c) => {
      const td = h('td', { 'data-r': r, 'data-c': c, contenteditable: 'true', spellcheck: 'false' });
      const align = sep[c] || '';
      td.style.textAlign = align.startsWith(':') && align.endsWith(':') ? 'center' : align.endsWith(':') ? 'right' : align.startsWith(':') ? 'left' : '';
      td.append(inlineNodes(text));
      tr.append(td);
    });
    body.push(tr);
  });
  table.replaceChildren(...body);
  paintPicked();
}

function positionSheet() {
  if (!SHEET.root || !SHEET.range) return;
  const span = firstSpan(SHEET.range);
  if (!span) return;
  const div = $('#pages').children[span.page];
  if (SHEET.root.parentNode !== div) div.append(SHEET.root);
  const below = SHEET.mode === 'below';
  markEditing(div);
  if (!below) div.classList.add('sheeting');
  const page = S.pages[span.page];
  const last = (S.regions[SHEET.range.id] || []).slice(-1)[0] || span;
  SHEET.root.style.left = `${marginPt() * S.scale}px`;
  SHEET.root.style.width = `${(page.w - 2 * marginPt()) * S.scale}px`;
  SHEET.root.style.top = `${(below ? last.y1 + 14 : span.y0) * S.scale}px`;
  SHEET.root.style.minHeight = below ? '0' : `${(span.y1 - span.y0) * S.scale}px`;
  SHEET.root.style.fontFamily = docFont();
  SHEET.root.style.fontSize = `${(parseFloat(S.settings['font-size']) || 12) * 0.92 * S.scale}px`;
  SHEET.root.style.setProperty('--pt', `${S.scale}px`);
}

function openSheet(range) {
  closeSheet();
  if (!sheetable(range)) return;
  const grid = parseGrid(S.panel.model.body);
  if (!grid.rows.length) return;
  SHEET.grid = grid;
  SHEET.range = range;
  SHEET.mode = sheetMode(range);
  SHEET.picked = new Set();
  SHEET.active = null;
  SHEET.root = h('div', { class: `sheet${SHEET.mode === 'below' ? ' below' : ''}` }, sheetBar(SHEET.mode), h('div', { class: 'sheet-scroll' }, h('table', { class: 'sheet-table' })));
  const table = SHEET.root.querySelector('table');
  table.addEventListener('input', () => sheetCommit());
  table.addEventListener('keydown', sheetKeys);
  table.addEventListener('focusin', (event) => {
    const td = event.target.closest('td[data-r]');
    if (td) SHEET.active = td;
  });
  table.addEventListener('paste', (event) => {
    const td = event.target.closest('td[data-r]');
    const text = (event.clipboardData || window.clipboardData).getData('text/plain');
    if (!td) return;
    event.preventDefault();
    if (/[\t\n]/.test(text.trim())) pasteGrid(td, text);
    else document.execCommand('insertText', false, text.replace(/\s+/g, ' '));
  });
  table.addEventListener('mousedown', (event) => {
    const handle = event.target.closest('.row-handle, .col-handle, .corner');
    const rows = SHEET.grid.rows.length;
    const width = SHEET.grid.rows[0].length;
    if (handle) {
      event.preventDefault();
      if (handle.classList.contains('corner')) pickRect([0, 0], [rows - 1, width - 1]);
      else if (handle.classList.contains('row-handle')) {
        const r = Number(handle.dataset.r);
        pickRect(event.shiftKey && SHEET.anchor ? [SHEET.anchor[0], 0] : [r, 0], [r, width - 1]);
        if (!event.shiftKey) SHEET.anchor = [r, 0];
      } else {
        const c = Number(handle.dataset.c);
        pickRect(event.shiftKey && SHEET.anchor ? [0, SHEET.anchor[1]] : [0, c], [rows - 1, c]);
        if (!event.shiftKey) SHEET.anchor = [0, c];
      }
      if (SHEET.picked.size === 0) SHEET.picked = new Set([cellKey(handle.dataset.r || 0, handle.dataset.c || 0)]);
      paintPicked();
      return;
    }
    const td = event.target.closest('td[data-r]');
    if (!td) return;
    const here = [Number(td.dataset.r), Number(td.dataset.c)];
    if (event.shiftKey && SHEET.anchor) {
      event.preventDefault();
      pickRect(SHEET.anchor, here);
      return;
    }
    SHEET.anchor = here;
    SHEET.picked = new Set();
    paintPicked();
    let dragging = false;
    const over = (move) => {
      const cell = move.target.closest && move.target.closest('td[data-r]');
      if (!cell || !SHEET.root.contains(cell)) return;
      const there = [Number(cell.dataset.r), Number(cell.dataset.c)];
      if (!dragging && there[0] === here[0] && there[1] === here[1]) return;
      dragging = true;
      window.getSelection().removeAllRanges();
      pickRect(here, there);
    };
    const up = () => {
      table.removeEventListener('mouseover', over);
      window.removeEventListener('mouseup', up);
    };
    table.addEventListener('mouseover', over);
    window.addEventListener('mouseup', up);
  });
  drawSheet();
  positionSheet();
}

function refreshSheet() {
  if (!SHEET.root || !S.panel) return;
  SHEET.grid = parseGrid(S.panel.model.body);
  drawSheet();
}

function closeSheet() {
  if (SHEET.root && S.panel && SHEET.root.contains(document.activeElement)) readSheet();
  if (SHEET.root) {
    SHEET.root.remove();
    markEditing(null);
    document.querySelectorAll('#pages > .page.sheeting').forEach((page) => page.classList.remove('sheeting'));
  }
  SHEET.root = null;
  SHEET.range = null;
  SHEET.picked = new Set();
  SHEET.active = null;
}
