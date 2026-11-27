const FLOW_NOTES_KEY = new TT.PluginKey('flowNotes');

function flowNotesKey() {
  return `studio.notes.${S.name || 'essay'}`;
}

function flowNotesLoad() {
  try {
    FLOW.notes = JSON.parse(localStorage.getItem(flowNotesKey()) || '[]');
  } catch (error) {
    FLOW.notes = [];
  }
}

function flowNotesSave() {
  localStorage.setItem(flowNotesKey(), JSON.stringify(FLOW.notes || []));
}

function flowTextIndex(doc) {
  let text = '';
  const at = [];
  doc.descendants((node, pos) => {
    if (node.isText) {
      for (let i = 0; i < node.text.length; i += 1) at.push(pos + i);
      text += node.text;
    } else if (node.isBlock && text && !text.endsWith('\n')) {
      at.push(pos);
      text += '\n';
    }
    return true;
  });
  return { text, at };
}

function flowNoteRanges(doc) {
  const out = [];
  if (!FLOW.notes || !FLOW.notes.length) return out;
  const { text, at } = flowTextIndex(doc);
  FLOW.notes.forEach((note) => {
    if (!note.quote) return;
    let best = -1;
    let bestScore = -1;
    let index = text.indexOf(note.quote);
    while (index >= 0) {
      const before = text.slice(Math.max(0, index - 24), index);
      const after = text.slice(index + note.quote.length, index + note.quote.length + 24);
      let score = 0;
      if (note.prefix && before.endsWith(note.prefix.slice(-12))) score += 2;
      if (note.suffix && after.startsWith(note.suffix.slice(0, 12))) score += 2;
      if (score > bestScore) {
        best = index;
        bestScore = score;
      }
      index = text.indexOf(note.quote, index + 1);
    }
    if (best < 0) return;
    const from = at[best];
    const to = at[best + note.quote.length - 1] + 1;
    if (from != null && to > from) out.push({ id: note.id, from, to });
  });
  return out;
}

const FlowNotes = () => TT.Extension.create({
  name: 'flowNotes',
  addProseMirrorPlugins() {
    return [new TT.Plugin({
      key: FLOW_NOTES_KEY,
      state: {
        init: () => TT.DecorationSet.empty,
        apply: (tr, old, _, state) => {
          if (!tr.docChanged && !tr.getMeta(FLOW_NOTES_KEY)) return old;
          return TT.DecorationSet.create(state.doc, flowNoteRanges(state.doc).map((range) => TT.Decoration.inline(range.from, range.to, { class: `note-mark${FLOW.noteOn === range.id ? ' on' : ''}`, 'data-note': range.id })));
        },
      },
      props: {
        decorations(state) {
          return FLOW_NOTES_KEY.getState(state);
        },
        handleClick(view, pos, event) {
          const mark = event.target.closest && event.target.closest('.note-mark');
          if (!mark) return false;
          flowNoteFocus(mark.dataset.note);
          return false;
        },
      },
    })];
  },
});

function flowNotesRefresh() {
  if (!FLOW.editor) return;
  FLOW.editor.view.dispatch(FLOW.editor.state.tr.setMeta(FLOW_NOTES_KEY, true).setMeta('addToHistory', false));
  requestAnimationFrame(flowNotesPlace);
}

function flowNoteAdd() {
  const { state } = FLOW.editor;
  const { from, to, empty } = state.selection;
  if (empty) {
    toast('Select some text first');
    return;
  }
  const { text, at } = flowTextIndex(state.doc);
  const start = at.findIndex((pos) => pos >= from);
  let end = at.findIndex((pos) => pos >= to);
  if (end < 0) end = text.length;
  const quote = text.slice(start, end);
  if (!quote.trim()) return;
  const note = { id: `n${Date.now().toString(36)}`, quote, prefix: text.slice(Math.max(0, start - 24), start), suffix: text.slice(end, end + 24), text: '', made: Date.now() };
  FLOW.notes = [...(FLOW.notes || []), note];
  flowNotesSave();
  flowNotesRefresh();
  setTimeout(() => flowNoteFocus(note.id, true), 30);
}

function flowNoteFocus(id, edit = false) {
  FLOW.noteOn = id;
  flowNotesRefresh();
  setTimeout(() => {
    const card = FLOW.root.querySelector(`.note-card[data-id="${id}"]`);
    if (!card) return;
    if (edit) {
      const area = card.querySelector('textarea');
      if (area) area.focus();
    }
  }, 40);
}

function flowNotesPlace() {
  if (!FLOW.root || !FLOW.sheet) return;
  let rail = FLOW.sheet.querySelector('.note-rail');
  if (!rail) {
    rail = h('div', { class: 'note-rail', contenteditable: 'false' });
    FLOW.sheet.append(rail);
  }
  const notes = FLOW.notes || [];
  FLOW.sheet.classList.toggle('has-notes', notes.length > 0);
  if (Boolean(notes.length) !== Boolean(FLOW.hadNotes) && FLOW.sideChanged) FLOW.sideChanged();
  FLOW.hadNotes = notes.length > 0;
  if (!notes.length) {
    rail.replaceChildren();
    return;
  }
  const sheetTop = FLOW.sheet.getBoundingClientRect().top;
  const placed = [];
  const lost = [];
  notes.forEach((note) => {
    const mark = FLOW.root.querySelector(`.note-mark[data-note="${note.id}"]`);
    if (mark) placed.push({ note, y: (mark.getBoundingClientRect().top - sheetTop) / flowZoom() });
    else lost.push(note);
  });
  placed.sort((a, b) => a.y - b.y);
  const cards = [];
  let floor = 0;
  placed.forEach(({ note, y }) => {
    const card = flowNoteCard(note, false);
    const top = Math.max(y - 6, floor);
    card.style.top = `${top}px`;
    cards.push(card);
    floor = top + (note.id === FLOW.noteOn ? 150 : 74);
  });
  lost.forEach((note) => {
    const card = flowNoteCard(note, true);
    card.style.top = `${floor}px`;
    floor += 74;
    cards.push(card);
  });
  rail.replaceChildren(...cards);
}

function flowNoteCard(note, lost) {
  const on = note.id === FLOW.noteOn;
  const card = h('div', { class: `note-card${on ? ' on' : ''}${lost ? ' lost' : ''}`, 'data-id': note.id });
  const area = h('textarea', { rows: on ? 3 : 1, placeholder: 'Note', spellcheck: 'true' });
  area.value = note.text;
  area.addEventListener('input', () => {
    note.text = area.value;
    flowNotesSave();
  });
  area.addEventListener('focus', () => {
    if (FLOW.noteOn !== note.id) {
      FLOW.noteOn = note.id;
      FLOW.editor.view.dispatch(FLOW.editor.state.tr.setMeta(FLOW_NOTES_KEY, true).setMeta('addToHistory', false));
      card.classList.add('on');
    }
  });
  area.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
      event.preventDefault();
      FLOW.noteOn = null;
      flowNotesRefresh();
      FLOW.editor.commands.focus();
    }
  });
  const done = h('button', { type: 'button', class: 'note-done', html: icon('check', 14), title: 'Resolve' });
  done.addEventListener('mousedown', (event) => {
    event.preventDefault();
    FLOW.notes = FLOW.notes.filter((item) => item.id !== note.id);
    flowNotesSave();
    FLOW.noteOn = null;
    flowNotesRefresh();
  });
  const quote = h('div', { class: 'note-quote', text: lost ? `Text changed: “${note.quote.slice(0, 60)}”` : note.quote.slice(0, 80) });
  card.append(h('div', { class: 'note-top' }, quote, done), area);
  card.addEventListener('mousedown', (event) => {
    if (event.target.closest('textarea, button')) return;
    event.preventDefault();
    const range = flowNoteRanges(FLOW.editor.state.doc).find((item) => item.id === note.id);
    if (range) FLOW.editor.chain().setTextSelection(range).focus().run();
    flowNoteFocus(note.id);
  });
  return card;
}
