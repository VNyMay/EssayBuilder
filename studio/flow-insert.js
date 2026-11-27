const FLOW_ACTIONS = [
  { id: 'cite', label: 'Citation', icon: 'bibliography', group: 'Text', hint: '@', words: 'cite source reference quote', action: () => flowCitePop(flowCaretAnchor()) },
  { id: 'footnote', label: 'Footnote', icon: 'footnote', group: 'Text', words: 'note endnote', action: () => flowNewChip('note') },
];

function flowRunAction(item) {
  const go = () => {
    FLOW.editor.commands.focus();
    item.action();
  };
  if (FLOW.on && FLOW.editor) return go();
  flowShow(true);
  requestAnimationFrame(() => requestAnimationFrame(go));
}

function flowPaletteActions() {
  const head = [...document.querySelectorAll('#palette .palette-group')].find((node) => node.textContent === 'Text');
  const grid = head && head.nextElementSibling;
  if (!grid || grid.querySelector('.palette-action')) return;
  const tint = getComputedStyle(grid.firstElementChild || grid).getPropertyValue('--tint') || '#fbbc04';
  FLOW_ACTIONS.forEach((item, i) => {
    const tile = h('button', { class: 'palette-action', html: `${icon(item.icon, 26)}<span>${item.label}</span>`, title: item.label, style: `--tint:${tint};--i:${grid.children.length + i}` });
    tile.template = item;
    tile.addEventListener('click', () => {
      conceal($('#palette'));
      flowRunAction(item);
    });
    grid.append(tile);
  });
}

function flowSlashCheck() {
  if (!FLOW.editor) return;
  const { state } = FLOW.editor;
  const sel = state.selection;
  if (!sel.empty || !sel.$from.parent.isTextblock || sel.$from.parent.type.name === 'heading') return flowSlashClose();
  const before = sel.$from.parent.textBetween(0, sel.$from.parentOffset, '￼');
  const at = before.match(/(?:^|[\s(])@([\w:.-]*)$/);
  if (at) return flowAtCheck(at[1], sel.from - at[1].length - 1, sel.from);
  const match = before.match(/(?:^|\s)\/([\w-]*)$/);
  if (!match) return flowSlashClose();
  const term = match[1];
  const from = sel.from - term.length - 1;
  if (FLOW.slash && FLOW.slash.mode === 'at') flowSlashClose();
  const low = term.toLowerCase();
  const rank = (template) => {
    const label = template.label.toLowerCase();
    if (!low) return 0;
    if (label.startsWith(low)) return 0;
    if (label.split(/[^a-z0-9]+/).some((word) => word.startsWith(low))) return 1;
    return 2;
  };
  const list = [...FLOW_ACTIONS, ...TEMPLATES].map((template, order) => ({ template, order }))
    .filter(({ template }) => !term || templateMatches(template, term) || (template.words && templateMatches({ label: template.words, group: '' }, term)))
    .sort((a, b) => rank(a.template) - rank(b.template) || a.order - b.order)
    .map(({ template }) => template)
    .slice(0, 12);
  if (!FLOW.slash) {
    FLOW.slash = { box: h('div', { class: 'fmenu fslash' }), index: 0 };
    document.body.append(FLOW.slash.box);
  }
  Object.assign(FLOW.slash, { from, to: sel.from, list, term });
  FLOW.slash.index = Math.min(FLOW.slash.index, Math.max(0, list.length - 1));
  flowSlashDraw();
}

function flowAtItems() {
  const out = [];
  const kinds = { fig: 'Figure', tbl: 'Table', eq: 'Equation', sec: 'Section', code: 'Listing', def: 'Definition', thm: 'Theorem' };
  Object.keys(S.labels || {}).forEach((key) => {
    const kind = key.split(':')[0];
    out.push({ label: S.labels[key], group: kinds[kind] || 'Reference', icon: kind === 'tbl' ? 'table' : kind === 'sec' ? 'heading' : kind === 'eq' ? 'equation' : 'image', chip: 'ref', src: `@${key}`, words: `${key} ${S.labels[key]}` });
  });
  Object.keys(S.sources || {}).forEach((key) => {
    const info = S.sources[key];
    const title = String((info && (info.label || info.title)) || info || key);
    out.push({ label: title, group: 'Source', icon: 'bibliography', chip: 'cite', src: `[@${key}]`, words: `${key} ${title}`, hint: 'Cite' });
  });
  return out;
}

function flowAtCheck(term, from, to) {
  const low = term.toLowerCase();
  const list = flowAtItems().filter((item) => !low || item.words.toLowerCase().includes(low)).slice(0, 11);
  if (low.length >= 2) {
    const blocks = [...FLOW_ACTIONS, ...TEMPLATES].filter((template) => templateMatches(template, low) || (template.words && templateMatches({ label: template.words, group: '' }, low)));
    blocks.slice(0, Math.max(3, 9 - list.length)).forEach((template) => list.push({ label: template.label, group: 'Insert', icon: template.icon || 'box', hint: 'Insert', insert: template, words: '' }));
  }
  if (typeof openSourceLookup === 'function') list.push({ label: 'Add a new source', group: 'Source', icon: 'plus', hint: 'DOI, ISBN or link', addSource: true, words: '' });
  if (FLOW.slash && FLOW.slash.mode !== 'at') flowSlashClose();
  if (!FLOW.slash) {
    FLOW.slash = { box: h('div', { class: 'fmenu fslash' }), index: 0, mode: 'at' };
    document.body.append(FLOW.slash.box);
  }
  Object.assign(FLOW.slash, { from, to, list, term });
  FLOW.slash.index = Math.min(FLOW.slash.index, Math.max(0, list.length - 1));
  flowSlashDraw();
}

function flowSlashDraw() {
  const slash = FLOW.slash;
  const { box, list } = slash;
  box.replaceChildren(...list.map((template, i) => {
    const row = h('button', { type: 'button', class: `frow${i === slash.index ? ' on' : ''}` }, h('span', { class: 'frow-icon', html: icon(template.icon || 'box', 17) }), h('span', { class: 'frow-main', text: template.label }), h('span', { class: 'frow-hint', text: template.hint || template.group }));
    row.addEventListener('mousedown', (event) => {
      event.preventDefault();
      flowSlashRun(i);
    });
    return row;
  }));
  if (!list.length) box.append(h('div', { class: 'fempty', text: slash.mode === 'at' ? 'No figures, tables or sources yet' : 'Nothing found' }));
  const at = FLOW.editor.view.coordsAtPos(slash.from);
  const zoom = parseFloat(getComputedStyle(box).zoom) || 1;
  const size = box.getBoundingClientRect();
  const below = at.bottom + 6;
  box.style.left = `${Math.max(8, Math.min(window.innerWidth - size.width - 8, at.left)) / zoom}px`;
  box.style.top = `${(below + size.height > window.innerHeight - 8 ? Math.max(8, at.top - 6 - size.height) : below) / zoom}px`;
  const on = box.querySelector('.frow.on');
  if (on) on.scrollIntoView({ block: 'nearest' });
}

function flowSlashRun(i) {
  const slash = FLOW.slash;
  const template = slash && slash.list[i];
  if (!template) return;
  if (slash.mode === 'at' && template.insert) {
    flowSlashClose();
    FLOW.editor.view.dispatch(FLOW.editor.state.tr.delete(slash.from, slash.to));
    if (template.insert.action) template.insert.action();
    else flowInsertTemplate(template.insert);
    return;
  }
  if (slash.mode === 'at' && template.addSource) {
    flowSlashClose();
    FLOW.editor.view.dispatch(FLOW.editor.state.tr.delete(slash.from, slash.to));
    FLOW.keep = { from: slash.from, to: slash.from };
    openSourceLookup({
      onInsert: (key, info) => {
        flowPull();
        const spot = FLOW.keep || { from: slash.from, to: slash.from };
        FLOW.keep = null;
        flowPutCite(spot.from, spot.to, key, (info && info.label) || `(${key})`);
      },
    });
    return;
  }
  if (slash.mode === 'at') {
    flowSlashClose();
    const node = FLOW.editor.schema.nodes.chip.create({ kind: template.chip, src: template.src, label: template.label });
    const tr = FLOW.editor.state.tr.replaceWith(slash.from, slash.to, node);
    FLOW.editor.view.dispatch(tr.setSelection(TT.TextSelection.create(tr.doc, slash.from + 1)));
    return;
  }
  FLOW.editor.view.dispatch(FLOW.editor.state.tr.delete(slash.from, slash.to));
  flowSlashClose(true);
  if (template.action) return template.action();
  flowInsertTemplate(template);
}

function flowSlashClose() {
  if (!FLOW.slash) return;
  FLOW.slash.box.remove();
  FLOW.slash = null;
}

function flowSlashKey(event) {
  if (!FLOW.slash) return false;
  const slash = FLOW.slash;
  if (event.key === 'ArrowDown') {
    slash.index = Math.min(slash.list.length - 1, slash.index + 1);
    flowSlashDraw();
    return true;
  }
  if (event.key === 'ArrowUp') {
    slash.index = Math.max(0, slash.index - 1);
    flowSlashDraw();
    return true;
  }
  if (event.key === 'Enter' || event.key === 'Tab') {
    if (!slash.list.length) return false;
    flowSlashRun(slash.index);
    return true;
  }
  if (event.key === 'Escape') {
    flowSlashClose();
    return true;
  }
  return false;
}

function flowFindOpen(replace) {
  if (!FLOW.find) {
    const input = h('input', { type: 'text', class: 'ffind-in', placeholder: 'Find', spellcheck: 'false' });
    const swap = h('input', { type: 'text', class: 'ffind-in', placeholder: 'Replace with', spellcheck: 'false' });
    const count = h('span', { class: 'ffind-count' });
    const caseBtn = h('button', { type: 'button', class: 'fbtn small', text: 'Aa', title: 'Match case' });
    const up = h('button', { type: 'button', class: 'fbtn small', html: icon('up', 15), title: 'Previous (Shift+Enter)' });
    const down = h('button', { type: 'button', class: 'fbtn small', html: icon('down', 15), title: 'Next (Enter)' });
    const more = h('button', { type: 'button', class: 'fbtn small', html: icon('chevron', 15), title: 'Replace' });
    const close = h('button', { type: 'button', class: 'fbtn small', html: icon('close', 15), title: 'Close (Esc)' });
    const one = h('button', { type: 'button', class: 'pill ghost small', text: 'Replace' });
    const all = h('button', { type: 'button', class: 'pill ghost small', text: 'All' });
    const swapRow = h('div', { class: 'ffind-row swap' }, swap, one, all);
    const box = h('div', { id: 'ffind' }, h('div', { class: 'ffind-row' }, more, input, count, caseBtn, up, down, close), swapRow);
    document.body.append(box);
    FLOW.find = { box, input, swap, count, caseBtn, swapRow, cs: false };
    const push = (meta) => {
      FLOW.editor.view.dispatch(FLOW.editor.state.tr.setMeta(FLOW_FIND_KEY, meta).setMeta('addToHistory', false));
      flowFindCount();
      flowFindReveal();
    };
    input.addEventListener('input', () => push({ term: input.value, index: 0 }));
    const step = (dir) => {
      const state = FLOW_FIND_KEY.getState(FLOW.editor.state);
      if (!state.matches.length) return;
      push({ index: (state.index + dir + state.matches.length) % state.matches.length });
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        step(event.shiftKey ? -1 : 1);
      } else if (event.key === 'Escape') flowFindClose();
    });
    swap.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        one.dispatchEvent(new MouseEvent('mousedown'));
      } else if (event.key === 'Escape') flowFindClose();
    });
    const press = (node, run) => node.addEventListener('mousedown', (event) => {
      event.preventDefault();
      run();
    });
    press(up, () => step(-1));
    press(down, () => step(1));
    press(close, flowFindClose);
    press(more, () => {
      box.classList.toggle('with-swap');
      if (box.classList.contains('with-swap')) setTimeout(() => swap.focus(), 10);
    });
    press(caseBtn, () => {
      FLOW.find.cs = !FLOW.find.cs;
      caseBtn.classList.toggle('on', FLOW.find.cs);
      push({ cs: FLOW.find.cs, index: 0 });
    });
    press(one, () => {
      const state = FLOW_FIND_KEY.getState(FLOW.editor.state);
      const match = state.matches[state.index];
      if (!match) return;
      FLOW.editor.view.dispatch(FLOW.editor.state.tr.insertText(swap.value, match.from, match.to));
      flowFindCount();
      flowFindReveal();
    });
    press(all, () => {
      const state = FLOW_FIND_KEY.getState(FLOW.editor.state);
      if (!state.matches.length) return;
      let tr = FLOW.editor.state.tr;
      [...state.matches].reverse().forEach((match) => {
        tr = tr.insertText(swap.value, match.from, match.to);
      });
      const done = state.matches.length;
      FLOW.editor.view.dispatch(tr);
      flowFindCount();
      toast(`Replaced ${done}`);
    });
  }
  const { box, input } = FLOW.find;
  box.classList.toggle('with-swap', replace || box.classList.contains('with-swap'));
  reveal(box);
  const { from, to } = FLOW.editor.state.selection;
  const picked = FLOW.editor.state.doc.textBetween(from, to, ' ');
  if (picked && picked.length < 80 && !picked.includes('\n')) input.value = picked;
  input.focus();
  input.select();
  FLOW.editor.view.dispatch(FLOW.editor.state.tr.setMeta(FLOW_FIND_KEY, { term: input.value, index: 0 }).setMeta('addToHistory', false));
  flowFindCount();
}

function flowFindCount() {
  if (!FLOW.find || FLOW.find.box.hidden) return;
  const state = FLOW_FIND_KEY.getState(FLOW.editor.state);
  FLOW.find.count.textContent = state.term ? (state.matches.length ? `${state.index + 1} of ${state.matches.length}` : 'No results') : '';
}

function flowFindReveal() {
  const state = FLOW_FIND_KEY.getState(FLOW.editor.state);
  const match = state.matches[state.index];
  if (!match) return;
  const at = FLOW.editor.view.coordsAtPos(match.from);
  const scroll = $('#scroll');
  const box = scroll.getBoundingClientRect();
  if (at.top < box.top + 120 || at.bottom > box.bottom - 120) scroll.scrollBy({ top: at.top - box.top - box.height / 3, behavior: 'smooth' });
}

function flowFindClose() {
  if (!FLOW.find) return;
  conceal(FLOW.find.box);
  FLOW.editor.view.dispatch(FLOW.editor.state.tr.setMeta(FLOW_FIND_KEY, { term: '' }).setMeta('addToHistory', false));
  FLOW.editor.commands.focus();
}
