let drag = null;

function boundaries() {
  const list = [];
  const perPage = new Map();
  S.ranges.forEach((range) => {
    (S.regions[range.id] || []).forEach((span, index) => {
      if (!perPage.has(span.page)) perPage.set(span.page, []);
      perPage.get(span.page).push({ range, span, first: index === 0, last: index === (S.regions[range.id] || []).length - 1 });
    });
  });
  perPage.forEach((items, page) => {
    items.sort((a, b) => a.span.y0 - b.span.y0);
    const size = S.pages[page];
    const top = marginPt();
    const bottom = size.h - marginPt() * 0.6;
    const head = items[0];
    if (head.first) list.push({ page, y: Math.max(head.span.y0 - 8, top - 6), range: head.range, where: 'before' });
    for (let i = 0; i < items.length - 1; i += 1) {
      const next = items[i + 1];
      if (!next.first) continue;
      list.push({ page, y: (items[i].span.y1 + next.span.y0) / 2, range: next.range, where: 'before' });
    }
    const tail = items[items.length - 1];
    if (tail.last) list.push({ page, y: Math.min(tail.span.y1 + 8, bottom), range: tail.range, where: 'after' });
  });
  return list;
}

function drawInsertPoints() {
  const box = $('#pages');
  S.bounds = boundaries();
  const side = Math.max(0, marginPt() - 10) * S.scale;
  S.bounds.forEach((bound) => {
    const div = box.children[bound.page];
    if (!div) return;
    const strip = h(
      'div',
      { class: 'ins', style: `left:${side}px;right:${side}px;top:${bound.y * S.scale - 9}px`, title: 'Add here' },
      h('span', { class: 'ins-line' }),
      h('button', { type: 'button', class: 'ins-plus', html: icon('plus', 14) }),
    );
    strip.addEventListener('click', (event) => {
      event.stopPropagation();
      openInsertAt(bound);
    });
    div.append(strip);
  });
}

function showMarker(bound) {
  clearMarker();
  const div = $('#pages').children[bound.page];
  if (!div) return;
  const side = Math.max(0, marginPt() - 10) * S.scale;
  div.append(h('div', { class: 'ins-marker', style: `left:${side}px;right:${side}px;top:${bound.y * S.scale - 1}px` }));
}

function clearMarker() {
  document.querySelectorAll('.ins-marker, .drop-line').forEach((node) => node.remove());
}

function openInsertAt(bound) {
  closeEditor(true);
  S.target = { range: bound.range, where: bound.where };
  showMarker(bound);
  const palette = $('#palette');
  reveal(palette);
  const search = palette.querySelector('.palette-search');
  if (search) {
    search.value = '';
    search.dispatchEvent(new Event('input'));
    search.focus();
  }
}

function openSlash() {
  if (!S.edit) return;
  S.target = { range: S.edit.range, where: 'replace' };
  const palette = $('#palette');
  reveal(palette);
  const search = palette.querySelector('.palette-search');
  if (search) {
    search.value = '';
    search.dispatchEvent(new Event('input'));
    search.focus();
  }
}

function cancelTarget() {
  S.target = null;
  clearMarker();
}

function appendAtEnd(event) {
  if (event.target.closest('.hit, .ins, .editor, .fmtbar, .chip-pop, .tool, .resize-ghost, .grip, .ins-marker')) return;
  const div = event.target.closest('.page');
  if (!div || !S.bounds) return;
  const index = [...$('#pages').children].indexOf(div);
  const rect = div.getBoundingClientRect();
  const x = (event.clientX - rect.left) / S.scale;
  const y = (event.clientY - rect.top) / S.scale;
  const margin = marginPt();
  if (x < margin || x > S.pages[index].w - margin) return;
  const tails = S.bounds.filter((bound) => bound.page === index && bound.where === 'after');
  const tail = tails[tails.length - 1];
  if (!tail || y < tail.y - 2) return;
  S.target = { range: tail.range, where: 'after' };
  S.sel = tail.range;
  insertLines(['New paragraph.'], 'para');
}

function nearestBound(clientX, clientY) {
  const pages = [...$('#pages').children];
  const at = pages.findIndex((div) => {
    const r = div.getBoundingClientRect();
    return clientY >= r.top - 12 && clientY <= r.bottom + 12;
  });
  if (at < 0) return null;
  const rect = pages[at].getBoundingClientRect();
  const y = (clientY - rect.top) / S.scale;
  let best = null;
  S.bounds.filter((bound) => bound.page === at).forEach((bound) => {
    const distance = Math.abs(bound.y - y);
    if (!best || distance < best.distance) best = { bound, distance };
  });
  return best ? best.bound : null;
}

function startDrag(event, range) {
  event.preventDefault();
  closeEditor(true);
  drag = { range, bound: null, ticking: false, x: event.clientX, y: event.clientY };
  document.body.classList.add('dragging');
  document.addEventListener('pointermove', onDrag);
  document.addEventListener('pointerup', endDrag, { once: true });
}

function onDrag(event) {
  if (!drag) return;
  drag.x = event.clientX;
  drag.y = event.clientY;
  if (drag.ticking) return;
  drag.ticking = true;
  requestAnimationFrame(() => {
    if (!drag) return;
    drag.ticking = false;
    const scroll = $('#scroll');
    const edge = scroll.getBoundingClientRect();
    if (drag.y < edge.top + 70) scroll.scrollTop -= 18;
    else if (drag.y > edge.bottom - 70) scroll.scrollTop += 18;
    const bound = nearestBound(drag.x, drag.y);
    if (bound !== drag.bound) {
      drag.bound = bound;
      if (bound) showMarker(bound);
    }
  });
}

function endDrag() {
  document.removeEventListener('pointermove', onDrag);
  document.body.classList.remove('dragging');
  const state = drag;
  drag = null;
  clearMarker();
  if (state && state.bound) moveBlockTo(state.range, { range: state.bound.range, where: state.bound.where });
}

function moveBlockTo(range, target) {
  const order = S.ranges.indexOf(range);
  const near = target.where === 'before' ? S.ranges[order + 1] : S.ranges[order - 1];
  if (target.range === range || near === target.range) return;
  closeEditor(true);
  const all = lines();
  const count = range.end - range.start + 1;
  const chunk = all.slice(range.start - 1, range.end);
  let from = range.start - 1;
  let removed = count;
  if (all[range.end] !== undefined && !all[range.end].trim()) removed += 1;
  else if (from > 0 && !all[from - 1].trim()) {
    from -= 1;
    removed += 1;
  }
  const spot = target.where === 'before' ? target.range.start - 1 : target.range.end;
  all.splice(from, removed);
  const dest = spot >= from + removed ? spot - removed : spot;
  if (target.where === 'before') {
    all.splice(dest, 0, ...chunk, '');
    S.pendingStart = dest + 1;
  } else {
    all.splice(dest, 0, '', ...chunk);
    S.pendingStart = dest + 2;
  }
  S.source = all.join('\n');
  S.sel = null;
  S.ranges = [];
  closePanel();
  lockHits();
  schedule(0);
}

function attachGrip(range) {
  const span = firstSpan(range);
  if (!span) return;
  const div = $('#pages').children[span.page];
  if (!div) return;
  const side = Math.max(0, marginPt() - 10) * S.scale;
  const grip = h('div', { class: 'grip', title: 'Drag to move (Alt+Up or Alt+Down)', html: icon('grip', 16) });
  grip.style.left = `${Math.max(side - 26, 2)}px`;
  grip.style.top = `${span.y0 * S.scale + 2}px`;
  grip.addEventListener('pointerdown', (event) => startDrag(event, range));
  div.append(grip);
}

function bindPlace() {
  $('#pages').addEventListener('dblclick', appendAtEnd);
}

function finishInsert(fresh, kind) {
  closePanel();
  S.settingsOpen = false;
  S.sel = fresh;
  S.focusNew = true;
  lockHits();
  if (!TEXT_KINDS.has(kind)) openPanel(fresh);
  placeOverlays();
  schedule(200);
}

function insertBefore(target, block, kind) {
  const all = lines();
  const at = target.start - 1;
  all.splice(at, 0, ...block, '');
  S.source = all.join('\n');
  shiftAfter(at, block.length + 1);
  const fresh = { id: `n${++S.seq}`, start: at + 1, end: at + block.length, kind };
  S.ranges.splice(S.ranges.indexOf(target), 0, fresh);
  finishInsert(fresh, kind);
}

function replaceWith(target, block, kind) {
  setRangeLines(target, block);
  target.kind = kind;
  finishInsert(target, kind);
}
