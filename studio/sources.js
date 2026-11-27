const SRC = { root: null, fields: {}, keyed: false, onInsert: null, here: null, timer: 0, seq: 0 };

const SRC_MARK = '';

const SRC_TYPES = [
  ['book', 'Book'],
  ['article', 'Article'],
  ['website', 'Website'],
  ['video', 'Video'],
];

const SRC_MORE = { chapter: 'Chapter', newspaper: 'Newspaper', report: 'Report', thesis: 'Thesis', dataset: 'Dataset' };

const SRC_FORMS = {
  book: [['author', 'Authors'], ['date', 'Year'], ['title', 'Title'], ['publisher', 'Publisher'], ['city', 'City'], ['edition', 'Edition'], ['doi', 'DOI'], ['url', 'Link']],
  article: [['author', 'Authors'], ['date', 'Year'], ['title', 'Title'], ['container', 'Journal'], ['volume', 'Volume'], ['issue', 'Issue'], ['pages', 'Pages'], ['doi', 'DOI'], ['url', 'Link']],
  website: [['author', 'Authors'], ['date', 'Date'], ['title', 'Title'], ['container', 'Site'], ['url', 'Link'], ['accessed', 'Accessed']],
  video: [['author', 'Channel'], ['date', 'Date'], ['title', 'Title'], ['container', 'Platform'], ['url', 'Link'], ['accessed', 'Accessed']],
  chapter: [['author', 'Authors'], ['date', 'Year'], ['title', 'Chapter'], ['container', 'Book'], ['editor', 'Editors'], ['publisher', 'Publisher'], ['city', 'City'], ['pages', 'Pages'], ['doi', 'DOI']],
  newspaper: [['author', 'Authors'], ['date', 'Date'], ['title', 'Title'], ['container', 'Newspaper'], ['pages', 'Pages'], ['url', 'Link'], ['accessed', 'Accessed']],
  report: [['author', 'Authors'], ['date', 'Year'], ['title', 'Title'], ['publisher', 'Publisher'], ['doi', 'DOI'], ['url', 'Link'], ['accessed', 'Accessed']],
  thesis: [['author', 'Authors'], ['date', 'Year'], ['title', 'Title'], ['school', 'School'], ['degree', 'Degree'], ['url', 'Link']],
  dataset: [['author', 'Authors'], ['date', 'Year'], ['title', 'Title'], ['publisher', 'Publisher'], ['doi', 'DOI'], ['url', 'Link'], ['accessed', 'Accessed']],
};

const SRC_HOLDERS = { author: 'Last, First; Last, First', date: '2024', title: '', doi: '10.1000/xyz', url: 'https://', accessed: 'YYYY-MM-DD' };

const SRC_CONTAINER = { article: 'journal', website: 'site', video: 'site', newspaper: 'newspaper', chapter: 'book' };

const SRC_ORDER = ['author', 'editor', 'date', 'title', 'container', 'publisher', 'city', 'edition', 'volume', 'issue', 'pages', 'school', 'degree', 'url', 'doi', 'accessed'];

const SRC_STOP = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'on', 'for', 'to', 'how', 'what', 'why', 'with']);

function srcToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function srcStyle() {
  return String((typeof headerValue === 'function' && headerValue('citations')) || (S.settings && S.settings.citations) || 'apa').toLowerCase();
}

function srcBlocks() {
  const all = lines();
  const blocks = [];
  for (let i = 0; i < all.length; i += 1) {
    if (!/^:::\s*sources\b/.test(all[i].trim())) continue;
    let close = i + 1;
    while (close < all.length && all[close].trim() !== ':::') close += 1;
    const first = all.slice(i + 1, close).find((text) => text.trim());
    blocks.push({ open: i, close, file: Boolean(first && /^\s*(file|src)\s*:/i.test(first)) });
    i = close;
  }
  return blocks;
}

function srcEntries() {
  const all = lines();
  const entries = {};
  srcBlocks().filter((block) => !block.file).forEach((block) => {
    let key = null;
    for (let i = block.open + 1; i < block.close; i += 1) {
      const text = all[i].trim();
      const head = text.match(/^@?([A-Za-z][\w:.-]*)\s*:?\s*$/);
      if (!text) key = null;
      else if (!key && head) {
        key = head[1];
        entries[key] = {};
      } else if (key) {
        const pair = text.match(/^([A-Za-z]+)\s*:\s*(.*)$/);
        if (pair) entries[key][pair[1].toLowerCase()] = pair[2].trim();
      }
    }
  });
  return entries;
}

function srcTaken() {
  return new Set([...Object.keys(S.sources || {}), ...Object.keys(srcEntries())]);
}

function srcWord(text) {
  return String(text || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sourceKey(fields, taken = srcTaken()) {
  const first = String(fields.author || '').split(';')[0].trim();
  let base = '';
  if (first.startsWith('{')) base = srcWord(first.slice(1).split(/[\s}]/)[0]);
  else if (first) base = srcWord(first.includes(',') ? first.split(',')[0] : first.split(/\s+/).pop());
  if (!base) base = srcWord(String(fields.title || '').split(/\s+/).find((word) => word.length > 2 && !SRC_STOP.has(word.toLowerCase())) || '');
  if (!base) base = 'source';
  if (!/^[a-z]/.test(base)) base = `s${base}`;
  const year = (String(fields.date || '').match(/\d{4}/) || String(fields.accessed || '').match(/\d{4}/) || [''])[0];
  const stem = `${base.slice(0, 24)}${year}`;
  let key = stem;
  let n = 0;
  while (taken.has(key)) key = `${stem}${'abcdefghijklmnopqrstuvwxyz'[n++] || n}`;
  return key;
}

function srcClean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function srcEngineFields(fields) {
  const shown = new Set((SRC_FORMS[fields.type] || SRC_FORMS.book).map(([name]) => name));
  const out = { type: fields.type };
  SRC_ORDER.forEach((name) => {
    const value = srcClean(fields[name]);
    if (!value || !shown.has(name)) return;
    if (name === 'date') out[/^\d{4}[a-z]?$/.test(value) ? 'year' : 'date'] = value;
    else if (name === 'container') out[SRC_CONTAINER[fields.type] || 'container'] = value;
    else out[name] = value;
  });
  return out;
}

function sourceLines(key, fields) {
  const engine = srcEngineFields(fields);
  return [`@${key}`, ...Object.entries(engine).map(([name, value]) => `${name}: ${value}`)];
}

function srcShift(at, count, extra) {
  const all = new Set([...(S.ranges || []), ...(extra ? [extra] : [])]);
  all.forEach((range) => {
    if (range.start - 1 >= at) {
      range.start += count;
      range.end += count;
    } else if (range.end - 1 >= at) range.end += count;
  });
}

function srcInsert(at, block, extra) {
  const all = lines();
  all.splice(at, 0, ...block);
  S.source = all.join('\n');
  srcShift(at, block.length, extra);
}

function srcEnsureList(extra) {
  if (lines().some((text) => /^:::\s*bibliography\b/.test(text.trim()))) return;
  const all = lines();
  const head = all.findIndex((text) => /^#\s+(References|Works Cited|Bibliography|Reference List)\b/i.test(text.trim()));
  if (head >= 0) {
    let stop = all.findIndex((text, index) => index > head && /^#{1,3}\s/.test(text));
    if (stop < 0) stop = all.length;
    while (stop > head + 1 && !all[stop - 1].trim()) stop -= 1;
    srcInsert(stop, ['', ':::bibliography', ':::'], extra);
    return;
  }
  let end = all.length;
  while (end > 0 && !all[end - 1].trim()) end -= 1;
  const title = typeof citationTitle === 'function' ? citationTitle(srcStyle()) : 'References';
  srcInsert(end, ['', `# ${title} {nonumber}`, '', ':::bibliography', ':::'], extra);
}

function addSource(fields, extra) {
  const existing = srcEntries();
  const doi = srcClean(fields.doi).toLowerCase();
  const url = srcClean(fields.url).replace(/\/$/, '');
  const same = Object.entries(existing).find(([, entry]) => (doi && String(entry.doi || '').toLowerCase() === doi) || (url && String(entry.url || '').replace(/\/$/, '') === url));
  if (same) return { key: same[0], existed: true };
  const taken = srcTaken();
  const key = fields.key && /^[A-Za-z][\w:.-]*$/.test(fields.key) && !taken.has(fields.key) ? fields.key : sourceKey(fields, taken);
  const entry = sourceLines(key, fields);
  srcEnsureList(extra);
  const blocks = srcBlocks().filter((block) => !block.file);
  if (blocks.length) {
    const block = blocks[blocks.length - 1];
    const all = lines();
    const empty = !all.slice(block.open + 1, block.close).some((text) => text.trim());
    let at = block.close;
    while (at > block.open + 1 && !all[at - 1].trim()) at -= 1;
    srcInsert(at, empty ? entry : ['', ...entry], extra);
  } else {
    const all = lines();
    let end = all.length;
    while (end > 0 && !all[end - 1].trim()) end -= 1;
    srcInsert(end, ['', ':::sources', ...entry, ':::'], extra);
  }
  if (typeof commitHistory === 'function') commitHistory();
  schedule(150);
  return { key, existed: false };
}

function sourceHere() {
  const edit = S.edit;
  if (!edit || !edit.rich || edit.cover || edit.prose || edit.list || typeof currentRange !== 'function' || typeof bodyMd !== 'function') return null;
  const range = currentRange();
  if (!range || !edit.ta.contains(range.endContainer)) return null;
  const at = range.cloneRange();
  at.collapse(false);
  const mark = document.createTextNode(SRC_MARK);
  at.insertNode(mark);
  const text = `${edit.prefix}${bodyMd(edit.ta)}${edit.tail}`;
  mark.remove();
  return text.includes(SRC_MARK) ? { range: edit.range, text } : null;
}

function sourceTarget() {
  if (typeof FLOW !== 'undefined' && FLOW.on && FLOW.editor && typeof flowPutChip === 'function') {
    const { from, to } = FLOW.editor.state.selection;
    return {
      onInsert: (key, info) => {
        const before = FLOW.editor.state.doc.textBetween(Math.max(0, from - 1), from, '\n', '\n');
        if (!before || /[\s([{]/.test(before)) return flowPutChip(from, to, 'cite', info.cite, info.label);
        FLOW.editor.view.dispatch(FLOW.editor.state.tr.insertText(' ', from, to));
        flowPutChip(from + 1, from + 1, 'cite', info.cite, info.label);
      },
    };
  }
  return { here: sourceHere() };
}

function srcSquash(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

function citeAt(here, cite) {
  if (!here) return false;
  const plain = here.text.replace(SRC_MARK, '');
  if (srcSquash(linesOf(here.range).join('\n')) !== srcSquash(plain)) return false;
  const [before, after] = here.text.split(SRC_MARK);
  const gap = before && !/[\s([{]$/.test(before) ? ' ' : '';
  setRangeLines(here.range, `${before}${gap}${cite}${after}`.split('\n'));
  schedule(120);
  return true;
}

function srcEditing() {
  return Boolean(S.edit && S.edit.rich && !S.edit.cover && typeof insertInlineChip === 'function');
}

async function srcPreview(fields) {
  try {
    return await api('/api/reference', { fields: srcEngineFields(fields), style: srcStyle() });
  } catch (error) {
    return null;
  }
}

function srcField(name, label) {
  const input = h('input', { type: 'text', spellcheck: 'false', placeholder: SRC_HOLDERS[name] || '', 'data-name': name });
  input.value = SRC.fields[name] || '';
  input.addEventListener('input', () => {
    SRC.fields[name] = input.value;
    srcRekey();
    srcRefresh();
  });
  return line(label, h('div', { class: 'field' }, input));
}

function srcRekey() {
  if (SRC.keyed || !SRC.root) return;
  SRC.fields.key = sourceKey(SRC.fields);
  const input = SRC.root.querySelector('.src-key input');
  if (input) input.value = SRC.fields.key;
}

function srcForm() {
  const box = SRC.root.querySelector('.src-form');
  const type = SRC.fields.type;
  const choices = SRC_TYPES.map(([value, label]) => ({ value, label }));
  if (SRC_MORE[type]) choices.push({ value: type, label: SRC_MORE[type] });
  const picker = segmented(choices, type, (value) => {
    SRC.fields.type = value;
    if (['website', 'video', 'newspaper'].includes(value) && !SRC.fields.accessed) SRC.fields.accessed = srcToday();
    srcForm();
    srcRefresh();
  });
  const keyInput = h('input', { type: 'text', spellcheck: 'false' });
  keyInput.value = SRC.fields.key || '';
  keyInput.addEventListener('input', () => {
    SRC.keyed = Boolean(keyInput.value.trim());
    SRC.fields.key = keyInput.value.trim().replace(/^@/, '');
    if (!SRC.keyed) srcRekey();
  });
  box.replaceChildren(
    h('div', { class: 'src-types' }, picker),
    h('div', { class: 'src-fields' }, ...(SRC_FORMS[type] || SRC_FORMS.book).map(([name, label]) => srcField(name, label)), h('div', { class: 'src-key' }, line('Short name', h('div', { class: 'field' }, keyInput)))),
  );
}

function srcRefresh() {
  clearTimeout(SRC.timer);
  const seq = ++SRC.seq;
  SRC.timer = setTimeout(async () => {
    const ready = srcClean(SRC.fields.title);
    const out = SRC.root && SRC.root.querySelector('.src-preview');
    if (!out) return;
    if (!ready) {
      out.replaceChildren();
      out.hidden = true;
      srcButtons();
      return;
    }
    const shown = await srcPreview(SRC.fields);
    if (seq !== SRC.seq || !SRC.root || !shown || !shown.reference) return;
    out.hidden = false;
    out.innerHTML = `<div class="src-ref">${shown.reference}</div><div class="src-cite"></div>`;
    out.querySelector('.src-cite').textContent = shown.cite;
    srcButtons();
  }, 160);
}

function srcButtons() {
  const ready = Boolean(srcClean(SRC.fields.title));
  SRC.root.querySelectorAll('.src-foot button[data-save]').forEach((button) => {
    button.disabled = !ready;
  });
}

function srcStatus(text, bad = false) {
  const node = SRC.root && SRC.root.querySelector('.src-status');
  if (!node) return;
  node.textContent = text;
  node.className = `src-status${bad ? ' bad' : ''}`;
  node.hidden = !text;
}

async function srcFind() {
  const input = SRC.root.querySelector('.src-query');
  const button = SRC.root.querySelector('.src-find');
  const query = input.value.trim();
  if (!query) return;
  button.disabled = true;
  button.textContent = 'Finding';
  srcStatus('');
  SRC.root.classList.add('busy');
  let answer;
  try {
    answer = await api('/api/lookup', { query });
  } catch (error) {
    answer = { error: 'No connection' };
  }
  if (!SRC.root) return;
  SRC.root.classList.remove('busy');
  button.disabled = false;
  button.textContent = 'Find';
  if (!answer || answer.error || !answer.source) {
    srcStatus((answer && answer.error) || 'Not found', true);
    return;
  }
  SRC.fields = { ...answer.source, type: SRC_FORMS[answer.source.type] ? answer.source.type : 'website' };
  if (!['website', 'video', 'newspaper'].includes(SRC.fields.type)) SRC.fields.date = String(SRC.fields.date || '').slice(0, 4);
  SRC.keyed = false;
  SRC.fields.key = sourceKey(SRC.fields);
  srcForm();
  srcRefresh();
  const save = SRC.root.querySelector('.src-foot .pill.solid');
  if (save) save.focus({ preventScroll: true });
}

async function srcSave(cite) {
  const fields = { ...SRC.fields };
  if (!srcClean(fields.title)) return;
  const onInsert = SRC.onInsert;
  const here = SRC.here;
  const shown = await srcPreview(fields);
  const editing = srcEditing();
  closeSourceLookup(true);
  const { key, existed } = addSource(fields, here && here.range);
  const source = `[@${key}]`;
  const label = (shown && shown.cite) || `(${key})`;
  let cited = false;
  if (cite) {
    if (onInsert) {
      onInsert(key, { cite: source, label, fields: srcEngineFields(fields) });
      cited = true;
    } else if (editing && S.edit) {
      insertInlineChip('cite', source, label);
      cited = true;
    } else cited = citeAt(here, source);
  }
  if (!cite && editing && S.edit && typeof restoreSelection === 'function') restoreSelection();
  toast(existed ? 'Already in your sources' : cited ? `Cited ${label}` : 'Source added');
}

function closeSourceLookup(keep = false) {
  if (!SRC.root) return;
  clearTimeout(SRC.timer);
  SRC.root.remove();
  SRC.root = null;
  if (!keep && srcEditing() && typeof restoreSelection === 'function') restoreSelection();
}

function openSourceLookup(options = {}) {
  if (!S.name) return;
  closeSourceLookup(true);
  if (typeof closeMenu === 'function') closeMenu();
  SRC.onInsert = typeof options.onInsert === 'function' ? options.onInsert : null;
  SRC.here = srcEditing() ? null : options.here || null;
  SRC.fields = { type: options.type && SRC_FORMS[options.type] ? options.type : 'website', accessed: srcToday() };
  SRC.keyed = false;
  SRC.fields.key = sourceKey(SRC.fields);
  const canCite = Boolean(SRC.onInsert || srcEditing() || SRC.here);
  const query = h('input', { type: 'text', class: 'src-query', spellcheck: 'false', autocomplete: 'off', placeholder: 'DOI, ISBN or link' });
  const find = h('button', { type: 'button', class: 'pill solid src-find', text: 'Find', onclick: () => srcFind() });
  const foot = h('div', { class: 'src-foot' });
  if (canCite) {
    foot.append(
      h('button', { type: 'button', class: 'pill ghost', 'data-save': '1', text: 'Add only', onclick: () => srcSave(false) }),
      h('button', { type: 'button', class: 'pill solid', 'data-save': '1', html: `${icon('plus', 16)}<span>Add and cite</span>`, onclick: () => srcSave(true) }),
    );
  } else {
    foot.append(h('button', { type: 'button', class: 'pill solid', 'data-save': '1', html: `${icon('plus', 16)}<span>Add source</span>`, onclick: () => srcSave(false) }));
  }
  const box = h(
    'div',
    { class: 'src-box', role: 'dialog', 'aria-label': 'Add source' },
    h('div', { class: 'src-head' }, h('span', { class: 'src-icon', html: icon('sources', 18) }), h('div', { class: 'src-title', text: 'Add source' }), h('button', { type: 'button', class: 'round src-close', title: 'Close', html: icon('close', 16), onclick: () => closeSourceLookup() })),
    h('div', { class: 'src-search' }, h('span', { class: 'src-glass', html: icon('search', 17) }), query, find),
    h('div', { class: 'src-status', hidden: 'hidden' }),
    h('div', { class: 'src-body' }, h('div', { class: 'src-form' }), h('div', { class: 'src-preview', hidden: 'hidden' })),
    foot,
  );
  SRC.root = h('div', { class: 'src-back' }, box);
  SRC.root.addEventListener('mousedown', (event) => {
    if (event.target === SRC.root) closeSourceLookup();
  });
  SRC.root.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSourceLookup();
    } else if (event.key === 'Enter' && event.target === query) {
      event.preventDefault();
      srcFind();
    } else if (event.key === 'Enter' && event.target.tagName === 'INPUT' && srcClean(SRC.fields.title)) {
      event.preventDefault();
      srcSave(canCite);
    }
  });
  query.addEventListener('paste', () => setTimeout(() => {
    if (query.value.trim()) srcFind();
  }, 0));
  document.body.append(SRC.root);
  srcForm();
  srcButtons();
  if (options.query) {
    query.value = options.query;
    srcFind();
  }
  query.focus({ preventScroll: true });
}

function sourcePanelSection() {
  return section(null, h('button', { type: 'button', class: 'pill solid src-panel-add', html: `${icon('plus', 16)}<span>Add source</span>`, onclick: () => openSourceLookup() }));
}

['sources', 'bibliography'].forEach((kind) => {
  const base = typeof PANELS !== 'undefined' && PANELS[kind];
  if (!base) return;
  PANELS[kind] = (model, body, range) => {
    body.append(sourcePanelSection());
    base(model, body, range);
  };
});

window.openSourceLookup = openSourceLookup;
