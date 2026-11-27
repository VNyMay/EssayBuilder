const FlowFmt = () => TT.Mark.create({
  name: 'fmt',
  excludes: '',
  addAttributes() {
    return { attrs: { default: '' } };
  },
  parseHTML() {
    return [{ tag: 'span.fmt', getAttrs: (el) => ({ attrs: el.dataset.attrs || '' }) }];
  },
  renderHTML({ mark }) {
    return ['span', { class: 'fmt', 'data-attrs': mark.attrs.attrs, style: fmtStyle(attrList(mark.attrs.attrs)) }, 0];
  },
});

const FlowLink = () => TT.Mark.create({
  name: 'rlink',
  inclusive: false,
  addAttributes() {
    return { url: { default: '' } };
  },
  parseHTML() {
    return [{ tag: 'span.rlink', getAttrs: (el) => ({ url: el.dataset.url || '' }) }, { tag: 'a[href]', getAttrs: (el) => ({ url: el.getAttribute('href') || '' }) }];
  },
  renderHTML({ mark }) {
    return ['span', { class: 'rlink', 'data-url': mark.attrs.url, title: mark.attrs.url }, 0];
  },
});

function flowChipLabel(kind, src, label) {
  if (kind === 'ref') {
    const match = src.match(/^@([a-z]+):(.+)$/);
    return (match && S.labels && S.labels[`${match[1]}:${match[2]}`]) || label;
  }
  if (kind === 'cite') {
    const key = src.startsWith('[') ? src.replace(/^\[|\]$/g, '') : src;
    return (S.cites && S.cites[key]) || label;
  }
  return label;
}

const FlowChip = () => TT.Node.create({
  name: 'chip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { kind: { default: 'math' }, src: { default: '' }, label: { default: '' } };
  },
  parseHTML() {
    return [{
      tag: 'span.chip',
      getAttrs: (el) => ({ kind: ['math', 'note', 'cite', 'ref'].find((name) => el.classList.contains(name)) || 'math', src: el.dataset.src || '', label: el.textContent || '' }),
    }];
  },
  renderHTML({ node }) {
    return ['span', { class: `chip ${node.attrs.kind}`, 'data-src': node.attrs.src }, node.attrs.label || node.attrs.src];
  },
  renderText({ node }) {
    if (node.attrs.kind === 'note') return '';
    if (node.attrs.kind === 'math') return node.attrs.src.replace(/^\$+|\$+$/g, '');
    return flowChipLabel(node.attrs.kind, node.attrs.src, node.attrs.label) || node.attrs.src;
  },
  addInputRules() {
    return [new TT.InputRule({
      find: /(?:^|[^\\$\w])\$([^$\s](?:[^$]*[^$\s])?)\$$/,
      handler: ({ state, range, match }) => {
        const body = match[1];
        const end = range.to;
        const full = end - body.length - 2;
        const typed = full >= 0 && state.doc.textBetween(full, end, '￼') === `$${body}$`;
        const start = typed ? full : end - body.length - 1;
        state.tr.replaceWith(start, end, this.type.create({ kind: 'math', src: `$${body}$`, label: body }));
      },
    })];
  },
  addNodeView() {
    return ({ node, getPos }) => {
      const dom = chip(node.attrs.kind, node.attrs.src, flowChipLabel(node.attrs.kind, node.attrs.src, node.attrs.label));
      dom.classList.add('fchip');
      if (node.attrs.kind === 'note') {
        dom.title = node.attrs.src.startsWith('[^') ? 'Footnote' : node.attrs.src.slice(2, -1);
        dom.textContent = '';
        dom.classList.add('fnum');
      }
      dom.addEventListener('mousedown', (event) => {
        event.preventDefault();
        const pos = getPos();
        FLOW.editor.chain().setNodeSelection(pos).run();
        flowChipPop(dom, pos);
      });
      return { dom, ignoreMutation: () => true, stopEvent: (event) => event.type === 'mousedown' };
    };
  },
});

function flowKindLabel(kind) {
  const schema = typeof schemaOf === 'function' ? schemaOf(kind) : null;
  const template = TEMPLATES.find((item) => item.kind === kind || item.id === kind);
  return (schema && schema.label) || (template && template.label) || prettyKey(kind);
}

function flowKindIcon(kind) {
  const template = TEMPLATES.find((item) => item.kind === kind || item.id === kind);
  if (template && template.icon) return template.icon;
  return ICON_SET[kind] ? kind : 'box';
}

function flowCropFor(src) {
  return FLOW.crops.get(src) || null;
}

function flowDrawView(view, node) {
  const kind = node.attrs.kind;
  const src = node.attrs.src;
  view.replaceChildren();
  view.className = 'fb-view';
  if (kind === 'math') {
    const body = src.replace(/^\s*\$\$/, '').replace(/\$\$\s*(\{[^{}]*\})?\s*$/, '').trim();
    const html = mathHtml(body);
    view.classList.add('fb-math');
    view.innerHTML = html || '';
    if (!html) view.textContent = body;
    return;
  }
  if (kind === 'pagebreak' || kind === 'blank') {
    view.classList.add('fb-break');
    view.append(h('span', { text: kind === 'blank' ? 'Blank page' : 'Page break' }));
    return;
  }
  if (kind === 'notedef') {
    const found = src.match(/^\[\^([\w-]+)\]:\s*([\s\S]*)$/);
    view.classList.add('fb-notedef');
    view.append(h('span', { class: 'fb-notedef-mark', text: 'Footnote' }), h('span', { text: found ? found[2].replace(/\s*\n\s*/g, ' ') : src }));
    return;
  }
  if (kind === 'raw' || kind === 'numbering' || kind === 'wc-start' || kind === 'wc-end' || kind === 'spacer') {
    view.classList.add('fb-raw');
    const words = { 'wc-start': 'Word count starts', 'wc-end': 'Word count ends', numbering: 'Page numbering', spacer: 'Space' };
    view.textContent = words[kind] || src;
    return;
  }
  let crop = flowCropFor(src);
  const owner = `${node.attrs.uid || ''}|${kind}`;
  if (view.cropOwner !== owner) {
    view.lastCrop = null;
    view.cropOwner = owner;
  }
  if ((!crop || !crop.rects.length) && view.lastCrop && view.lastCrop.rects.length) crop = { ...view.lastCrop, stale: true };
  else if (crop && crop.rects.length) view.lastCrop = crop;
  if (crop && !crop.rects.length) {
    view.classList.add('fb-info');
    const lines = flowLines(src).slice(1, -1);
    let summary = '';
    if (kind === 'sources') {
      const keys = lines.filter((line) => /^\s*@[\w:-]+/.test(line));
      const titles = lines.filter((line) => /^\s*title\s*:/i.test(line)).map((line) => line.replace(/^\s*title\s*:\s*/i, ''));
      summary = `${keys.length ? `${keys.length} ${keys.length === 1 ? 'source' : 'sources'}${titles.length ? ` · ${titles.slice(0, 3).join(' · ')}${titles.length > 3 ? ' …' : ''}` : ''}` : 'No sources yet'}. Not printed: your reference list is made from these.`;
    } else summary = (lines.find((line) => line.trim() && line.trim() !== '---' && !/^\s*[\w-]+\s*:/.test(line)) || '').trim();
    view.append(h('span', { class: 'fb-info-icon', html: icon(flowKindIcon(kind), 20) }), h('span', { class: 'fb-info-text' }, h('b', { text: flowKindLabel(kind) }), h('span', { text: summary })));
    return;
  }
  if (!crop) {
    view.classList.add('fb-wait');
    view.append(h('span', { class: 'fb-wait-icon', html: icon(flowKindIcon(kind), 22) }), h('span', { text: flowKindLabel(kind) }));
    return;
  }
  const scale = FLOW_L;
  const margin = marginPt();
  crop.rects.forEach((rect) => {
    const page = S.pages[rect.page] || crop.pages[rect.page];
    if (!page) return;
    const piece = h('div', { class: 'fb-crop' });
    const inner = (page.w - 2 * margin) * scale;
    piece.style.width = `${inner}px`;
    piece.style.height = `${Math.max(8, (rect.y1 - rect.y0 + 4) * scale)}px`;
    piece.style.backgroundImage = `url("${page.url}")`;
    piece.style.backgroundSize = `${page.w * scale}px ${page.h * scale}px`;
    piece.style.backgroundPosition = `${-margin * scale}px ${-(rect.y0 - 2) * scale}px`;
    piece.style.margin = `${-2 * scale}px 0`;
    view.append(piece);
  });
  if (crop.stale) view.classList.add('fb-stale');
}

const FlowFigure = () => TT.Node.create({
  name: 'figureBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return { kind: { default: 'figure' }, src: { default: '' }, uid: { default: null, rendered: false } };
  },
  parseHTML() {
    return [{ tag: 'div[data-fb]', getAttrs: (el) => ({ kind: el.dataset.kind || 'figure', src: el.dataset.src || '', uid: flowNextUid() }) }];
  },
  renderHTML({ node }) {
    return ['div', { 'data-fb': '', 'data-kind': node.attrs.kind, 'data-src': node.attrs.src }];
  },
  addNodeView() {
    return ({ node, getPos }) => {
      let current = node;
      const dom = h('div', { class: 'fb', 'data-kind': node.attrs.kind });
      const view = h('div', { class: 'fb-view' });
      const label = h('span', { class: 'fb-name' });
      const bar = h(
        'div',
        { class: 'fb-bar', contenteditable: 'false' },
        h('span', { class: 'fb-grip', 'data-drag-handle': '', html: icon('grip', 15), title: 'Drag to move' }),
        label,
        h('button', { type: 'button', tabindex: '-1', class: 'fb-btn', html: icon('up', 15), title: 'Move up', onmousedown: (event) => flowBtn(event, () => flowMoveNode(getPos(), -1)) }),
        h('button', { type: 'button', tabindex: '-1', class: 'fb-btn', html: icon('down', 15), title: 'Move down', onmousedown: (event) => flowBtn(event, () => flowMoveNode(getPos(), 1)) }),
        h('button', { type: 'button', tabindex: '-1', class: 'fb-btn', html: icon('copy', 15), title: 'Duplicate', onmousedown: (event) => flowBtn(event, () => flowDuplicate(getPos())) }),
        h('button', { type: 'button', tabindex: '-1', class: 'fb-btn danger', html: icon('trash', 15), title: 'Delete', onmousedown: (event) => flowBtn(event, () => flowDelete(getPos())) }),
      );
      dom.append(view, bar);
      if (flowResizable(node.attrs.kind)) {
        ['left', 'right'].forEach((side) => {
          const grip = h('span', { class: `fb-size ${side}`, contenteditable: 'false', title: 'Drag to resize' });
          grip.addEventListener('pointerdown', (event) => flowResizeStart(event, dom, getPos, side));
          dom.append(grip);
        });
      }
      const paint = () => {
        label.replaceChildren(h('span', { html: icon(flowKindIcon(current.attrs.kind), 14) }), h('span', { text: flowKindLabel(current.attrs.kind) }));
        dom.dataset.kind = current.attrs.kind;
        flowDrawView(view, current);
      };
      paint();
      dom.addEventListener('mousedown', (event) => {
        if (event.target.closest('.fb-bar, .sheet, .fb-size')) return;
        event.preventDefault();
        FLOW.openNext = true;
        FLOW.editor.chain().focus().setNodeSelection(getPos()).run();
        if (FLOW.openNext) {
          FLOW.openNext = false;
          flowSelectionChanged(true);
        }
      });
      dom.addEventListener('dblclick', (event) => {
        if (event.target.closest('.fb-bar, .sheet, .fb-size')) return;
        const pos = getPos();
        const node = FLOW.editor.state.doc.nodeAt(pos);
        if (!node) return;
        const lines = flowLines(node.attrs.src);
        const at = lines.findIndex((item) => /^\s*caption\s*:/i.test(item));
        const pipe = node.attrs.kind === 'pipetable' ? lines.findIndex((item) => /^Table:\s*/i.test(item.trim())) : -1;
        if (at < 0 && pipe < 0 && !(schemaOf(node.attrs.kind) && schemaOf(node.attrs.kind).keys && 'caption' in schemaOf(node.attrs.kind).keys)) return;
        event.preventDefault();
        const current = at >= 0 ? lines[at].replace(/^\s*caption\s*:\s*/i, '') : pipe >= 0 ? lines[pipe].trim().replace(/^Table:\s*/i, '').replace(/\s*\{[^{}]*\}\s*$/, '') : '';
        const anchor = { getBoundingClientRect: () => ({ left: event.clientX - 150, right: event.clientX + 150, top: event.clientY, bottom: event.clientY + 8 }) };
        flowInputPop(anchor, {
          value: current,
          placeholder: 'Caption',
          onDone: (text) => {
            const live = FLOW.editor.state.doc.nodeAt(pos);
            if (!live) return;
            const next = flowLines(live.attrs.src);
            const clean = text.trim();
            if (at >= 0) {
              if (clean) next[at] = `caption: ${clean}`;
              else next.splice(at, 1);
            } else if (pipe >= 0) {
              const tail = (next[pipe].match(/\s*(\{[^{}]*\})\s*$/) || ['', ''])[1];
              next[pipe] = `Table: ${clean}${tail ? ` ${tail}` : ''}`;
            } else if (clean) next.splice(1, 0, `caption: ${clean}`);
            const src = next.join('\n');
            const old = FLOW.crops.get(live.attrs.src);
            if (old) FLOW.crops.set(src, { ...old, stale: true });
            FLOW.editor.view.dispatch(FLOW.editor.state.tr.setNodeMarkup(pos, null, { ...live.attrs, src }));
            if (S.panel && S.panel.range && S.panel.range.uid === live.attrs.uid) {
              const entry = FLOW.map.find((item) => item && item.uid === live.attrs.uid);
              if (entry) openPanel(flowRangeFor(entry));
            }
          },
        });
      });
      dom.flowRepaint = paint;
      return {
        dom,
        update(next) {
          if (next.type !== current.type) return false;
          const changed = next.attrs.src !== current.attrs.src || next.attrs.kind !== current.attrs.kind;
          current = next;
          if (changed) paint();
          return true;
        },
        selectNode() {
          dom.classList.add('on');
        },
        deselectNode() {
          dom.classList.remove('on');
        },
        stopEvent: (event) => Boolean(event.target.closest && ((event.target.closest('.fb-bar') && event.type !== 'dragstart') || event.target.closest('.sheet, .fb-size'))),
        ignoreMutation: () => true,
      };
    };
  },
});

function flowResizable(kind) {
  const schema = typeof schemaOf === 'function' ? schemaOf(kind) : null;
  return Boolean(schema && schema.keys && 'width' in schema.keys) && !['table', 'pipetable', 'code'].includes(kind);
}

function flowWidthOf(src) {
  const line = flowLines(src).find((item) => /^\s*width\s*:/i.test(item));
  const value = line ? line.replace(/^\s*width\s*:\s*/i, '').trim().toLowerCase() : '';
  const pct = value.match(/^([\d.]+)\s*%$/);
  if (pct) return Number(pct[1]);
  return { full: 100, large: 86, wide: 100, medium: 70, small: 50, half: 50 }[value] || 86;
}

function flowWithWidth(src, pct) {
  const lines = flowLines(src);
  const value = `width: ${Math.round(pct)}%`;
  const at = lines.findIndex((item) => /^\s*width\s*:/i.test(item));
  if (at >= 0) lines[at] = value;
  else {
    const end = lines.findIndex((item, index) => index > 0 && (item.trim() === '---' || item.trim() === ':::'));
    lines.splice(end > 0 ? end : 1, 0, value);
  }
  return lines.join('\n');
}

function flowResizeStart(event, dom, getPos, side) {
  event.preventDefault();
  event.stopPropagation();
  const pos = getPos();
  const node = FLOW.editor.state.doc.nodeAt(pos);
  if (!node) return;
  const view = dom.querySelector('.fb-view');
  const full = view.getBoundingClientRect().width;
  const start = flowWidthOf(node.attrs.src);
  const x0 = event.clientX;
  const frame = h('div', { class: 'fb-frame' }, h('span', { class: 'fb-badge' }));
  dom.append(frame);
  dom.classList.add('sizing');
  let pct = start;
  const paint = () => {
    frame.style.width = `${((pct / 100) * full) / flowZoom()}px`;
    frame.firstChild.textContent = `${Math.round(pct)}%`;
  };
  paint();
  const move = (moveEvent) => {
    const delta = ((moveEvent.clientX - x0) * (side === 'right' ? 2 : -2)) / full * 100;
    pct = Math.max(15, Math.min(100, Math.round((start + delta) / 5) * 5));
    paint();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    frame.remove();
    dom.classList.remove('sizing');
    if (pct === start) return;
    const current = FLOW.editor.state.doc.nodeAt(pos);
    if (!current) return;
    const src = flowWithWidth(current.attrs.src, pct);
    const old = FLOW.crops.get(current.attrs.src);
    if (old) FLOW.crops.set(src, { ...old, stale: true });
    FLOW.editor.view.dispatch(FLOW.editor.state.tr.setNodeMarkup(pos, null, { ...current.attrs, src }));
    if (S.panel && S.panel.range && S.panel.range.uid === current.attrs.uid) openPanel(flowRangeFor(FLOW.map.find((item) => item && item.uid === current.attrs.uid)));
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function flowBtn(event, run) {
  event.preventDefault();
  event.stopPropagation();
  run();
}

const FlowParagraph = () => TT.Paragraph.extend({
  addAttributes() {
    return {
      opts: {
        default: null,
        parseHTML: (el) => {
          try {
            return el.dataset.opts ? JSON.parse(el.dataset.opts) : null;
          } catch (error) {
            return null;
          }
        },
        renderHTML: (attrs) => (attrs.opts && attrs.opts.length ? { 'data-opts': JSON.stringify(attrs.opts), style: flowOptsStyle(attrs.opts) } : {}),
      },
    };
  },
});

const FlowHeading = () => TT.Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      tail: { default: '', parseHTML: (el) => el.dataset.tail || '', renderHTML: (attrs) => (attrs.tail ? { 'data-tail': attrs.tail } : {}) },
    };
  },
}).configure({ levels: [1, 2, 3] });

const FlowQuote = () => TT.Blockquote.extend({ content: 'paragraph+' });

function flowOptValue(opts, key) {
  const found = (opts || []).find((line) => line.toLowerCase().startsWith(`${key}:`));
  return found ? found.slice(key.length + 1).trim() : '';
}

function flowOptsStyle(opts) {
  const css = [];
  const align = flowOptValue(opts, 'align');
  if (align) css.push(`text-align:${align === 'centre' ? 'center' : align}`);
  const size = flowOptValue(opts, 'size');
  if (/^[\d.]+$/.test(size)) css.push(`font-size:calc(${size} * var(--pt))`);
  const look = flowOptValue(opts, 'style').toLowerCase();
  if (look.includes('bold')) css.push('font-weight:700');
  if (look.includes('italic')) css.push('font-style:italic');
  const font = flowOptValue(opts, 'font');
  if (font) css.push(`font-family:"${font}",var(--doc-font)`);
  const color = flowOptValue(opts, 'color');
  if (color) css.push(`color:${color}`);
  const bg = flowOptValue(opts, 'bg');
  if (bg) css.push(`background:${bg}`);
  const indent = flowOptValue(opts, 'indent');
  if (/^[\d.]+$/.test(indent)) css.push(`padding-left:calc(${indent} * var(--pt))`);
  return css.join(';');
}

const FlowKeys = () => TT.Extension.create({
  name: 'flowKeys',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-l': () => flowAlign('left'),
      'Mod-Shift-e': () => flowAlign('center'),
      'Mod-Shift-r': () => flowAlign('right'),
      'Mod-Shift-j': () => flowAlign('justify'),
      'Mod-Alt-0': () => this.editor.chain().focus().setParagraph().run(),
      'Mod-m': () => {
        flowNewChip('math');
        return true;
      },
      'Mod-k': () => false,
      'Mod-Alt-m': () => {
        flowNoteAdd();
        return true;
      },
      Enter: () => {
        if (flowFigureSelected()) {
          flowSelectionChanged(true);
          return true;
        }
        return flowCalloutExit();
      },
      Backspace: () => flowCalloutUnwrap(),
      'Alt-ArrowUp': () => flowMoveCurrent(-1),
      'Alt-ArrowDown': () => flowMoveCurrent(1),
      'Mod-f': () => {
        flowFindOpen(false);
        return true;
      },
      'Mod-h': () => {
        flowFindOpen(true);
        return true;
      },
    };
  },
});

function flowCalloutExit() {
  const { state } = FLOW.editor;
  const { $from, empty } = state.selection;
  if (!empty || $from.depth < 2) return false;
  const box = $from.node(1);
  if (box.type.name !== 'callout') return false;
  const para = $from.parent;
  if (para.content.size || $from.index(1) !== box.childCount - 1 || box.childCount < 2) return false;
  const start = $from.before(2);
  let tr = state.tr.delete(start, start + para.nodeSize);
  const after = tr.mapping.map($from.after(1));
  tr = tr.insert(after, state.schema.nodes.paragraph.create());
  tr = tr.setSelection(TT.TextSelection.create(tr.doc, after + 1));
  FLOW.editor.view.dispatch(tr.scrollIntoView());
  return true;
}

function flowCalloutUnwrap() {
  const { state } = FLOW.editor;
  const { $from, empty } = state.selection;
  if (!empty || $from.depth < 2 || $from.parentOffset) return false;
  const box = $from.node(1);
  if (box.type.name !== 'callout' || $from.index(1) !== 0) return false;
  if (box.textContent.trim()) return false;
  const start = $from.before(1);
  const tr = state.tr.replaceWith(start, start + box.nodeSize, state.schema.nodes.paragraph.create());
  FLOW.editor.view.dispatch(tr.setSelection(TT.TextSelection.create(tr.doc, start + 1)));
  return true;
}
