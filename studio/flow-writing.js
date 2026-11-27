function flowSections() {
  const doc = FLOW.editor.state.doc;
  const numbers = new Map(flowHeadingNumbers(doc).map((item) => [item.pos - 1, item.text]));
  const out = [];
  doc.forEach((node, offset) => {
    if (node.type.name === 'heading') out.push({ level: node.attrs.level, text: node.textContent.trim() || 'Untitled', offset, size: node.nodeSize, number: numbers.get(offset) || '', words: 0 });
    else if (out.length) {
      const text = node.type.name === 'figureBlock' ? '' : node.textContent;
      out[out.length - 1].words += (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
    }
  });
  out.forEach((item, index) => {
    let end = doc.content.size;
    for (let j = index + 1; j < out.length; j += 1) {
      if (out[j].level <= item.level) {
        end = out[j].offset;
        break;
      }
    }
    item.end = end;
  });
  return out;
}

function flowOutline() {
  const box = $('#outline');
  const open = localStorage.getItem('studio.outline') === '1' && FLOW.on;
  box.hidden = !open;
  $('#outlineBtn').classList.toggle('on', open);
  if (!open) return;
  const items = flowSections();
  const list = h('div', { class: 'outline-list flow-outline' });
  items.forEach((item, index) => {
    const row = h('button', { type: 'button', class: `ol l${item.level}`, draggable: 'true', 'data-i': index });
    row.append(
      h('span', { class: 'ol-num', text: item.number }),
      h('span', { class: 'ol-text', text: item.text }),
      h('span', { class: 'ol-words', text: item.words ? item.words.toLocaleString() : '' }),
    );
    row.title = `${item.text} · ${item.words.toLocaleString()} words`;
    row.addEventListener('click', () => {
      const dom = FLOW.editor.view.nodeDOM(item.offset);
      const scroll = $('#scroll');
      if (dom) scroll.scrollTo({ top: scroll.scrollTop + dom.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 40, behavior: 'smooth' });
      FLOW.editor.chain().setTextSelection(item.offset + item.size - 1).focus(null, { scrollIntoView: false }).run();
    });
    row.addEventListener('dragstart', (event) => {
      FLOW.dragSection = index;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.text);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      list.querySelectorAll('.drop-above').forEach((node) => node.classList.remove('drop-above'));
    });
    row.addEventListener('dragover', (event) => {
      if (FLOW.dragSection == null) return;
      event.preventDefault();
      list.querySelectorAll('.drop-above').forEach((node) => node.classList.remove('drop-above'));
      row.classList.add('drop-above');
    });
    row.addEventListener('drop', (event) => {
      event.preventDefault();
      const from = FLOW.dragSection;
      FLOW.dragSection = null;
      if (from == null || from === index) return;
      flowMoveSection(items[from], items[index].offset);
    });
    list.append(row);
  });
  const tail = h('div', { class: 'ol-tail' });
  tail.addEventListener('dragover', (event) => {
    if (FLOW.dragSection == null) return;
    event.preventDefault();
    tail.classList.add('drop-above');
  });
  tail.addEventListener('dragleave', () => tail.classList.remove('drop-above'));
  tail.addEventListener('drop', (event) => {
    event.preventDefault();
    const from = FLOW.dragSection;
    FLOW.dragSection = null;
    tail.classList.remove('drop-above');
    if (from != null) flowMoveSection(items[from], FLOW.editor.state.doc.content.size);
  });
  list.append(tail);
  if (!items.length) list.append(h('div', { class: 'empty', text: 'No headings yet' }));
  const total = items.reduce((sum, item) => sum + item.words, 0);
  box.replaceChildren(
    h('div', { class: 'outline-head' }, h('span', { text: 'Outline' }), h('button', { class: 'round', html: icon('close', 14), title: 'Close', onclick: toggleOutline })),
    list,
  );
  if (total) list.title = '';
  flowOutlineActive();
}

function flowMoveSection(item, target) {
  if (target > item.offset && target < item.end) return;
  const { state } = FLOW.editor;
  const slice = state.doc.slice(item.offset, item.end);
  let tr = state.tr.delete(item.offset, item.end);
  const at = tr.mapping.map(target, -1);
  tr = tr.insert(at, slice.content);
  tr = tr.setSelection(TT.TextSelection.create(tr.doc, at + 1));
  FLOW.editor.view.dispatch(tr);
  FLOW.editor.commands.focus(null, { scrollIntoView: false });
  const scroll = $('#scroll');
  let moved = false;
  const stop = () => {
    moved = true;
  };
  scroll.addEventListener('wheel', stop, { once: true, passive: true });
  const place = () => {
    const dom = FLOW.editor.view.nodeDOM(at);
    if (moved || !dom || !dom.getBoundingClientRect) return;
    scroll.scrollTop += dom.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 140;
  };
  requestAnimationFrame(place);
  [400, 1500, 3500].forEach((wait) => setTimeout(place, wait));
  toast('Section moved. Ctrl+Z to undo');
}

function flowOutlineActive() {
  const box = $('#outline');
  if (!FLOW.on || box.hidden) return;
  const rows = [...box.querySelectorAll('.flow-outline .ol')];
  if (!rows.length) return;
  const items = flowSections();
  const top = $('#scroll').getBoundingClientRect().top + 120;
  let active = 0;
  items.forEach((item, index) => {
    const dom = FLOW.editor.view.nodeDOM(item.offset);
    if (dom && dom.getBoundingClientRect().top <= top) active = index;
  });
  rows.forEach((row, index) => row.classList.toggle('now', index === active));
}

function flowFocusMode(on) {
  const want = on === undefined ? !document.documentElement.classList.contains('focus-mode') : on;
  if (want && !FLOW.on) flowShow(true);
  document.documentElement.classList.toggle('focus-mode', want);
  if (FLOW.editor) FLOW.editor.view.dispatch(FLOW.editor.state.tr.setMeta('focusMode', want).setMeta('addToHistory', false));
  if (want) {
    if (!FLOW.focusExit) {
      FLOW.focusExit = h('button', { type: 'button', id: 'focusExit', class: 'pill soft', html: `${icon('eye', 15)}<span>Exit focus</span>` });
      FLOW.focusExit.addEventListener('click', () => flowFocusMode(false));
      document.body.append(FLOW.focusExit);
    }
    flowFocusPaint();
    FLOW.editor.commands.focus();
    toast('Focus mode. Esc to exit');
  } else {
    FLOW.root && FLOW.root.querySelectorAll('.focus-now').forEach((node) => node.classList.remove('focus-now'));
  }
}

function flowFocusPaint() {
  if (!document.documentElement.classList.contains('focus-mode') || !FLOW.editor) return;
  const at = FLOW.editor.view.coordsAtPos(FLOW.editor.state.selection.from);
  const scroll = $('#scroll');
  const box = scroll.getBoundingClientRect();
  const want = box.top + box.height * 0.42;
  if (Math.abs(at.top - want) > 60) scroll.scrollBy({ top: at.top - want, behavior: 'smooth' });
}

const FLOW_SHORTCUTS = [
  ['Writing', [
    ['Ctrl+B', 'Bold'], ['Ctrl+I', 'Italic'], ['Ctrl+U', 'Underline'], ['Ctrl+Shift+S', 'Strikethrough'], ['Ctrl+.', 'Superscript'], ['Ctrl+,', 'Subscript'], ['Ctrl+Shift+> / <', 'Bigger / smaller text'],
    ['Ctrl+M', 'Maths'], ['Shift+Enter', 'Line break'], ['/', 'Insert anything'], ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'],
  ]],
  ['Paragraphs', [
    ['Ctrl+Alt+1 / 2 / 3', 'Heading / Sub-heading / Sub-sub-heading'], ['Ctrl+Alt+0', 'Text'], ['Ctrl+Shift+8', 'Bullets'], ['Ctrl+Shift+7', 'Numbers'],
    ['Tab / Shift+Tab', 'Indent list item'], ['Ctrl+Shift+L / E / R / J', 'Left / Centre / Right / Justify'], ['Alt+↑ / Alt+↓', 'Move paragraph or block'],
    ['# then space', 'Heading'], ['- then space', 'Bullet list'], ['1. then space', 'Numbered list'], ['> then space', 'Quote'],
  ]],
  ['Essay', [
    ['Ctrl+F', 'Find'], ['Ctrl+H', 'Find and replace'], ['Ctrl+K', 'Search actions'], ['Ctrl+Shift+P', 'Print preview'], ['Ctrl+Shift+F', 'Focus mode'],
    ['Ctrl+= / Ctrl+−', 'Zoom in / out'], ['Ctrl+/', 'Shortcuts'],
  ]],
];

function flowShortcuts() {
  const old = document.getElementById('keysSheet');
  if (old) {
    old.remove();
    return;
  }
  const back = h('div', { id: 'keysSheet', class: 'keys-back' });
  const card = h('div', { class: 'keys-card' });
  card.append(h('div', { class: 'keys-head' }, h('span', { text: 'Keyboard shortcuts' }), h('button', { type: 'button', class: 'round', html: icon('close', 16), title: 'Close', onclick: () => back.remove() })));
  const cols = h('div', { class: 'keys-cols' });
  FLOW_SHORTCUTS.forEach(([title, rows]) => {
    const col = h('div', { class: 'keys-col' }, h('div', { class: 'keys-title', text: title }));
    rows.forEach(([keys, what]) => {
      const keyBox = h('span', { class: 'keys-k' });
      keys.split(' / ').forEach((combo, index) => {
        if (index) keyBox.append(h('span', { class: 'keys-or', text: '/' }));
        combo.split('+').forEach((part, i) => {
          if (i) keyBox.append(h('span', { class: 'keys-plus', text: '+' }));
          keyBox.append(h('kbd', { text: part.trim() }));
        });
      });
      col.append(h('div', { class: 'keys-row' }, h('span', { class: 'keys-what', text: what }), keyBox));
    });
    cols.append(col);
  });
  card.append(cols);
  back.append(card);
  back.addEventListener('mousedown', (event) => {
    if (event.target === back) back.remove();
  });
  document.body.append(back);
}

function flowSyllables(word) {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (clean.length <= 3) return 1;
  const trimmed = clean.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  return Math.max(1, (trimmed.match(/[aeiouy]{1,2}/g) || []).length);
}

function flowStatsData() {
  const doc = FLOW.editor.state.doc;
  const texts = [];
  doc.descendants((node) => {
    if (node.type.name === 'figureBlock') return false;
    if (node.isTextblock) {
      texts.push(node.textContent);
      return false;
    }
    return true;
  });
  const all = texts.join('\n');
  const words = all.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];
  const sentences = all.split(/[.!?]+(?=\s|$)/).filter((part) => /[\p{L}\p{N}]/u.test(part));
  const syllables = words.reduce((sum, word) => sum + flowSyllables(word), 0);
  const ease = words.length && sentences.length ? 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllables / words.length) : 0;
  const stop = new Set('the a an and or of to in on for with as by at from that this is are was were be been it its their there which who whom what when where how not but also than then into over more most such these those can could would should may might will has have had do does did i we you he she they them his her our your my me us'.split(' '));
  const counts = new Map();
  words.forEach((word) => {
    const low = word.toLowerCase();
    if (low.length > 3 && !stop.has(low)) counts.set(low, (counts.get(low) || 0) + 1);
  });
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return {
    words: words.length,
    counted: Number(S.words) || 0,
    characters: all.replace(/\n/g, '').length,
    paragraphs: texts.filter((text) => text.trim()).length,
    sentences: sentences.length,
    minutes: Math.max(1, Math.round(words.length / 230)),
    average: sentences.length ? words.length / sentences.length : 0,
    ease,
    top,
  };
}

function flowGoalKey() {
  return `studio.goal.${S.name || 'essay'}`;
}

function flowStats() {
  const old = document.getElementById('statsSheet');
  if (old) {
    old.remove();
    return;
  }
  flowMount();
  if (FLOW.lastSource === null) flowLoad();
  else flowPull();
  const data = flowStatsData();
  const limit = parseInt(String(headerValue('word-limit') || '').replace(/[^\d]/g, ''), 10) || 0;
  let goal = {};
  try {
    goal = JSON.parse(localStorage.getItem(flowGoalKey()) || '{}');
  } catch (error) {
    goal = {};
  }
  const back = h('div', { id: 'statsSheet', class: 'keys-back' });
  const card = h('div', { class: 'keys-card stats-card' });
  const head = h('div', { class: 'keys-head' }, h('span', { text: 'Essay statistics' }), h('button', { type: 'button', class: 'round', html: icon('close', 16), title: 'Close', onclick: () => back.remove() }));
  const tile = (value, label) => h('div', { class: 'stat-tile' }, h('b', { text: value }), h('span', { text: label }));
  const grade = data.ease >= 60 ? 'Easy' : data.ease >= 45 ? 'Standard' : data.ease >= 30 ? 'Academic' : 'Very dense';
  const tiles = h(
    'div',
    { class: 'stat-tiles' },
    tile(data.counted.toLocaleString(), limit ? `of ${limit.toLocaleString()} counted` : 'words counted'),
    tile(data.words.toLocaleString(), 'words in all text'),
    tile(data.characters.toLocaleString(), 'characters'),
    tile(String(data.paragraphs), 'paragraphs'),
    tile(String(data.sentences), 'sentences'),
    tile(`${data.minutes} min`, 'reading time'),
    tile(data.average.toFixed(1), 'words per sentence'),
    tile(grade, `readability ${Math.round(data.ease)}`),
  );
  const words = h('div', { class: 'stat-words' }, h('div', { class: 'keys-title', text: 'Most used words' }), h('div', { class: 'stat-chips' }, ...data.top.map(([word, count]) => h('span', { class: 'stat-chip' }, h('span', { text: word }), h('i', { text: String(count) })))));
  const target = h('input', { type: 'number', min: '0', step: '50', class: 'fpop-input', value: String(goal.target || limit || '') });
  const due = h('input', { type: 'date', class: 'fpop-input', value: goal.due || '' });
  const plan = h('div', { class: 'stat-plan' });
  const paintPlan = () => {
    const want = parseInt(target.value, 10) || 0;
    const date = due.value ? new Date(`${due.value}T23:59:00`) : null;
    localStorage.setItem(flowGoalKey(), JSON.stringify({ target: want, due: due.value }));
    plan.replaceChildren();
    if (!want) return;
    const left = Math.max(0, want - data.counted);
    const share = Math.min(1, data.counted / want);
    const bar = h('div', { class: 'stat-bar' }, h('i'));
    bar.firstChild.style.width = `${share * 100}%`;
    plan.append(bar);
    if (!left) {
      plan.append(h('div', { class: 'stat-line', text: 'Target reached' }));
      return;
    }
    if (!date) {
      plan.append(h('div', { class: 'stat-line', text: `${left.toLocaleString()} words to go` }));
      return;
    }
    const days = Math.ceil((date - new Date()) / 86400000);
    if (days <= 0) plan.append(h('div', { class: 'stat-line late', text: `${left.toLocaleString()} words to go, deadline passed` }));
    else plan.append(h('div', { class: 'stat-line' }, h('b', { text: `${Math.ceil(left / days).toLocaleString()} words a day` }), h('span', { text: ` for ${days} ${days === 1 ? 'day' : 'days'} · ${left.toLocaleString()} to go` })));
  };
  target.addEventListener('input', paintPlan);
  due.addEventListener('input', paintPlan);
  const goalBox = h(
    'div',
    { class: 'stat-goal' },
    h('div', { class: 'keys-title', text: 'Goal' }),
    h('div', { class: 'stat-goal-row' }, h('label', {}, h('span', { text: 'Target words' }), target), h('label', {}, h('span', { text: 'Deadline' }), due)),
    plan,
  );
  card.append(head, tiles, h('div', { class: 'stat-cols' }, goalBox, words));
  back.append(card);
  back.addEventListener('mousedown', (event) => {
    if (event.target === back) back.remove();
  });
  back.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') back.remove();
  });
  document.body.append(back);
  paintPlan();
}

const FLOW_TOUR_VISUAL = ['chart', 'table', 'pipetable', 'figure', 'figures', 'image', 'timeline', 'flow', 'map'].map((kind) => `.fb[data-kind="${kind}"]`).join(', ');

const FLOW_TOUR = [
  {
    title: 'This is Essay Builder',
    text: 'You write straight onto the real pages. The cover, contents, page numbers and footnotes are done for you.',
    centre: true,
  },
  {
    title: 'Just type',
    text: 'Click anywhere and write. Enter starts a new paragraph, and the toolbar styles your text.',
    show: () => flowFocusStart(),
    points: [() => $('#fbar .fpick.style'), () => $('#fbar [data-cmd="bold"]')],
  },
  {
    title: 'Insert anything',
    text: 'Press Add, or type / on an empty line. Charts, tables, maps, equations and many more.',
    show: () => reveal($('#palette')),
    hide: () => conceal($('#palette')),
    points: [() => $('#fbar .fpick.addmenu'), () => [...document.querySelectorAll('#palette .palette-grid button')].find((tile) => tile.title === 'Chart')],
  },
  {
    title: 'Cite and refer',
    text: 'Press Add and choose Citation, or type @ to cite a source or point to a figure. Numbers and references update by themselves.',
    points: [() => $('#fbar .fpick.addmenu')],
  },
  {
    title: 'Change a chart or table',
    text: 'Click it to edit. Tables are edited right on the page.',
    needs: () => Boolean(FLOW.root.querySelector(FLOW_TOUR_VISUAL)),
    show: () => {
      const dom = FLOW.root.querySelector(FLOW_TOUR_VISUAL);
      if (!dom) return;
      const scroll = $('#scroll');
      scroll.scrollTop += dom.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 160;
      dom.classList.add('tour-hover');
      TOUR.flowFig = dom;
    },
    hide: () => TOUR.flowFig && TOUR.flowFig.classList.remove('tour-hover'),
    points: [() => TOUR.flowFig && TOUR.flowFig.querySelector('.fb-bar')],
  },
  {
    title: 'Your outline',
    text: 'Jump to any section, see its word count, and drag sections to reorder them.',
    show: () => {
      TOUR.outlineWas = localStorage.getItem('studio.outline');
      localStorage.setItem('studio.outline', '1');
      renderOutline();
    },
    hide: () => {
      localStorage.setItem('studio.outline', TOUR.outlineWas === '1' ? '1' : '0');
      renderOutline();
    },
    points: [() => $('#outline')],
  },
  {
    title: 'Word count',
    text: 'Counted the way the IB counts, against your word limit. Select text to count just that.',
    points: [() => $('#statusPill .words') || $('#statusPill span:nth-child(2)')],
  },
  { title: 'Write or preview', text: 'Preview shows your essay exactly as the PDF. Press Write to keep editing.', points: [() => $('.view-switch')] },
  { title: 'Hand it in', text: 'It saves by itself as you go. Export when you are ready.', points: [() => $('#export')] },
];
