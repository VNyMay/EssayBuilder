const FLOW_STYLES = [
  { value: 'p', label: 'Text' },
  { value: 'h1', label: 'Heading' },
  { value: 'h2', label: 'Sub-heading' },
  { value: 'h3', label: 'Sub-sub-heading' },
  { value: 'quote', label: 'Quote' },
];

function flowToolbar() {
  const bar = h('div', { id: 'fbar', hidden: true });
  const btn = (name, title, run, extra = '') => {
    const b = h('button', { type: 'button', class: `fbtn ${extra}`, html: icon(name, 17), title });
    b.addEventListener('mousedown', (event) => {
      event.preventDefault();
      run(b);
    });
    b.dataset.cmd = name;
    return b;
  };
  const sep = () => h('span', { class: 'fsep' });
  const style = h('button', { type: 'button', class: 'fpick style', title: 'Text style' });
  style.addEventListener('mousedown', (event) => {
    event.preventDefault();
    const items = FLOW_STYLES.map((item) => ({ label: item.label, cls: `st-${item.value}`, on: flowBlockType() === item.value, run: () => flowSetBlock(item.value) }));
    const { $from } = FLOW.editor.state.selection;
    const top = $from.depth ? $from.node(1) : null;
    if (top && top.type.name === 'heading') items.push(...flowHeadingItems($from.before(1), top));
    flowMenu(style, items);
  });
  const size = h('button', { type: 'button', class: 'fpick size', title: 'Size' });
  size.addEventListener('mousedown', (event) => {
    event.preventDefault();
    const now = (flowFmtAt().find((item) => item.key === 'size') || {}).value;
    flowMenu(size, [{ label: 'Default', on: !now, run: () => flowSetFmt('size', '') }, ...FLOW_SIZES.map((value) => ({ label: value, on: now === value, run: () => flowSetFmt('size', value) }))]);
  });
  const font = h('button', { type: 'button', class: 'fpick font', title: 'Font' });
  font.addEventListener('mousedown', (event) => {
    event.preventDefault();
    flowFontMenu(font);
  });
  const chain = (fn) => () => fn(FLOW.editor.chain().focus()).run();
  const fx = h('button', { type: 'button', class: 'fbtn fx', title: 'More text styles: colour, highlight, strikethrough, superscript', html: '<span class="fx-a">Aa</span><span class="fx-bar"></span>' });
  fx.dataset.cmd = 'fx';
  fx.addEventListener('mousedown', (event) => {
    event.preventDefault();
    flowFxMenu(fx);
  });
  const align = btn('alignLeft', 'Align', (b) => flowMenu(b, [
    ['left', 'alignLeft', 'Left', 'Ctrl+Shift+L'],
    ['center', 'alignCenter', 'Centre', 'Ctrl+Shift+E'],
    ['right', 'alignRight', 'Right', 'Ctrl+Shift+R'],
    ['justify', 'alignJustify', 'Justify', 'Ctrl+Shift+J'],
  ].map(([value, name, label, keys]) => ({ label, icon: name, hint: keys, on: flowCurrentAlign() === value, run: () => flowAlign(value) }))), 'align');
  const add = h('button', { type: 'button', class: 'fpick addmenu', title: 'Add maths, a citation, a footnote, a table, a chart...', html: `${icon('plus', 16)}<span>Add</span>${icon('chevron', 14)}` });
  add.addEventListener('mousedown', (event) => {
    event.preventDefault();
    flowAddMenu(add);
  });
  const groups = [
    [btn('undo', 'Undo (Ctrl+Z)', chain((c) => c.undo())), btn('redo', 'Redo (Ctrl+Y)', chain((c) => c.redo()))],
    [style, font, size],
    [btn('bold', 'Bold (Ctrl+B)', chain((c) => c.toggleBold())), btn('italic', 'Italic (Ctrl+I)', chain((c) => c.toggleItalic())), btn('underline', 'Underline (Ctrl+U)', chain((c) => c.toggleUnderline())), fx],
    [align, btn('list', 'Bullets (Ctrl+Shift+8)', chain((c) => c.toggleBulletList())), btn('listOrdered', 'Numbers (Ctrl+Shift+7)', chain((c) => c.toggleOrderedList())), btn('link', 'Link', (b) => flowLinkPop(b))],
    [add],
  ];
  groups.forEach((group, index) => {
    if (index) bar.append(sep());
    bar.append(...group);
  });
  bar.append(h('span', { class: 'fgrow' }), btn('note', 'Add a note (Ctrl+Alt+M)', flowNoteAdd), btn('search', 'Find and replace (Ctrl+F)', () => flowFindOpen(false)));
  return bar;
}

function flowAddMenu(anchor) {
  const block = (label, iconName, extra = {}) => {
    const found = TEMPLATES.find((item) => item.label === label);
    return found ? { label, icon: iconName, run: () => flowInsertTemplate(found), ...extra } : null;
  };
  flowMenu(anchor, [
    { label: 'Maths', icon: 'equation', hint: 'Ctrl+M', run: () => flowNewChip('math') },
    { label: 'Citation', icon: 'bibliography', hint: '@', run: () => flowCitePop(anchor) },
    { label: 'Figure or table reference', icon: 'hash', hint: '@', run: () => flowRefPop(anchor) },
    { label: 'Footnote', icon: 'footnote', run: () => flowNewChip('note') },
    block('Table', 'table', { cls: 'sep-top' }),
    block('Chart', 'chart'),
    block('Image', 'image'),
    block('Page break', 'pagebreak', { hint: 'Ctrl+Enter' }),
    { label: 'All blocks…', icon: 'box', hint: '/', run: () => setTimeout(() => reveal($('#palette')), 0) },
  ].filter(Boolean));
}

function flowFxMenu(anchor) {
  flowPopClose();
  const editor = FLOW.editor;
  const box = h('div', { class: 'fmenu fxmenu' });
  const toggle = (name, label, active, run) => {
    const b = h('button', { type: 'button', class: `fx-toggle${active ? ' on' : ''}`, html: `${icon(name, 16)}<span>${label}</span>` });
    b.addEventListener('mousedown', (event) => {
      event.preventDefault();
      run();
      flowPopClose();
      flowPaintBar();
    });
    return b;
  };
  const swatches = (key, list) => {
    const row = h('div', { class: 'fx-swatches' });
    const none = h('button', { type: 'button', class: 'swatch none', title: 'None' });
    none.addEventListener('mousedown', (event) => {
      event.preventDefault();
      flowPopClose();
      flowSetFmt(key, '');
      if (key === 'bg') flowSetFmt('highlight', '');
    });
    row.append(none);
    list.forEach((value) => {
      const swatch = h('button', { type: 'button', class: 'swatch', title: value });
      swatch.style.background = value;
      swatch.addEventListener('mousedown', (event) => {
        event.preventDefault();
        flowPopClose();
        flowSetFmt(key, value);
      });
      row.append(swatch);
    });
    return row;
  };
  box.append(
    h('div', { class: 'fx-row' },
      toggle('strike', 'Strike', editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run()),
      toggle('superscript', 'Super', editor.isActive('superscript'), () => editor.chain().focus().toggleSuperscript().run()),
      toggle('subscript', 'Sub', editor.isActive('subscript'), () => editor.chain().focus().toggleSubscript().run())),
    h('div', { class: 'fx-label', text: 'Colour' }),
    swatches('color', FLOW_COLORS),
    h('div', { class: 'fx-label', text: 'Highlight' }),
    swatches('bg', FLOW_MARKS),
    toggle('eraser', 'Clear formatting', false, flowClearFormat),
  );
  flowPlacePop(box, anchor);
}

function flowPaintBar() {
  if (!FLOW.bar || !FLOW.editor) return;
  const editor = FLOW.editor;
  const active = {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    superscript: editor.isActive('superscript'),
    subscript: editor.isActive('subscript'),
    list: editor.isActive('bulletList'),
    listOrdered: editor.isActive('orderedList'),
    quote: editor.isActive('blockquote'),
    link: editor.isActive('rlink'),
  };
  const align = flowCurrentAlign();
  const alignName = { left: 'alignLeft', center: 'alignCenter', centre: 'alignCenter', right: 'alignRight', justify: 'alignJustify' }[align] || 'alignLeft';
  FLOW.bar.querySelectorAll('.fbtn').forEach((b) => {
    b.classList.toggle('on', Boolean(active[b.dataset.cmd]));
  });
  const alignBtn = FLOW.bar.querySelector('.fbtn.align');
  if (alignBtn && alignBtn.dataset.shown !== alignName) {
    alignBtn.dataset.shown = alignName;
    alignBtn.innerHTML = icon(alignName, 17);
  }
  const fxBtn = FLOW.bar.querySelector('.fbtn.fx');
  if (fxBtn) fxBtn.classList.toggle('on', Boolean(active.strike || active.superscript || active.subscript));
  const type = flowBlockType();
  const style = FLOW_STYLES.find((item) => item.value === type);
  const styleBtn = FLOW.bar.querySelector('.fpick.style');
  styleBtn.innerHTML = `<span>${style ? style.label : 'Text'}</span>${icon('chevron', 14)}`;
  const fmt = flowFmtAt();
  const size = (fmt.find((item) => item.key === 'size') || {}).value;
  const font = (fmt.find((item) => item.key === 'font') || {}).value;
  FLOW.bar.querySelector('.fpick.size').innerHTML = `<span>${size || (S.settings && S.settings['font-size']) || '11'}</span>${icon('chevron', 14)}`;
  const fontBtn = FLOW.bar.querySelector('.fpick.font');
  fontBtn.innerHTML = `<span>${font || (S.settings && S.settings.font) || 'Cambria'}</span>${icon('chevron', 14)}`;
  fontBtn.firstChild.style.fontFamily = `"${font || (S.settings && S.settings.font) || 'Cambria'}"`;
  const color = (fmt.find((item) => item.key === 'color') || {}).value;
  if (fxBtn) fxBtn.style.setProperty('--swatch', color || 'currentColor');
}

function flowMenu(anchor, items) {
  flowPopClose();
  const menu = h('div', { class: 'fmenu' });
  items.forEach((item) => {
    const row = h('button', { type: 'button', class: `frow${item.on ? ' on' : ''} ${item.cls || ''}` });
    if (item.icon) row.append(h('span', { class: 'frow-icon small', html: icon(item.icon, 16) }));
    const text = h('span', { class: 'frow-main', text: item.label });
    if (item.style) text.style.cssText = item.style;
    row.append(text);
    if (item.hint) row.append(h('span', { class: 'frow-hint', text: item.hint }));
    row.addEventListener('mousedown', (event) => {
      event.preventDefault();
      flowPopClose();
      item.run();
    });
    menu.append(row);
  });
  flowPlacePop(menu, anchor);
}

function flowPlacePop(node, anchor) {
  if (typeof shellToggled === 'function' && shellToggled(anchor)) {
    FLOW.closedFrom = null;
    return;
  }
  document.body.append(node);
  node.style.animation = 'none';
  const zoom = parseFloat(getComputedStyle(node).zoom) || 1;
  const rect = anchor.getBoundingClientRect();
  const box = node.getBoundingClientRect();
  const width = box.width;
  const height = box.height;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left));
  const up = rect.bottom + 6 + height > window.innerHeight - 8 && rect.top - 6 - height > 8;
  node.style.left = `${left / zoom}px`;
  node.style.top = `${(up ? rect.top - 6 - height : rect.bottom + 6) / zoom}px`;
  node.style.transformOrigin = `${Math.max(14, Math.min(width - 14, rect.left + rect.width / 2 - left)) / zoom}px ${up ? '100%' : '0'}`;
  node.style.animation = '';
  node.classList.toggle('up', up);
  FLOW.pop = node;
  FLOW.popAnchor = anchor;
  anchor.classList && anchor.classList.add('popped');
  reveal(node);
  if (typeof menuMotion === 'function') menuMotion(node);
  setTimeout(() => document.addEventListener('mousedown', flowPopOutside, true), 0);
}

function flowPopOutside(event) {
  if (FLOW.pop && !FLOW.pop.contains(event.target)) flowPopClose();
}

function flowPopClose() {
  document.removeEventListener('mousedown', flowPopOutside, true);
  if (FLOW.popAnchor && FLOW.popAnchor.classList) FLOW.popAnchor.classList.remove('popped');
  FLOW.popAnchor = null;
  if (FLOW.pop) {
    const node = FLOW.pop;
    FLOW.pop = null;
    conceal(node, true);
  }
}

function flowFontMenu(anchor) {
  const fonts = ['Cambria', 'Calibri', 'Times New Roman', 'Arial', 'Georgia', 'Garamond', 'EB Garamond', 'Lora', 'Merriweather', 'Source Serif 4', 'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'JetBrains Mono'];
  const now = (flowFmtAt().find((item) => item.key === 'font') || {}).value;
  flowMenu(anchor, [{ label: 'Document font', on: !now, run: () => flowSetFmt('font', '') }, ...fonts.map((name) => ({ label: name, on: now === name, style: `font-family:"${name}"`, run: () => flowSetFmt('font', name) }))]);
}

function flowColorMenu(anchor, key) {
  flowPopClose();
  const list = key === 'color' ? FLOW_COLORS : FLOW_MARKS;
  const box = h('div', { class: 'fmenu swatches' });
  const none = h('button', { type: 'button', class: 'swatch none', title: key === 'color' ? 'Default' : 'None' });
  none.addEventListener('mousedown', (event) => {
    event.preventDefault();
    flowPopClose();
    flowSetFmt(key, '');
    if (key === 'bg') flowSetFmt('highlight', '');
  });
  box.append(none);
  list.forEach((value) => {
    const swatch = h('button', { type: 'button', class: 'swatch', title: value });
    swatch.style.background = value;
    swatch.addEventListener('mousedown', (event) => {
      event.preventDefault();
      flowPopClose();
      flowSetFmt(key, value);
    });
    box.append(swatch);
  });
  flowPlacePop(box, anchor);
}

function flowInputPop(anchor, { value = '', placeholder = '', preview = null, onDone, onRemove = null, multiline = false }) {
  flowPopClose();
  const box = h('div', { class: 'fmenu finput' });
  const input = h(multiline ? 'textarea' : 'input', { type: 'text', class: 'fpop-input', spellcheck: multiline ? 'true' : 'false', placeholder });
  input.value = value;
  const show = h('div', { class: 'fpop-preview' });
  const paint = () => {
    if (!preview) return;
    const html = preview(input.value);
    show.hidden = !html;
    show.innerHTML = html || '';
  };
  const done = () => {
    const text = input.value;
    flowPopClose();
    onDone(text);
  };
  input.addEventListener('input', paint);
  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter' && (!multiline || !event.shiftKey)) {
      event.preventDefault();
      done();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      flowPopClose();
      FLOW.editor.commands.focus();
    }
  });
  const row = h('div', { class: 'fpop-row' }, input);
  const ok = h('button', { type: 'button', class: 'fpop-ok', html: icon('check', 16), title: 'Done' });
  ok.addEventListener('mousedown', (event) => {
    event.preventDefault();
    done();
  });
  row.append(ok);
  if (onRemove) {
    const drop = h('button', { type: 'button', class: 'fpop-ok drop', html: icon('trash', 15), title: 'Remove' });
    drop.addEventListener('mousedown', (event) => {
      event.preventDefault();
      flowPopClose();
      onRemove();
    });
    row.append(drop);
  }
  box.append(row);
  if (preview) box.append(show);
  flowPlacePop(box, anchor);
  paint();
  setTimeout(() => {
    input.focus();
    input.select();
  }, 20);
}

function flowCaretAnchor() {
  const { view, state } = FLOW.editor;
  const at = view.coordsAtPos(state.selection.from);
  const ghost = { getBoundingClientRect: () => ({ left: at.left, right: at.right, top: at.top, bottom: at.bottom }) };
  return ghost;
}

function flowNewChip(kind) {
  const anchor = flowCaretAnchor();
  const { from, to } = FLOW.editor.state.selection;
  const picked = FLOW.editor.state.doc.textBetween(from, to, ' ');
  if (kind === 'math') {
    flowInputPop(anchor, {
      value: picked,
      placeholder: 'x^2 + sqrt(y)/2',
      preview: (text) => (text.trim() ? mathHtml(text) : ''),
      onDone: (text) => {
        if (!text.trim()) return FLOW.editor.commands.focus();
        flowPutChip(from, to, 'math', `$${text.trim()}$`, text.trim());
      },
    });
  } else if (kind === 'note') {
    flowInputPop(anchor, {
      value: picked,
      placeholder: 'Footnote',
      multiline: true,
      onDone: (text) => {
        if (!text.trim()) return FLOW.editor.commands.focus();
        flowPutChip(from, to, 'note', `^[${text.trim().replace(/\]/g, '\\]')}]`, '†');
      },
    });
  }
}

function flowPutChip(from, to, kind, src, label) {
  const node = FLOW.editor.schema.nodes.chip.create({ kind, src, label });
  const tr = FLOW.editor.state.tr.replaceWith(from, to, node);
  FLOW.editor.view.dispatch(tr.setSelection(TT.TextSelection.create(tr.doc, from + 1)));
  FLOW.editor.commands.focus();
}

function flowPutCite(from, to, key, label) {
  const size = FLOW.editor.state.doc.content.size;
  const a = Math.max(1, Math.min(from, size - 1));
  const b = Math.max(a, Math.min(to, size - 1));
  const before = FLOW.editor.state.doc.textBetween(Math.max(0, a - 1), a, '\n', '￼');
  let at = a;
  if (before && !/[\s(\[\n]/.test(before)) {
    FLOW.editor.view.dispatch(FLOW.editor.state.tr.insertText(' ', a, b));
    at = a + 1;
  } else if (b > a) FLOW.editor.view.dispatch(FLOW.editor.state.tr.delete(a, b));
  flowPutChip(at, at, 'cite', `[@${key}]`, label);
  return at;
}

function flowChipPop(dom, pos) {
  const node = FLOW.editor.state.doc.nodeAt(pos);
  if (!node) return;
  const { kind, src } = node.attrs;
  const replace = (nextSrc, label) => {
    const fresh = FLOW.editor.schema.nodes.chip.create({ kind, src: nextSrc, label });
    const tr = FLOW.editor.state.tr.replaceWith(pos, pos + 1, fresh);
    FLOW.editor.view.dispatch(tr.setSelection(TT.TextSelection.create(tr.doc, pos + 1)));
    FLOW.editor.commands.focus();
  };
  const remove = () => {
    const tr = FLOW.editor.state.tr.delete(pos, pos + 1);
    FLOW.editor.view.dispatch(tr);
    FLOW.editor.commands.focus();
  };
  if (kind === 'math') {
    const body = src.replace(/^\$+|\$+$/g, '');
    flowInputPop(dom, { value: body, preview: (text) => (text.trim() ? mathHtml(text) : ''), onDone: (text) => (text.trim() ? replace(`$${text.trim()}$`, text.trim()) : remove()), onRemove: remove });
  } else if (kind === 'note' && src.startsWith('[^')) {
    FLOW.editor.commands.focus();
  } else if (kind === 'note') {
    flowInputPop(dom, { value: src.slice(2, -1).replace(/\\\]/g, ']'), multiline: true, onDone: (text) => (text.trim() ? replace(`^[${text.trim().replace(/\]/g, '\\]')}]`, '†') : remove()), onRemove: remove });
  } else if (kind === 'cite') flowCiteCard(dom, pos);
  else if (kind === 'ref') flowRefPop(dom, { pos, remove });
}

function flowPickList(anchor, items, { empty, onPick, onRemove = null, extra = null }) {
  flowPopClose();
  const box = h('div', { class: 'fmenu fpick-list' });
  const input = h('input', { type: 'text', class: 'fpop-input', placeholder: 'Search', spellcheck: 'false' });
  const list = h('div', { class: 'fpick-rows' });
  let shown = [];
  let index = 0;
  const draw = () => {
    const term = input.value.trim().toLowerCase();
    shown = items.filter((item) => !term || `${item.label} ${item.hint || ''}`.toLowerCase().includes(term)).slice(0, 60);
    index = Math.min(index, Math.max(0, shown.length - 1));
    list.replaceChildren(...shown.map((item, i) => {
      const row = h('button', { type: 'button', class: `frow${i === index ? ' on' : ''}` }, h('span', { class: 'frow-main', text: item.label }), h('span', { class: 'frow-hint', text: item.hint || '' }));
      row.addEventListener('mousedown', (event) => {
        event.preventDefault();
        flowPopClose();
        onPick(item);
      });
      return row;
    }));
    if (!shown.length) list.append(h('div', { class: 'fempty', text: empty }));
  };
  input.addEventListener('input', () => {
    index = 0;
    draw();
  });
  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      index = Math.min(shown.length - 1, index + 1);
      draw();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      index = Math.max(0, index - 1);
      draw();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = shown[index];
      flowPopClose();
      if (item) onPick(item);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      flowPopClose();
      FLOW.editor.commands.focus();
    }
  });
  box.append(input, list);
  if (extra || onRemove) {
    const foot = h('div', { class: 'fpop-foot' });
    if (extra) foot.append(extra);
    if (onRemove) {
      const drop = h('button', { type: 'button', class: 'pill ghost small', text: 'Remove' });
      drop.addEventListener('mousedown', (event) => {
        event.preventDefault();
        flowPopClose();
        onRemove();
      });
      foot.append(drop);
    }
    box.append(foot);
  }
  flowPlacePop(box, anchor);
  draw();
  setTimeout(() => input.focus(), 20);
}

function flowCitePop(anchor, existing = null) {
  const { from, to } = FLOW.editor.state.selection;
  const items = Object.keys(S.sources || {}).map((key) => ({ key, label: String((S.sources[key] && (S.sources[key].label || S.sources[key].title)) || S.sources[key] || key).slice(0, 90), hint: key }));
  let extra = null;
  if (typeof openSourceLookup === 'function') {
    extra = h('button', { type: 'button', class: 'pill ghost small', html: `${icon('plus', 14)}<span>Add source</span>` });
    extra.addEventListener('mousedown', (event) => {
      event.preventDefault();
      flowPopClose();
      FLOW.keep = { from, to };
      openSourceLookup({
        onInsert: (key, info) => {
          flowPull();
          const spot = FLOW.keep || { from, to };
          FLOW.keep = null;
          flowPutCite(spot.from, spot.to, key, (info && info.label) || `(${key})`);
        },
      });
    });
  }
  flowPickList(anchor, items, {
    empty: 'No sources yet',
    extra,
    onRemove: existing ? existing.remove : null,
    onPick: (item) => {
      if (existing && existing.keep) return existing.keep(item.key);
      const src = `[@${item.key}]`;
      if (existing) {
        const tr = FLOW.editor.state.tr.replaceWith(existing.pos, existing.pos + 1, FLOW.editor.schema.nodes.chip.create({ kind: 'cite', src, label: `(${item.key})` }));
        FLOW.editor.view.dispatch(tr);
        FLOW.editor.commands.focus();
      } else {
        const at = flowPutCite(from, to, item.key, `(${item.key})`);
        requestAnimationFrame(() => {
          const dom = FLOW.editor.view.nodeDOM(at);
          if (dom && dom.nodeType === 1) flowCiteCard(dom, at, true);
        });
      }
    },
  });
}

function flowRefPop(anchor, existing = null) {
  const { from, to } = FLOW.editor.state.selection;
  const items = Object.keys(S.labels || {}).map((key) => ({ key, label: S.labels[key], hint: key }));
  flowPickList(anchor, items, {
    empty: 'Add a caption id to a figure or table first',
    onRemove: existing ? existing.remove : null,
    onPick: (item) => {
      const src = `@${item.key}`;
      if (existing) {
        const tr = FLOW.editor.state.tr.replaceWith(existing.pos, existing.pos + 1, FLOW.editor.schema.nodes.chip.create({ kind: 'ref', src, label: item.label }));
        FLOW.editor.view.dispatch(tr);
        FLOW.editor.commands.focus();
      } else flowPutChip(from, to, 'ref', src, item.label);
    },
  });
}

function flowLinkPop(anchor) {
  const editor = FLOW.editor;
  const now = editor.getAttributes('rlink').url || '';
  const { from, to, empty } = editor.state.selection;
  flowInputPop(anchor, {
    value: now,
    placeholder: 'https://',
    onRemove: now ? () => editor.chain().focus().extendMarkRange('rlink').unsetMark('rlink').run() : null,
    onDone: (url) => {
      const clean = url.trim();
      if (!clean) return editor.commands.focus();
      if (empty && !now) {
        const tr = editor.state.tr.insertText(clean, from, to);
        tr.addMark(from, from + clean.length, editor.schema.marks.rlink.create({ url: clean }));
        editor.view.dispatch(tr);
        editor.commands.focus();
        return;
      }
      editor.chain().focus().setTextSelection({ from, to }).extendMarkRange('rlink').setMark('rlink', { url: clean }).run();
    },
  });
}
