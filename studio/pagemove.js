const PAGE_LEAD = ['numbering', 'overlay'];

function startsPage(range) {
  if (!range) return false;
  if (['pagebreak', 'blank', 'design', 'landscape'].includes(range.kind)) return true;
  const body = linesOf(range);
  const first = body[0] || '';
  if (range.kind === 'heading') {
    if (!/^#\s/.test(first) || /^(no|off|false)$/i.test(S.settings['section-breaks'] || 'yes')) return false;
    return !/\{[^{}]*\b(samepage|nobreak)\b[^{}]*\}\s*$/.test(first);
  }
  if (range.kind === 'text') return body.some((line) => /^page:\s*(new|yes|true)\s*$/i.test(line.trim()));
  return false;
}

function pageGroups() {
  const groups = [];
  let current = null;
  let carry = [];
  S.ranges.forEach((range) => {
    if (PAGE_LEAD.includes(range.kind)) {
      carry.push(range);
      return;
    }
    if (!current || startsPage(range)) {
      current = { ranges: [] };
      groups.push(current);
    }
    current.ranges.push(...carry, range);
    carry = [];
  });
  if (carry.length && current) current.ranges.push(...carry);
  groups.forEach((group) => {
    const pages = group.ranges.flatMap((range) => (S.regions[range.id] || []).map((span) => span.page));
    group.first = pages.length ? Math.min(...pages) : null;
    group.last = pages.length ? Math.max(...pages) : null;
    group.start = group.ranges[0].start;
    group.end = group.ranges[group.ranges.length - 1].end;
    group.hard = startsPage(group.ranges.find((range) => !PAGE_LEAD.includes(range.kind)));
  });
  return groups;
}

function groupTexts(groups) {
  const all = lines();
  const head = all.slice(0, groups[0].start - 1);
  const texts = groups.map((group, index) => {
    const stop = index + 1 < groups.length ? groups[index + 1].start - 1 : all.length;
    const part = all.slice(group.start - 1, stop);
    while (part.length && !part[part.length - 1].trim()) part.pop();
    return { lines: part, hard: group.hard };
  });
  return { head, texts };
}

function writeGroups(head, texts) {
  const out = [...head];
  while (out.length && !out[out.length - 1].trim()) out.pop();
  texts.forEach((text, index) => {
    let part = text.lines;
    if (index > 0 && !text.hard) part = [':::pagebreak', '', ...part];
    if (index === 0 && part[0] && part[0].trim() === ':::pagebreak') {
      part = part.slice(1);
      while (part.length && !part[0].trim()) part = part.slice(1);
    }
    if (out.length) out.push('');
    out.push(...part);
  });
  return `${out.join('\n')}\n`;
}

function movePages(from, to) {
  const groups = pageGroups();
  if (!groups[from] || to === from || to === from + 1) return;
  const { head, texts } = groupTexts(groups);
  const [moving] = texts.splice(from, 1);
  texts.splice(to > from ? to - 1 : to, 0, moving);
  unpickPage();
  restoreSource(writeGroups(head, texts));
  toast('Moved. Ctrl+Z brings it back.');
}

function duplicatePages(index) {
  const groups = pageGroups();
  if (!groups[index]) return;
  const { head, texts } = groupTexts(groups);
  texts.splice(index + 1, 0, { lines: [...texts[index].lines], hard: texts[index].hard });
  unpickPage();
  S.arrivePage = groups[index].last + 1;
  restoreSource(writeGroups(head, texts));
  toast('Page duplicated');
}

function pageTools(pageIndex, groups) {
  const index = groups.findIndex((group) => group.first !== null && group.first <= pageIndex && pageIndex <= group.last);
  if (index < 0) return [];
  const group = groups[index];
  const count = group.last - group.first + 1;
  const many = count > 1 ? ` (${count} pages)` : '';
  const copy = h('button', {
    type: 'button',
    class: 'page-tool page-dup',
    title: `Duplicate${many}`,
    html: icon('copy', 15),
    onclick: (event) => {
      event.stopPropagation();
      duplicatePages(index);
    },
  });
  const grip = h('button', { type: 'button', class: 'page-tool page-move', title: `Drag to move${many}`, html: icon('grip', 15) });
  grip.addEventListener('pointerdown', (event) => startPageDrag(event, index));
  return [copy, grip];
}

function startPageDrag(event, index) {
  if (event.button) return;
  event.preventDefault();
  event.stopPropagation();
  const groups = pageGroups();
  const group = groups[index];
  const pages = [...$('#pages').children];
  const scroll = $('#scroll');
  const lifted = pages.slice(group.first, group.last + 1);
  const slots = [];
  groups.forEach((item, at) => {
    if (item.first === null) return;
    slots.push({ at, page: item.first, edge: 'top' });
  });
  slots.push({ at: groups.length, page: pages.length - 1, edge: 'bottom' });
  const usable = slots.filter((slot) => slot.at !== index && slot.at !== index + 1);
  if (!usable.length) return;
  const line = h('div', { class: 'page-drop' });
  scroll.append(line);
  lifted.forEach((div) => div.classList.add('lifting'));
  document.body.classList.add('page-dragging');
  let chosen = null;
  let moved = false;
  let last = event;
  let timer = null;
  const place = () => {
    let best = null;
    usable.forEach((slot) => {
      const div = pages[slot.page];
      if (!div) return;
      const r = div.getBoundingClientRect();
      const y = slot.edge === 'top' ? r.top - 14 : r.bottom + 14;
      const distance = Math.abs(last.clientY - y);
      if (!best || distance < best.distance) best = { slot, y, distance, left: r.left, width: r.width };
    });
    chosen = best && best.slot;
    if (best) line.style.cssText = `left:${best.left}px;top:${best.y - 2}px;width:${best.width}px`;
  };
  const edge = () => {
    const frame = scroll.getBoundingClientRect();
    const step = last.clientY > frame.bottom - 60 ? 26 : last.clientY < frame.top + 60 ? -26 : 0;
    if (step) {
      scroll.scrollTop += step;
      place();
    }
    timer = step ? requestAnimationFrame(edge) : null;
  };
  const move = (pointer) => {
    last = pointer;
    if (!moved && Math.abs(pointer.clientY - event.clientY) < 8) return;
    moved = true;
    line.classList.add('on');
    place();
    if (!timer) edge();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('keydown', cancel, true);
    if (timer) cancelAnimationFrame(timer);
    line.remove();
    lifted.forEach((div) => div.classList.remove('lifting'));
    document.body.classList.remove('page-dragging');
    if (moved && chosen) movePages(index, chosen.at);
  };
  const cancel = (key) => {
    if (key.key !== 'Escape') return;
    chosen = null;
    up();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('keydown', cancel, true);
}
