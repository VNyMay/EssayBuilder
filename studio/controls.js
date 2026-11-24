const SWATCHES = ['#1f4e79', '#c0392b', '#2e7d32', '#d98200', '#6a3d9a', '#0e8a8a', '#8c564b', '#141414'];
const MERMAID_KINDS = ['sequence', 'er', 'class', 'state', 'gantt', 'journey', 'quadrant', 'sankey', 'radar', 'requirement', 'packet', 'gitgraph'];
const VISUAL = new Set([
  'figure', 'image', 'figures', 'map', 'chart', 'table', 'pipetable', 'diagram', 'flow', 'mindmap', 'tree',
  'timeline', 'grid', 'swot', 'molecule', 'music', ...MERMAID_KINDS,
]);
const WIDTH_CHIPS = [25, 50, 75, 100];

const isVisual = (kind) => VISUAL.has(kind);

const alignKeyOf = (kind) => (kind === 'table' || kind === 'pipetable' ? 'place' : 'align');

function defaultWidth(kind, wrapped) {
  if (wrapped) return 40;
  if (kind === 'map') return 100;
  if (kind === 'table' || kind === 'pipetable') return 62;
  return 86;
}

function parseWidth(value) {
  const match = String(value || '').trim().match(/^(\d+(?:\.\d+)?)\s*%$/);
  return match ? Number(match[1]) : null;
}

function rowGet(model, key, fallback = '') {
  const row = model.rows.find((item) => item.key === key);
  return row ? row.value : fallback;
}

function promote(model, range) {
  if (model.kind !== 'pipetable') return;
  model.kind = 'table';
  model.name = 'table';
  model.args = '';
  model.closed = true;
  const target = range || (S.panel && S.panel.range);
  if (target) target.kind = 'table';
}

function rowSet(model, key, value, range) {
  if (model.kind === 'pipetable' && !['caption', 'id'].includes(key) && value !== '' && value !== null && value !== undefined) promote(model, range);
  const index = model.rows.findIndex((item) => item.key === key);
  if (value === '' || value === null || value === undefined) {
    if (index >= 0) model.rows.splice(index, 1);
    return;
  }
  if (index >= 0) model.rows[index].value = String(value);
  else model.rows.push({ key, value: String(value) });
}

function applyLayout(model, patch, range) {
  const set = (key, value) => rowSet(model, key, value, range);
  const wrapKeys = 'wrap' in patch;
  if ('width' in patch) {
    set('width', patch.width);
    if (parseWidth(patch.width) >= 100 && rowGet(model, 'wrap')) set('wrap', '');
  }
  const alignKey = alignKeyOf(model.kind);
  if ('align' in patch) {
    set(alignKey, patch.align === 'center' ? '' : patch.align);
    if (patch.align && rowGet(model, 'wrap')) set('wrap', '');
  }
  if (wrapKeys) {
    const wrap = patch.wrap === 'no' ? '' : patch.wrap;
    set('wrap', wrap);
    if (wrap) {
      set(alignKey, '');
      const width = parseWidth(rowGet(model, 'width'));
      if (width === null || width > 70) set('width', '40%');
    }
  }
}

function layoutOf(model, kind) {
  const wrap = rowGet(model, 'wrap');
  const width = parseWidth(rowGet(model, 'width'));
  const align = rowGet(model, alignKeyOf(model.kind)) || 'center';
  const wrapped = wrap === 'left' || wrap === 'right';
  return { wrap: wrapped ? wrap : '', align, width: width === null ? defaultWidth(kind, wrapped) : width, set: width !== null };
}

function writeLayout(range, patch) {
  const live = S.panel && S.panel.range === range ? S.panel.model : null;
  const model = live || parseBlock(range.kind, linesOf(range));
  if (model.kind === 'raw') return;
  applyLayout(model, patch, range);
  setRangeLines(range, serializeBlock(model));
  lockHits();
  schedule(200);
  if (live && S.panel) renderPanel();
  placeOverlays();
}

function section(title, ...kids) {
  return h('div', { class: 'sec' }, title ? h('div', { class: 'group-title', text: title }) : null, ...kids);
}

function line(label, control, hint = '') {
  return h('div', { class: 'line', title: hint }, h('label', { text: label }), control);
}

function stackLine(label, control) {
  return h('div', { class: 'line stack' }, label ? h('label', { text: label }) : null, control);
}

function segmented(options, value, onPick) {
  const box = h('div', { class: 'segments seg' });
  options.forEach((option) => {
    const button = h('button', {
      type: 'button',
      class: `${option.value === value ? 'on' : ''}${option.disabled ? ' off' : ''}`,
      title: option.title || option.label || '',
      html: `${option.icon ? icon(option.icon, 16) : ''}${option.label ? `<span>${option.label}</span>` : ''}`,
      onclick: () => {
        if (option.disabled) return;
        box.querySelectorAll('button').forEach((item) => item.classList.remove('on'));
        button.classList.add('on');
        placeThumb();
        onPick(option.value);
      },
    });
    box.append(button);
  });
  const thumb = h('span', { class: 'seg-thumb' });
  box.prepend(thumb);
  box.classList.add('has-thumb');
  const placeThumb = () => {
    const active = box.querySelector('button.on');
    if (!active || !active.offsetWidth) {
      thumb.style.width = '0px';
      return;
    }
    thumb.style.left = `${active.offsetLeft}px`;
    thumb.style.width = `${active.offsetWidth}px`;
  };
  const settle = () => {
    placeThumb();
    if (thumb.style.width !== '0px') requestAnimationFrame(() => box.classList.add('ready'));
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(settle).observe(box);
  requestAnimationFrame(settle);
  return box;
}

function slider({ min, max, step = 1, value, unit = '', onInput, auto = false, decimals = 0 }) {
  const range = h('input', { type: 'range', min, max, step });
  const number = h('input', { type: 'number', min, max, step, class: 'num' });
  const paint = () => {
    const fraction = (Number(range.value) - min) / (max - min);
    range.style.setProperty('--fill', `${Math.max(0, Math.min(1, fraction)) * 100}%`);
  };
  range.value = value;
  number.value = auto ? '' : Number(value).toFixed(decimals);
  number.placeholder = auto ? 'Auto' : '';
  paint();
  range.addEventListener('input', () => {
    number.value = Number(range.value).toFixed(decimals);
    paint();
    onInput(Number(range.value));
  });
  number.addEventListener('input', () => {
    const next = Math.max(min, Math.min(max, Number(number.value)));
    if (number.value === '' || Number.isNaN(next)) return;
    range.value = next;
    paint();
    onInput(next);
  });
  const box = h('div', { class: 'slider' }, range, h('div', { class: 'num-wrap' }, number, unit ? h('span', { text: unit }) : null));
  box.set = (next) => {
    range.value = next;
    number.value = Number(next).toFixed(decimals);
    paint();
  };
  return box;
}

function cards(options, value, onPick, columns = 3) {
  const box = h('div', { class: 'cards', style: `grid-template-columns:repeat(${columns},1fr)` });
  options.forEach((option) => {
    const card = h('button', {
      type: 'button',
      class: `card${option.value === value ? ' on' : ''}`,
      title: option.title || option.label,
      html: `<span class="art">${option.art || ''}</span><span class="cap">${option.label}</span>`,
      onclick: () => {
        box.querySelectorAll('.card').forEach((item) => item.classList.remove('on'));
        card.classList.add('on');
        onPick(option.value);
      },
    });
    box.append(card);
  });
  return box;
}

function switchField(on, onChange, title = '') {
  const box = h('input', { type: 'checkbox', title });
  box.checked = on;
  box.addEventListener('change', () => onChange(box.checked));
  return h('div', { class: 'field' }, box);
}

function stepper({ value, min, max, step = 1, onChange }) {
  const input = h('input', { type: 'number', min, max, step, class: 'num' });
  input.value = value;
  const move = (direction) => {
    const next = Math.max(min, Math.min(max, Number(input.value || 0) + direction * step));
    input.value = String(Number(next.toFixed(4)));
    onChange(Number(input.value));
  };
  input.addEventListener('input', () => {
    if (input.value !== '') onChange(Math.max(min, Math.min(max, Number(input.value))));
  });
  return h(
    'div',
    { class: 'stepper' },
    h('button', { type: 'button', html: icon('minus', 14), title: 'Less', onclick: () => move(-1) }),
    input,
    h('button', { type: 'button', html: icon('plus', 14), title: 'More', onclick: () => move(1) }),
  );
}

function colourPicker(value, onPick, allowAuto = true) {
  const box = h('div', { class: 'colours' });
  const custom = h('button', { type: 'button', class: 'swatch-dot custom', title: 'Custom colour', html: icon('plus', 12) });
  const mark = () => {
    box.querySelectorAll('.swatch-dot').forEach((item) => item.classList.toggle('on', item.dataset.colour === (value || '')));
    const own = Boolean(value) && !SWATCHES.includes(value);
    custom.classList.toggle('on', own);
    custom.style.background = own ? value : '';
    custom.classList.toggle('filled', own);
  };
  if (allowAuto) {
    box.append(h('button', { type: 'button', class: 'swatch-dot auto', 'data-colour': '', title: 'Automatic', onclick: () => {
      value = '';
      mark();
      onPick('');
    } }));
  }
  SWATCHES.forEach((colour) => {
    box.append(h('button', { type: 'button', class: 'swatch-dot', 'data-colour': colour, title: colour, style: `background:${colour}`, onclick: () => {
      value = colour;
      mark();
      onPick(colour);
    } }));
  });
  custom.addEventListener('click', () => openColourPop(custom, value, (colour) => {
    value = colour;
    mark();
    onPick(colour);
  }));
  box.append(custom);
  mark();
  return box;
}

function fileKind(path) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(path) ? 'image' : 'file';
}

function fileUrl(path) {
  if (!path || /^[a-z]:|^[\\/]|^file:/i.test(path)) return '';
  return `/file/${path.split('/').map(encodeURIComponent).join('/')}`;
}

function fileChooser({ value, accept = '', onPick, label = 'Choose file' }) {
  const name = value ? value.split(/[\\/]/).pop() : '';
  const url = value && fileKind(value) === 'image' ? fileUrl(value) : '';
  const thumb = h('div', { class: 'thumb' });
  if (url) thumb.append(h('img', { src: url, alt: '' }));
  else thumb.innerHTML = icon(fileKind(value) === 'image' ? 'image' : 'file', 22);
  const change = h('button', {
    type: 'button',
    class: 'pill ghost small',
    html: `${icon('upload', 15)}<span>${name ? 'Change' : label}</span>`,
    onclick: async () => {
      const file = await pickFile(accept);
      if (!file) return;
      const path = await upload(file);
      if (path) onPick(path);
    },
  });
  return h('div', { class: 'chooser' }, thumb, h('div', { class: 'chooser-text' }, h('span', { class: 'chooser-name', text: name || 'No file', title: value || '' }), change));
}

const headerCache = new Map();

async function headerOf(path) {
  const url = fileUrl(path);
  if (!url || !/\.(csv|tsv|txt)$/i.test(path)) return [];
  if (headerCache.has(path)) return headerCache.get(path);
  let header = [];
  try {
    const text = await (await fetch(url)).text();
    const first = text.replace(/^﻿/, '').split(/\r?\n/)[0] || '';
    header = first.split(first.includes('\t') ? '\t' : ',').map((cell) => cell.trim().replace(/^"|"$/g, '')).filter(Boolean);
  } catch (error) {
    header = [];
  }
  headerCache.set(path, header);
  return header;
}

function columnPicker({ path, value, onPick, none = 'Automatic' }) {
  const holder = h('div', { class: 'field' });
  const text = h('input', { type: 'text', spellcheck: 'false' });
  text.value = value;
  text.addEventListener('input', () => onPick(text.value));
  holder.append(text);
  headerOf(path).then((header) => {
    if (!header.length) return;
    const choices = [{ value: '', label: none }, ...header.map((name) => ({ value: name, label: name }))];
    if (value && !header.includes(value)) choices.push({ value, label: value });
    holder.replaceChildren(dropdown({ choices, value, onPick }));
  });
  return holder;
}

function splitPipeLine(text) {
  const inner = text.trim().replace(/^\|/, '').replace(/\|$/, '');
  return inner.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

function parseGrid(lines) {
  const used = lines.filter((item) => item.trim());
  if (!used.length) return { rows: [['', ''], ['', '']], sep: null, csv: false };
  const pipe = used[0].trim().startsWith('|');
  if (!pipe) {
    const tab = used[0].includes('\t');
    return { rows: used.map((item) => item.split(tab ? '\t' : ',').map((cell) => cell.trim())), sep: null, csv: true, tab };
  }
  const rows = [];
  let sep = null;
  used.forEach((item) => {
    const cells = splitPipeLine(item);
    if (rows.length === 1 && !sep && cells.every((cell) => /^:?-{2,}:?$/.test(cell))) sep = cells;
    else rows.push(cells);
  });
  return { rows, sep, csv: false };
}

function serializeGrid(grid) {
  const width = Math.max(...grid.rows.map((row) => row.length));
  const rows = grid.rows.map((row) => [...row, ...Array(width - row.length).fill('')]);
  if (grid.csv) return rows.map((row) => row.join(grid.tab ? '\t' : ','));
  const sep = grid.sep && grid.sep.length === width ? grid.sep : Array(width).fill('---');
  const out = rows.map((row) => `| ${row.join(' | ')} |`);
  out.splice(1, 0, `|${sep.map((cell) => ` ${cell} `).join('|')}|`);
  return out;
}

function dataGrid(lines, onChange) {
  const grid = parseGrid(lines);
  const box = h('div', { class: 'grid-edit' });
  const emit = () => onChange(serializeGrid(grid));
  const build = () => {
    const width = Math.max(...grid.rows.map((row) => row.length));
    grid.rows = grid.rows.map((row) => [...row, ...Array(width - row.length).fill('')]);
    const table = h('div', { class: 'cells', style: `grid-template-columns:repeat(${width},minmax(104px,1fr)) 24px` });
    for (let c = 0; c < width; c += 1) {
      table.append(h('button', {
        type: 'button',
        class: 'cut',
        html: icon('close', 11),
        title: 'Remove column',
        disabled: width < 2,
        onclick: () => {
          grid.rows.forEach((row) => row.splice(c, 1));
          if (grid.sep) grid.sep.splice(c, 1);
          build();
          emit();
        },
      }));
    }
    table.append(h('span'));
    grid.rows.forEach((row, r) => {
      row.forEach((cell, c) => {
        const input = h('input', { type: 'text', class: `cell${r === 0 ? ' head' : ''}`, spellcheck: 'false' });
        input.value = cell;
        input.addEventListener('input', () => {
          grid.rows[r][c] = input.value;
          emit();
        });
        table.append(input);
      });
      table.append(h('button', {
        type: 'button',
        class: 'cut',
        html: icon('close', 11),
        title: 'Remove row',
        disabled: grid.rows.length < 2,
        onclick: () => {
          grid.rows.splice(r, 1);
          build();
          emit();
        },
      }));
    });
    const add = h(
      'div',
      { class: 'grid-add' },
      h('button', { type: 'button', class: 'pill ghost small', html: `${icon('plus', 14)}<span>Row</span>`, onclick: () => {
        grid.rows.push(Array(width).fill(''));
        build();
        emit();
      } }),
      h('button', { type: 'button', class: 'pill ghost small', html: `${icon('plus', 14)}<span>Column</span>`, onclick: () => {
        grid.rows.forEach((row, r) => row.push(r === 0 ? `Column ${width + 1}` : ''));
        if (grid.sep) grid.sep.push('---');
        build();
        emit();
      } }),
    );
    box.replaceChildren(h('div', { class: 'cells-wrap' }, table), add);
  };
  build();
  return box;
}

function tagPicker(value, choices, onChange, label = 'Add place') {
  const items = value.split(/\s*[,;]\s*/).filter(Boolean);
  const box = h('div', { class: 'tags' });
  items.forEach((item, index) => {
    box.append(
      h('span', { class: 'tag' }, h('span', { text: item.charAt(0).toUpperCase() + item.slice(1) }), h('button', {
        type: 'button',
        html: icon('close', 11),
        title: 'Remove',
        onclick: () => {
          items.splice(index, 1);
          onChange(items.join(', '));
        },
      })),
    );
  });
  const present = new Set(items.map((item) => item.toLowerCase()));
  const options = choices.filter((choice) => !present.has(choice.toLowerCase())).map((choice) => ({ value: choice, label: choice }));
  if (options.length) {
    box.append(dropdown({
      choices: options,
      value: '',
      label,
      keep: true,
      className: 'add',
      leading: icon('plus', 15),
      onPick: (picked) => onChange([...items, picked].join(', ')),
    }));
  }
  return box;
}

function art(markup, width = 54, height = 36) {
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${markup}</svg>`;
}

const LOOK_ART = {
  classic: art('<path d="M6 6h42M6 12h42M6 30h42" /><path d="M6 18h42M6 24h42" style="stroke:var(--line-strong)"/>'),
  grid: art('<rect x="6" y="6" width="42" height="24" rx="2"/><path d="M6 14h42M6 22h42M20 6v24M34 6v24" style="stroke:var(--line-strong)"/>'),
  striped: art('<rect x="6" y="6" width="42" height="7" style="fill:var(--line);stroke:none"/><rect x="6" y="20" width="42" height="7" style="fill:var(--line);stroke:none"/><path d="M6 6h42M6 30h42"/>'),
  minimal: art('<path d="M6 12h42" /><path d="M6 6h42M6 18h42M6 24h42M6 30h42" style="stroke:var(--line-strong)"/>'),
};

const CHART_ART = {
  line: art('<path d="M6 28l10-10 9 5 11-14 12 6"/>'),
  scatter: art('<circle cx="10" cy="26" r="1.6"/><circle cx="19" cy="17" r="1.6"/><circle cx="27" cy="22" r="1.6"/><circle cx="36" cy="11" r="1.6"/><circle cx="45" cy="15" r="1.6"/>'),
  bar: art('<path d="M10 30V18M22 30V9M34 30V15M46 30V22"/>', 54, 36),
  hbar: art('<path d="M6 8h22M6 16h34M6 24h16M6 32h28"/>', 54, 38),
  hist: art('<path d="M6 30v-6h8v6M14 30V14h8v16M22 30V8h8v22M30 30V16h8v14M38 30v-9h8v9"/>'),
  pie: art('<circle cx="27" cy="18" r="12"/><path d="M27 18V6M27 18l10 7"/>'),
  donut: art('<circle cx="27" cy="18" r="12"/><circle cx="27" cy="18" r="5"/><path d="M27 6v7"/>'),
  function: art('<path d="M6 18h42M27 6v24"/><path d="M8 30q8-24 19-12t19-12" style="stroke:var(--green)"/>'),
};

const BASE_ART = {
  world: art('<path d="M8 10l10-3 9 4 8-3 10 5-3 11-9 3-10-3-8 2z" style="fill:var(--line);stroke:var(--line-strong)"/>'),
  none: art('<rect x="7" y="6" width="40" height="24" rx="3" style="stroke:var(--line-strong);stroke-dasharray:3 3"/>'),
  osm: art('<path d="M6 26l16-16 8 8 16-12M6 12l12 14M24 30l8-12M34 6l12 20" style="stroke:var(--line-strong)"/><path d="M6 20h42" style="stroke:var(--green)"/>'),
  topo: art('<path d="M8 28q6-18 18-14t20-8M12 30q6-12 14-9t18-7" style="stroke:var(--green)"/><path d="M6 32q12-6 20-2t22-6" style="stroke:var(--line-strong)"/>'),
  light: art('<rect x="6" y="5" width="42" height="26" rx="3" style="fill:var(--panel);stroke:var(--line)"/><path d="M6 15h42M22 5v26" style="stroke:var(--line-strong)"/>'),
};

function layoutSection(model, kind, range) {
  const info = layoutOf(model, kind);
  const full = info.width >= 100;
  let chips = null;
  const wrapOptions = [
    { value: 'no', icon: 'wrapOff', label: 'None', title: 'No text beside it' },
    { value: 'left', icon: 'wrapLeft', label: 'Right', title: 'Block on the left, text flows on its right' },
    { value: 'right', icon: 'wrapRight', label: 'Left', title: 'Block on the right, text flows on its left' },
  ];
  const paintChips = () => {
    if (!chips) return;
    const current = layoutOf(model, kind);
    chips.querySelectorAll('.chip').forEach((chip) => chip.classList.toggle('on', current.set && Number(chip.dataset.value) === current.width));
  };
  const widthBox = slider({
    min: 15,
    max: 100,
    step: 5,
    value: info.width,
    unit: '%',
    auto: !info.set,
    onInput: (value) => {
      applyLayout(model, { width: `${value}%` }, range);
      commitPanel(350);
      refreshLayout();
      paintChips();
    },
  });
  const wrap = h('div', { class: 'layout-live' });
  const refreshLayout = () => {
    const next = layoutOf(model, kind);
    const isFull = next.width >= 100;
    paintChips();
    wrap.replaceChildren(
      stackLine('Align', segmented([
        { value: 'left', icon: 'alignLeft', label: 'Left', title: 'Align left' },
        { value: 'center', icon: 'alignCenter', label: 'Centre', title: 'Centre' },
        { value: 'right', icon: 'alignRight', label: 'Right', title: 'Align right' },
      ], next.wrap ? '' : next.align, (value) => {
        applyLayout(model, { align: value }, range);
        commitPanel(150);
        refreshLayout();
      })),
      stackLine('Wrap text on', segmented(wrapOptions.map((option) => ({ ...option, disabled: isFull && option.value !== 'no', title: isFull && option.value !== 'no' ? 'Make it narrower first' : option.title })), next.wrap || 'no', (value) => {
        applyLayout(model, { wrap: value }, range);
        commitPanel(150);
        widthBox.set(layoutOf(model, kind).width);
        refreshLayout();
      })),
    );
  };
  refreshLayout();
  chips = h('div', { class: 'chips' }, WIDTH_CHIPS.map((value) => h('button', {
    type: 'button',
    class: 'chip',
    'data-value': value,
    text: `${value}%`,
    title: `${value}%`,
    onclick: () => {
      applyLayout(model, { width: `${value}%` }, range);
      commitPanel(150);
      widthBox.set(value);
      refreshLayout();
    },
  })));
  paintChips();
  return section('Layout', stackLine('Width', h('div', { class: 'width-box' }, widthBox, chips)), wrap);
}

function attachHandles(hit, range) {
  const model = parseBlock(range.kind, linesOf(range));
  if (model.kind === 'raw') return;
  const span = firstSpan(range);
  if (!span) return;
  const page = S.pages[span.page];
  const textPx = (page.w - 2 * marginPt()) * S.scale;
  const pad = (hit.offsetWidth || (page.w - 2 * Math.max(0, marginPt() - 10)) * S.scale) / 2 - textPx / 2;
  const state = layoutOf(model, range.kind);
  const ghost = h('div', { class: 'resize-ghost' }, h('span', { class: 'tag-live' }));
  const grips = ['left', 'right'].map((side) => h('span', { class: `grip at-${side}`, title: 'Drag to resize' }));
  const corner = h('span', { class: 'grip corner', title: 'Drag to resize' });
  const place = (percent) => {
    const px = (percent / 100) * textPx;
    let left = pad + (textPx - px) / 2;
    if (state.wrap === 'left' || (!state.wrap && state.align === 'left')) left = pad;
    else if (state.wrap === 'right' || (!state.wrap && state.align === 'right')) left = pad + textPx - px;
    ghost.style.left = `${left}px`;
    ghost.style.width = `${px}px`;
    ghost.firstChild.textContent = `${percent}%`;
  };
  place(state.width);
  ghost.append(...grips, corner);
  hit.append(ghost);
  const centred = !state.wrap && state.align === 'center';
  const start = (event, side) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startPx = (state.width / 100) * textPx;
    let percent = state.width;
    ghost.classList.add('live');
    const move = (e) => {
      const delta = (side === 'left' ? -1 : 1) * (e.clientX - startX) * (centred ? 2 : 1);
      percent = Math.max(15, Math.min(100, Math.round((((startPx + delta) / textPx) * 100) / 5) * 5));
      place(percent);
    };
    const finish = (e) => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', finish);
      ghost.classList.remove('live');
      window.__dragged = Date.now();
      if (percent !== state.width) writeLayout(range, { width: `${percent}%` });
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', finish);
  };
  grips[0].addEventListener('mousedown', (event) => start(event, 'left'));
  grips[1].addEventListener('mousedown', (event) => start(event, 'right'));
  corner.addEventListener('mousedown', (event) => start(event, 'right'));
  ghost.addEventListener('click', (event) => event.stopPropagation());
}

function toolbarLayout(range) {
  const model = parseBlock(range.kind, linesOf(range));
  if (model.kind === 'raw') return [];
  const info = layoutOf(model, range.kind);
  const align = info.wrap ? '' : info.align;
  const button = (name, title, active, onclick) => h('button', {
    class: active ? 'on' : '',
    html: icon(name, 16),
    title,
    onmousedown: keep,
    onclick,
  });
  const cycle = { '': 'left', left: 'right', right: '' };
  const wrapIcon = info.wrap === 'left' ? 'wrapLeft' : info.wrap === 'right' ? 'wrapRight' : 'wrapOff';
  const wrapTitle = info.wrap === 'left' ? 'Text on the right (click to switch)' : info.wrap === 'right' ? 'Text on the left (click to switch)' : 'Wrap text beside it';
  return [
    button('alignLeft', 'Align left', align === 'left', () => writeLayout(range, { align: 'left' })),
    button('alignCenter', 'Centre', align === 'center', () => writeLayout(range, { align: 'center' })),
    button('alignRight', 'Align right', align === 'right', () => writeLayout(range, { align: 'right' })),
    button(wrapIcon, wrapTitle, Boolean(info.wrap), () => writeLayout(range, { wrap: cycle[info.wrap] || 'no' })),
    h('span', { class: 'tsep' }),
  ];
}
