function flowFigureSelected() {
  const sel = FLOW.editor.state.selection;
  return sel instanceof TT.NodeSelection && sel.node.type.name === 'figureBlock';
}

function flowHandleMount() {
  if (FLOW.handle) return;
  const plus = h('button', { type: 'button', tabindex: '-1', class: 'fh-btn', html: icon('plus', 16), title: 'Add below' });
  const grip = h('button', { type: 'button', tabindex: '-1', class: 'fh-btn fh-grip', html: icon('grip', 16), title: 'Drag to move, click for options', draggable: 'true' });
  FLOW.handle = h('div', { class: 'flow-handle', contenteditable: 'false' }, plus, grip);
  FLOW.sheet.append(FLOW.handle);
  plus.addEventListener('mousedown', (event) => {
    event.preventDefault();
    const pos = FLOW.handlePos;
    const node = pos == null ? null : FLOW.editor.state.doc.nodeAt(pos);
    if (!node) return;
    const after = pos + node.nodeSize;
    const empty = node.type.name === 'paragraph' && !node.content.size;
    let tr = FLOW.editor.state.tr;
    let at = pos + 1;
    if (!empty) {
      tr = tr.insert(after, FLOW.editor.schema.nodes.paragraph.create());
      at = after + 1;
    }
    tr = tr.insertText('/', at);
    tr = tr.setSelection(TT.TextSelection.create(tr.doc, at + 1));
    FLOW.editor.view.dispatch(tr);
    FLOW.editor.commands.focus();
    flowSlashCheck();
  });
  grip.addEventListener('dragstart', (event) => {
    const pos = FLOW.handlePos;
    if (pos == null) return;
    const view = FLOW.editor.view;
    const sel = TT.NodeSelection.create(view.state.doc, pos);
    view.dispatch(view.state.tr.setSelection(sel));
    const slice = sel.content();
    view.dragging = { slice, move: true };
    const dom = view.nodeDOM(pos);
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData('text/plain', view.state.doc.textBetween(pos, pos + sel.node.nodeSize, '\n'));
    if (dom) event.dataTransfer.setDragImage(dom, 0, 0);
  });
  grip.addEventListener('click', (event) => {
    event.preventDefault();
    const pos = FLOW.handlePos;
    if (pos == null) return;
    const node = FLOW.editor.state.doc.nodeAt(pos);
    if (!node) return;
    const textLike = ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList'].includes(node.type.name);
    const into = (value) => () => {
      FLOW.editor.chain().setTextSelection(pos + 1).run();
      if (value === 'bullet') FLOW.editor.chain().focus().toggleBulletList().run();
      else if (value === 'ordered') FLOW.editor.chain().focus().toggleOrderedList().run();
      else flowSetBlock(value);
    };
    const items = [];
    if (textLike) {
      items.push(
        { label: 'Text', run: into('p') },
        { label: 'Heading', cls: 'st-h1', run: into('h1') },
        { label: 'Sub-heading', cls: 'st-h2', run: into('h2') },
        { label: 'Sub-sub-heading', cls: 'st-h3', run: into('h3') },
        { label: 'Bullet list', run: into('bullet') },
        { label: 'Numbered list', run: into('ordered') },
        { label: 'Quote', cls: 'st-quote', run: into('quote') },
      );
    }
    if (node.type.name === 'heading') items.push(...flowHeadingItems(pos, node));
    items.push(
      { label: 'Move up', cls: 'sep-top', run: () => flowMoveNode(pos, -1) },
      { label: 'Move down', run: () => flowMoveNode(pos, 1) },
      { label: 'Duplicate', run: () => flowDuplicate(pos) },
      { label: 'Delete', cls: 'danger', run: () => flowDelete(pos) },
    );
    flowMenu(grip, items);
  });
  FLOW.sheet.addEventListener('mousemove', (event) => {
    if (event.target.closest('.flow-handle, .note-rail')) return;
    const doc = FLOW.editor.view.dom;
    const rect = doc.getBoundingClientRect();
    const spot = FLOW.editor.view.posAtCoords({ left: Math.max(rect.left + 4, Math.min(event.clientX, rect.right - 4)), top: event.clientY });
    if (!spot) return;
    const $pos = FLOW.editor.state.doc.resolve(spot.inside >= 0 ? spot.inside : spot.pos);
    const pos = $pos.depth ? $pos.before(1) : spot.inside >= 0 ? spot.inside : null;
    if (pos == null) return;
    const node = FLOW.editor.state.doc.nodeAt(pos);
    const dom = FLOW.editor.view.nodeDOM(pos);
    if (!node || !dom || !dom.getBoundingClientRect) return;
    FLOW.handlePos = pos;
    const box = dom.getBoundingClientRect();
    const sheet = FLOW.sheet.getBoundingClientRect();
    const zoom = flowZoom();
    const line = node.type.name === 'figureBlock' ? 18 : Math.min(box.height / zoom, parseFloat(getComputedStyle(dom).lineHeight) || 24);
    FLOW.handle.style.top = `${(box.top - sheet.top) / zoom + line / 2 - 13}px`;
    FLOW.handle.style.left = `${(box.left - sheet.left) / zoom - 58}px`;
    FLOW.handle.classList.add('on');
  });
  FLOW.sheet.addEventListener('mouseleave', () => FLOW.handle.classList.remove('on'));
}

function flowSelectionChanged(force = false) {
  const sel = FLOW.editor.state.selection;
  flowPaintBar();
  const picked = flowSelectedWords();
  if (picked || FLOW.pickedWords) {
    FLOW.pickedWords = picked;
    updatePill();
  }
  if (sel instanceof TT.NodeSelection && sel.node.type.name === 'figureBlock') {
    let entry = FLOW.map.find((item) => item && item.uid === sel.node.attrs.uid);
    if (!entry) {
      flowCommit();
      entry = FLOW.map.find((item) => item && item.uid === sel.node.attrs.uid);
    }
    const wanted = force === true || FLOW.openNext;
    FLOW.openNext = false;
    if (!wanted && !(S.panel && S.panel.range && S.panel.range.uid)) return;
    if (entry && (!S.panel || S.panel.range.uid !== entry.uid)) {
      S.sel = null;
      openPanel(flowRangeFor(entry));
    }
    return;
  }
  if (S.panel && S.panel.range && S.panel.range.uid) closePanel();
}

function flowDomFor(uid) {
  if (!uid || !FLOW.editor) return null;
  let found = null;
  FLOW.editor.state.doc.forEach((node, offset) => {
    if (!found && node.attrs && node.attrs.uid === uid) found = FLOW.editor.view.nodeDOM(offset);
  });
  return found;
}

function flowMoveNode(pos, direction) {
  const { state } = FLOW.editor;
  const node = state.doc.nodeAt(pos);
  if (!node) return false;
  const $pos = state.doc.resolve(pos);
  const index = $pos.index(0);
  const target = index + direction;
  if (target < 0 || target >= state.doc.childCount) return false;
  const other = state.doc.child(target);
  let tr = state.tr.delete(pos, pos + node.nodeSize);
  const insertAt = direction < 0 ? pos - other.nodeSize : pos + other.nodeSize;
  tr = tr.insert(insertAt, node);
  if (node.type.name === 'figureBlock') tr = tr.setSelection(TT.NodeSelection.create(tr.doc, insertAt));
  else tr = tr.setSelection(TT.TextSelection.near(tr.doc.resolve(insertAt + 1)));
  FLOW.editor.view.dispatch(tr.scrollIntoView());
  return true;
}

function flowMoveCurrent(direction) {
  const { state } = FLOW.editor;
  const $from = state.selection.$from;
  const pos = state.selection instanceof TT.NodeSelection && $from.depth === 0 ? state.selection.from : $from.before(1);
  return flowMoveNode(pos, direction);
}

function flowDuplicate(pos) {
  const node = FLOW.editor.state.doc.nodeAt(pos);
  if (!node) return;
  const copy = node.type.create({ ...node.attrs, uid: flowNextUid() }, node.content, node.marks);
  const at = pos + node.nodeSize;
  const tr = FLOW.editor.state.tr.insert(at, copy);
  FLOW.editor.view.dispatch(tr.setSelection(TT.NodeSelection.create(tr.doc, at)).scrollIntoView());
}

function flowDelete(pos) {
  const node = FLOW.editor.state.doc.nodeAt(pos);
  if (!node) return;
  closePanel();
  FLOW.editor.view.dispatch(FLOW.editor.state.tr.delete(pos, pos + node.nodeSize));
  FLOW.editor.commands.focus();
  toast('Deleted. Ctrl+Z to undo');
}

function flowWithId(lines) {
  const head = (lines[0] || '').trim().match(FLOW_DIRECTIVE);
  if (!head) return lines;
  const name = head[1].toLowerCase();
  const schema = typeof schemaOf === 'function' ? schemaOf(name) : null;
  if (!schema || !schema.keys || !('id' in schema.keys)) return lines;
  const end = lines.findIndex((line, index) => index > 0 && (line.trim() === '---' || line.trim() === ':::'));
  const options = lines.slice(1, end > 0 ? end : lines.length);
  if (options.some((line) => /^\s*id\s*:/i.test(line))) return lines;
  const used = new Set(Object.keys(S.labels || {}).map((key) => key.split(':')[1]));
  const words = (options.find((line) => /^\s*caption\s*:/i.test(line)) || '').replace(/^\s*caption\s*:\s*/i, '').toLowerCase().match(/[a-z0-9]+/g) || [];
  const stop = new Set(['figure', 'caption', 'table', 'chart', 'the', 'a', 'of', 'and', 'in', 'to']);
  let base = words.filter((word) => !stop.has(word)).slice(0, 2).join('-') || name;
  if (!/^[a-z]/.test(base)) base = `${name}-${base}`;
  let ident = base;
  let n = 2;
  while (used.has(ident) || new RegExp(`^\\s*id\\s*:\\s*${ident}\\s*$`, 'm').test(S.source)) {
    ident = `${base}-${n}`;
    n += 1;
  }
  return [lines[0], `id: ${ident}`, ...lines.slice(1)];
}

function flowHeadingItems(pos, node) {
  const tail = node.attrs.tail || '';
  const has = (flag) => new RegExp(`(^|[\\s{])${flag}(?=[\\s}])`).test(tail);
  const toggle = (flags, on) => () => {
    const drop = [flags].flat();
    const inner = tail.replace(/^\{|\}$/g, '').split(/\s+/).filter((part) => part && !drop.includes(part) && !(drop.includes('nonumber') && part === 'unnumbered'));
    if (on) inner.push(drop[0]);
    const next = inner.length ? `{${inner.join(' ')}}` : '';
    FLOW.editor.view.dispatch(FLOW.editor.state.tr.setNodeMarkup(pos, null, { ...node.attrs, tail: next }));
    const paged = drop[0] === 'newpage' ? on : drop[0] === 'samepage' ? !on : null;
    if (paged !== null) toast(paged ? 'This heading now starts on a new page' : 'This heading now follows on the same page');
  };
  const numbered = !has('nonumber') && !has('unnumbered');
  const listed = !has('notoc');
  const breaks = node.attrs.level === 1 && !/^(no|off|false)$/i.test(String((S.settings || {})['section-breaks'] || 'yes'));
  const ownPage = breaks ? !has('samepage') && !has('nobreak') : has('newpage') || has('pagebreak');
  return [
    { label: `${ownPage ? '✓ ' : ''}Starts a new page`, cls: 'sep-top', run: breaks ? toggle(['samepage', 'nobreak'], ownPage) : toggle(['newpage', 'pagebreak'], !ownPage) },
    { label: `${numbered ? '✓ ' : ''}Numbered`, run: toggle('nonumber', numbered) },
    { label: `${listed ? '✓ ' : ''}In contents`, run: toggle('notoc', listed) },
  ];
}

function flowInsertBlocks(lines, kind) {
  const blocks = flowBlocks(flowWithId(lines), 0);
  if (!blocks.length) return;
  const doc = flowDocFrom(blocks);
  const nodes = [];
  doc.forEach((node) => nodes.push(node.type.name === 'figureBlock' ? node.type.create({ ...node.attrs, uid: flowNextUid() }) : node));
  const { state } = FLOW.editor;
  const $from = state.selection.$from;
  let at;
  let replace = null;
  if (state.selection instanceof TT.NodeSelection && $from.depth === 0) at = state.selection.to;
  else {
    const top = $from.node(1);
    const start = $from.before(1);
    if (top && top.type.name === 'paragraph' && !top.textContent.trim() && !top.childCount) replace = { from: start, to: start + top.nodeSize };
    at = start + (top ? top.nodeSize : 0);
  }
  let tr = state.tr;
  if (replace) {
    tr = tr.replaceWith(replace.from, replace.to, nodes);
    at = replace.from;
  } else tr = tr.insert(at, nodes);
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const after = at + nodes.reduce((sum, node) => sum + node.nodeSize, 0);
  if (last.type.name === 'figureBlock' && after >= tr.doc.content.size) tr = tr.insert(after, state.schema.nodes.paragraph.create());
  if (first.type.name === 'figureBlock') {
    tr = tr.setSelection(TT.NodeSelection.create(tr.doc, at));
    FLOW.openNext = !['pagebreak', 'blank', 'spacer', 'contents', 'list-of-figures', 'list-of-tables', 'wc-start', 'wc-end'].includes(first.attrs.kind);
  } else {
    const textEnd = at + first.nodeSize - 1;
    tr = tr.setSelection(TT.TextSelection.create(tr.doc, at + 1, Math.max(at + 1, textEnd)));
  }
  FLOW.editor.view.dispatch(tr.scrollIntoView());
  FLOW.editor.commands.focus();
  flowGlow(at);
}

function flowGlow(pos) {
  requestAnimationFrame(() => {
    const dom = FLOW.editor.view.nodeDOM(pos);
    if (!dom || !dom.classList) return;
    dom.classList.add('flow-new');
    setTimeout(() => dom.classList.remove('flow-new'), 1200);
  });
}

async function flowInsertTemplate(template) {
  conceal($('#palette'));
  flowSlashClose(true);
  if (template.upload) {
    const file = await pickFile('image/*');
    if (!file) return;
    const path = await upload(file);
    if (path) flowInsertBlocks([':::figure', `src: ${path}`, 'caption: Figure caption.', 'width: 70%', ':::'], 'figure');
    return;
  }
  if (template.kind === 'bibliography') {
    const title = citationTitle(headerValue('citations') || S.settings.citations);
    flowInsertBlocks([`# ${title} {nonumber}`, '', ...template.lines], 'heading');
    return;
  }
  let lines = template.lines.slice();
  if (template.kind === 'chart') {
    const rows = flowTableAbove();
    if (rows) {
      const header = rows[0].split('|').map((cell) => cell.trim()).filter(Boolean);
      const first = rows.slice(2).map((row) => (row.split('|').map((cell) => cell.trim()).filter(Boolean)[0] || ''));
      const numeric = first.length && first.every((cell) => /^-?[\d.,]+$/.test(cell));
      lines = [':::chart', `type: ${numeric ? 'line' : 'bar'}`, `x: ${header[0] || 'x'}`, 'caption: Chart caption.', '---', ...rows, ':::'];
      toast('Made the chart from your table above. Click it to change it.');
    }
  }
  if (template.kind === 'heading' || template.kind === 'para' || template.kind === 'list' || template.kind === 'quote') {
    flowInsertText(template.kind, lines);
    return;
  }
  flowInsertBlocks(lines, template.kind);
}

function flowTableAbove() {
  const { state } = FLOW.editor;
  const limit = state.selection.from;
  let found = null;
  state.doc.forEach((node, offset) => {
    if (offset >= limit || node.type.name !== 'figureBlock' || node.attrs.kind !== 'table') return;
    const body = flowLines(node.attrs.src);
    const cut = body.indexOf('---');
    const rows = (cut >= 0 ? body.slice(cut + 1) : body).filter((line) => /^\s*\|.*\|\s*$/.test(line));
    if (rows.length >= 3 && /^\s*\|[\s:|-]+\|\s*$/.test(rows[1])) found = rows;
  });
  return found;
}

function flowInsertText(kind, lines) {
  const chain = FLOW.editor.chain().focus();
  const level = (lines[0] || '').match(/^(#{1,3})\s/);
  const { state } = FLOW.editor;
  const $from = state.selection.$from;
  const top = $from.depth ? $from.node(1) : null;
  const empty = top && top.type.name === 'paragraph' && !top.textContent.trim();
  if (!empty) {
    const end = $from.depth ? $from.after(1) : state.selection.to;
    chain.insertContentAt(end, { type: 'paragraph' }).setTextSelection(end + 1);
  }
  if (kind === 'heading' && level) chain.setNode('heading', { level: level[1].length });
  else if (kind === 'list') chain.toggleBulletList();
  else if (kind === 'quote') chain.toggleBlockquote();
  chain.run();
}

function flowWordLists(html) {
  if (!/mso-list|MsoListParagraph/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html.replace(/<!\[if !supportLists\]>|<!\[endif\]>/gi, ''), 'text/html');
  let stack = [];
  [...doc.body.querySelectorAll('p')].forEach((p) => {
    const style = p.getAttribute('style') || '';
    const item = /MsoListParagraph/i.test(p.className || '') || /mso-list:\s*l\d+\s+level\d+/i.test(style);
    if (!item) {
      stack = [];
      return;
    }
    const level = Math.max(1, Number((style.match(/level(\d+)/i) || [0, 1])[1]));
    const marker = [...p.querySelectorAll('span')].find((span) => /mso-list:\s*ignore/i.test(span.getAttribute('style') || ''));
    const mark = marker ? marker.textContent.replace(/\s+/g, ' ').trim() : '';
    if (marker) marker.remove();
    const ordered = /^[(\[]?([0-9]+|[ivxlcdm]+|[a-z])[.)\]]$/i.test(mark);
    const li = doc.createElement('li');
    const inner = doc.createElement('p');
    inner.append(...p.childNodes);
    li.append(inner);
    while (stack.length > level) stack.pop();
    let top = stack[stack.length - 1];
    if (stack.length === level && top && top.tagName !== (ordered ? 'OL' : 'UL')) {
      stack.pop();
      top = stack[stack.length - 1];
    }
    if (stack.length < level) {
      const list = doc.createElement(ordered ? 'ol' : 'ul');
      if (top && top.lastElementChild) top.lastElementChild.append(list);
      else p.before(list);
      stack.push(list);
      while (stack.length < level) {
        const deeper = doc.createElement(ordered ? 'ol' : 'ul');
        list.append(deeper);
        stack.push(deeper);
      }
      top = stack[stack.length - 1];
    }
    top.append(li);
    p.remove();
  });
  return doc.body.innerHTML;
}

function flowPasteFiles(event) {
  const files = [...((event.clipboardData && event.clipboardData.files) || [])].filter((file) => file.type.startsWith('image/'));
  if (!files.length) return false;
  event.preventDefault();
  files.forEach(async (file) => {
    const path = await upload(file);
    if (path) flowInsertBlocks([':::figure', `src: ${path}`, 'caption: Figure caption.', 'width: 70%', ':::'], 'figure');
  });
  return true;
}

function flowDropFiles(view, event) {
  const files = [...((event.dataTransfer && event.dataTransfer.files) || [])].filter((file) => file.type.startsWith('image/'));
  if (!files.length) return false;
  event.preventDefault();
  const spot = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (spot) FLOW.editor.commands.setTextSelection(spot.pos);
  files.forEach(async (file) => {
    const path = await upload(file);
    if (path) flowInsertBlocks([':::figure', `src: ${path}`, 'caption: Figure caption.', 'width: 70%', ':::'], 'figure');
  });
  return true;
}

function flowAlign(value) {
  const editor = FLOW.editor;
  const { state } = editor;
  const justified = !/^(no|off|false)$/i.test(String((S.settings || {}).justify || 'yes'));
  const base = justified ? 'justify' : 'left';
  let tr = state.tr;
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
    if (node.type.name !== 'paragraph') return true;
    const $pos = state.doc.resolve(pos);
    if ($pos.depth !== 0) return false;
    const opts = (node.attrs.opts || []).filter((line) => !line.toLowerCase().startsWith('align:'));
    if (value !== base) opts.unshift(`align: ${value}`);
    tr = tr.setNodeMarkup(pos, null, { ...node.attrs, opts: opts.length ? opts : null });
    return false;
  });
  if (tr.docChanged) editor.view.dispatch(tr);
  flowPaintBar();
  return true;
}

function flowCurrentAlign() {
  const { $from } = FLOW.editor.state.selection;
  const top = $from.depth ? $from.node(1) : null;
  const justified = !/^(no|off|false)$/i.test(String((S.settings || {}).justify || 'yes'));
  if (!top || top.type.name !== 'paragraph') return justified ? 'justify' : 'left';
  return flowOptValue(top.attrs.opts, 'align') || (justified ? 'justify' : 'left');
}

function flowFmtAt() {
  const { state } = FLOW.editor;
  const marks = state.selection.empty ? state.storedMarks || state.selection.$from.marks() : [];
  if (!state.selection.empty) {
    state.doc.nodesBetween(state.selection.from, state.selection.to, (node) => {
      if (node.isText) node.marks.forEach((mark) => marks.push(mark));
    });
  }
  const fmt = marks.find((mark) => mark.type.name === 'fmt');
  return fmt ? attrList(fmt.attrs.attrs) : [];
}

function flowSetFmt(key, value) {
  const editor = FLOW.editor;
  const { state } = editor;
  const type = state.schema.marks.fmt;
  const merge = (list) => {
    const kept = list.filter((item) => item.key !== key && item.flag !== key);
    if (value) kept.push(value === true ? { flag: key } : { key, value });
    return attrString(kept);
  };
  if (state.selection.empty) {
    const marks = state.storedMarks || state.selection.$from.marks();
    const old = marks.find((mark) => mark.type === type);
    const attrs = merge(old ? attrList(old.attrs.attrs) : []);
    let tr = state.tr;
    if (old) tr = tr.removeStoredMark(old);
    if (attrs) tr = tr.addStoredMark(type.create({ attrs }));
    editor.view.dispatch(tr);
    editor.commands.focus();
    return;
  }
  let tr = state.tr;
  const { from, to } = state.selection;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return true;
    const a = Math.max(from, pos);
    const b = Math.min(to, pos + node.nodeSize);
    const old = node.marks.filter((mark) => mark.type === type);
    const attrs = merge(old.length ? attrList(old.map((mark) => mark.attrs.attrs).join(' ')) : []);
    old.forEach((mark) => {
      tr = tr.removeMark(a, b, mark);
    });
    if (attrs) tr = tr.addMark(a, b, type.create({ attrs }));
    return false;
  });
  editor.view.dispatch(tr);
  editor.commands.focus();
}

function flowClearFormat() {
  FLOW.editor.chain().focus().unsetAllMarks().run();
}

function flowBlockType() {
  const { $from } = FLOW.editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'heading') return `h${node.attrs.level}`;
    if (node.type.name === 'blockquote') return 'quote';
    if (node.type.name === 'bulletList') return 'bullet';
    if (node.type.name === 'orderedList') return 'ordered';
  }
  return 'p';
}

function flowSetBlock(value) {
  const chain = FLOW.editor.chain().focus();
  const now = flowBlockType();
  if (now === 'quote' && value !== 'quote') chain.toggleBlockquote();
  if (value === 'p') chain.setParagraph();
  else if (value === 'quote') {
    if (now !== 'quote') chain.setParagraph().toggleBlockquote();
  } else chain.setNode('heading', { level: Number(value.slice(1)) });
  chain.run();
}
