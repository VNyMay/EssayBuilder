const HIST = { root: null, items: [], picked: null, mode: 'changes', unfold: {}, texts: {}, naming: false, renaming: null, menu: null, seq: 0 };

const HIST_SUGGEST = ['Sent to supervisor', 'Before feedback', 'First draft', 'Final draft'];
const HIST_GROUP = 15 * 60;

function histWordsOf(text) {
  const parts = text.split(/^---[ \t]*$/m);
  const body = parts.length > 1 ? parts.slice(1).join('---') : text;
  let inside = false;
  let count = 0;
  body.split('\n').forEach((line) => {
    const bare = line.trim();
    if (bare.startsWith(':::')) {
      inside = bare !== ':::';
      return;
    }
    if (/^(%%|\/\/|\$\$)/.test(bare) || (inside && /^[a-z][\w-]*:\s/.test(bare))) return;
    count += (line.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length;
  });
  return count;
}

function histTokens(text) {
  return text.match(/\n|[^\S\n]+|[\p{L}\p{N}_]+(?:['’-][\p{L}\p{N}_]+)*|[^\s\p{L}\p{N}_]/gu) || [];
}

function histMyers(a, b, limit) {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const head = a.slice(0, start).map((v) => ({ t: '=', v }));
  const tail = a.slice(endA).map((v) => ({ t: '=', v }));
  const x0 = a.slice(start, endA);
  const y0 = b.slice(start, endB);
  const n = x0.length;
  const m = y0.length;
  if (!n || !m) return [...head, ...x0.map((v) => ({ t: '-', v })), ...y0.map((v) => ({ t: '+', v })), ...tail];
  const max = n + m;
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  let found = -1;
  for (let d = 0; d <= Math.min(max, limit); d += 1) {
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && x0[x] === y0[y]) {
        x += 1;
        y += 1;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
    if (found >= 0) break;
  }
  if (found < 0) return [...head, ...x0.map((t) => ({ t: '-', v: t })), ...y0.map((t) => ({ t: '+', v: t })), ...tail];
  const ops = [];
  let x = n;
  let y = m;
  for (let d = found; d >= 0; d -= 1) {
    const row = trace[d];
    const at = (k) => row[k + d + 1];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = d === 0 ? 0 : at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ t: '=', v: x0[x - 1] });
      x -= 1;
      y -= 1;
    }
    if (d > 0) {
      if (x === prevX) ops.push({ t: '+', v: y0[y - 1] });
      else ops.push({ t: '-', v: x0[x - 1] });
    }
    x = prevX;
    y = prevY;
  }
  return [...head, ...ops.reverse(), ...tail];
}

function histTidy(ops) {
  const out = [];
  let dels = [];
  let adds = [];
  const flush = () => {
    if (dels.length) out.push({ t: '-', v: dels.join('') });
    if (adds.length) out.push({ t: '+', v: adds.join('') });
    dels = [];
    adds = [];
  };
  ops.forEach((op, index) => {
    if (op.t === '-') dels.push(op.v);
    else if (op.t === '+') adds.push(op.v);
    else {
      const next = ops[index + 1];
      if ((dels.length || adds.length) && /^[^\S\n]+$/.test(op.v) && next && next.t !== '=') {
        const toDel = dels.length > 0 || (next.t === '-' && !adds.length);
        const toAdd = adds.length > 0 || (next.t === '+' && !dels.length);
        if (toDel) dels.push(op.v);
        if (toAdd) adds.push(op.v);
        return;
      }
      flush();
      const last = out[out.length - 1];
      if (last && last.t === '=') last.v += op.v;
      else out.push({ t: '=', v: op.v });
    }
  });
  flush();
  return out;
}

function histDiff(before, after) {
  const a = before.split('\n').map((line) => `${line}\n`);
  const b = after.split('\n').map((line) => `${line}\n`);
  const lines = histMyers(a, b, 3000);
  const ops = [];
  let dels = [];
  let adds = [];
  const flush = () => {
    if (dels.length && adds.length) {
      histMyers(histTokens(dels.join('')), histTokens(adds.join('')), 2500).forEach((op) => ops.push(op));
    } else {
      dels.forEach((line) => histTokens(line).forEach((v) => ops.push({ t: '-', v })));
      adds.forEach((line) => histTokens(line).forEach((v) => ops.push({ t: '+', v })));
    }
    dels = [];
    adds = [];
  };
  lines.forEach((op) => {
    if (op.t === '-') dels.push(op.v);
    else if (op.t === '+') adds.push(op.v);
    else {
      flush();
      histTokens(op.v).forEach((v) => ops.push({ t: '=', v }));
    }
  });
  flush();
  return histTidy(ops);
}

function histLines(segments) {
  const rows = [[]];
  segments.forEach((segment) => {
    segment.v.split(/(\n)/).forEach((piece) => {
      if (piece === '\n') rows.push([]);
      else if (piece) rows[rows.length - 1].push({ t: segment.t, v: piece });
    });
  });
  while (rows.length && !rows[rows.length - 1].length) rows.pop();
  return rows;
}

function histRender(segments) {
  const page = h('article', { class: 'hv-page' });
  let header = /^---[ \t]*$/m.test(segments.map((s) => s.v).join(''));
  let inside = false;
  let prose = false;
  const labels = (typeof S !== 'undefined' && S.labels) || {};
  const friendly = (value) => value.replace(/@(fig|tbl|eq|code|sec|def|thm|lem|prop|cor|ex|rem):([A-Za-z][\w-]*)/g, (whole, kind, id) => labels[`${kind}:${id}`] || whole);
  histLines(segments).forEach((row) => {
    const text = row.filter((s) => s.t !== '-').map((s) => s.v).join('') || row.map((s) => s.v).join('');
    const bare = text.trim();
    const line = h('div', { class: 'hv-line' });
    const changed = row.some((s) => s.t !== '=');
    let parts = row;
    if (header) {
      line.classList.add('hv-set');
      if (/^---\s*$/.test(bare)) {
        header = false;
        return;
      }
      if (!changed) return;
    } else if (bare.startsWith(':::')) {
      if (bare === ':::') {
        inside = false;
        if (!changed) return;
        line.classList.add('hv-fence');
      } else {
        inside = true;
        const name = (bare.match(/^:::\s*([\w-]+)/) || ['', 'block'])[1];
        prose = /^(box|question|note|proof|definition|theorem|lemma|proposition|corollary|example|remark|tip|warning|info|important|abstract|text)$/i.test(name);
        const label = typeof prettyKey === 'function' ? prettyKey(name) : name;
        if (!changed) {
          line.classList.add('hv-block');
          line.append(h('span', { class: 'hv-chip', text: label }));
          page.append(line);
          return;
        }
        line.classList.add('hv-fence');
      }
    } else if (inside && /^(caption|title)\s*:/i.test(bare) && !changed) {
      line.classList.add('hv-cap');
      line.append(bare.replace(/^(caption|title)\s*:\s*/i, ''));
      page.append(line);
      return;
    } else if (inside && !changed && !(prose && bare && !/^[a-z][\w-]*\s*:\s/i.test(bare) && bare !== '---')) {
      return;
    } else if (/^#{1,6}\s/.test(bare)) {
      const level = Math.min(3, bare.match(/^#+/)[0].length);
      line.classList.add(`hv-h${level}`);
      let strip = text.match(/^\s*#+\s*/)[0].length;
      parts = row.map((s) => ({ ...s })).filter((s) => {
        if (strip <= 0 || s.t === '-') return true;
        const cut = Math.min(strip, s.v.length);
        s.v = s.v.slice(cut);
        strip -= cut;
        return s.v.length > 0;
      });
    } else if (/^(%%|\/\/)/.test(bare)) {
      line.classList.add('hv-note');
    } else if (/^\$\$/.test(bare) || (inside && /^[a-z][\w-]*:\s/.test(bare))) {
      line.classList.add('hv-code');
    } else if (inside) {
      line.classList.add('hv-inner');
    }
    if (!row.length || !row.some((s) => s.v.trim())) line.classList.add('hv-gap');
    parts.forEach((s) => {
      if (s.t === '=') line.append(friendly(s.v));
      else line.append(h(s.t === '+' ? 'ins' : 'del', { text: s.v }));
    });
    page.append(line);
  });
  return page;
}

function histClock(seconds) {
  return new Date(seconds * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function histDay(seconds) {
  const date = new Date(seconds * 1000);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const that = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  if (that === start) return 'Today';
  if (Math.round((start - that) / 86400000) === 1) return 'Yesterday';
  const options = { weekday: 'short', day: 'numeric', month: 'short' };
  if (date.getFullYear() !== today.getFullYear()) options.year = 'numeric';
  return date.toLocaleDateString([], options);
}

function histWhen(item) {
  return `${histDay(item.time)}, ${histClock(item.time)}`;
}

function histNote(item) {
  if (item.note && item.note.kind === 'before') return 'Before restore';
  if (item.note && item.note.kind === 'restored') return item.note.from ? `Restored from ${histWhen({ time: item.note.from })}` : 'Restored';
  if (item.first) return 'First version';
  return '';
}

function histGroups() {
  const groups = [];
  HIST.items.forEach((item) => {
    const group = groups[groups.length - 1];
    const solo = Boolean(item.current || item.label || item.note || item.first);
    const last = group && group.items[group.items.length - 1];
    if (group && !group.solo && !solo && histDay(last.time) === histDay(item.time) && last.time - item.time < HIST_GROUP) group.items.push(item);
    else groups.push({ items: [item], solo });
  });
  return groups;
}

function histFind(name) {
  return HIST.items.find((item) => item.name === name) || null;
}

function histMeta(words, added, removed) {
  const meta = h('span', { class: 'hv-meta' }, h('span', { text: `${Number(words || 0).toLocaleString()} ${words === 1 ? 'word' : 'words'}` }));
  if (added) meta.append(h('span', { class: 'hv-plus', text: `+${added.toLocaleString()}` }));
  if (removed) meta.append(h('span', { class: 'hv-minus', text: `−${removed.toLocaleString()}` }));
  return meta;
}

function histRow(item, group, child) {
  const key = item.name || 'current';
  const picked = HIST.picked === key;
  const row = h('div', { class: `hv-row${picked ? ' on' : ''}${child ? ' child' : ''}${item.label ? ' named' : ''}`, 'data-key': key });
  const sum = group && !child ? group.items.reduce((total, one) => [total[0] + (one.added || 0), total[1] + (one.removed || 0)], [0, 0]) : [item.added || 0, item.removed || 0];
  const main = h('button', { type: 'button', class: 'hv-main', onclick: () => histPick(key) });
  const top = h('span', { class: 'hv-top' });
  if (HIST.renaming === key) {
    const input = h('input', { type: 'text', class: 'hv-input', value: item.label || '', placeholder: 'Version name', maxlength: '80', spellcheck: 'false' });
    let done = false;
    const finish = (save) => {
      if (done || HIST.renaming !== key) return;
      done = true;
      HIST.renaming = null;
      if (save && input.value.trim() !== (item.label || '')) histSaveName(item, input.value);
      else histDraw();
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') finish(true);
      else if (event.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    row.append(h('div', { class: 'hv-edit' }, input));
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
    return row;
  }
  if (item.label) {
    top.append(h('b', { class: 'hv-label', text: item.label }));
    top.append(h('span', { class: 'hv-time', text: histClock(item.time) }));
  } else {
    top.append(h('b', { class: 'hv-time', text: item.current ? 'Current version' : histClock(item.time) }));
    if (item.current && item.time) top.append(h('span', { class: 'hv-time', text: histClock(item.time) }));
  }
  main.append(top, histMeta(item.words, sum[0], sum[1]));
  const note = histNote(item);
  if (note) main.append(h('span', { class: 'hv-tag', text: note }));
  row.append(main);
  if (group && !child && group.items.length > 1) {
    const open = Boolean(HIST.unfold[key]);
    row.append(h('button', {
      type: 'button',
      class: `hv-fold${open ? ' open' : ''}`,
      title: open ? 'Hide saves' : 'Show saves',
      html: `<span>${group.items.length}</span>${icon('chevron', 14)}`,
      onclick: () => {
        HIST.unfold[key] = !open;
        histDraw();
      },
    }));
  }
  row.append(h('button', { type: 'button', class: 'round hv-more', title: 'More', html: icon('more', 16), onclick: (event) => histMenu(item, event.currentTarget) }));
  return row;
}

function histMenu(item, anchor) {
  histCloseMenu();
  const key = item.name || 'current';
  const menu = h('div', { class: 'hv-menu' });
  const add = (label, run, danger) => menu.append(h('button', { type: 'button', class: danger ? 'bad' : '', text: label, onclick: () => {
    histCloseMenu();
    run();
  } }));
  add(item.label ? 'Rename' : 'Name this version', () => {
    if (item.current && !item.name) {
      histStartNaming();
      return;
    }
    HIST.renaming = key;
    histDraw();
  });
  if (item.label) add('Remove name', () => histSaveName(item, ''));
  if (!item.current) {
    add('Restore this version', () => histRestore(item));
    add('Make a copy', () => histCopy(item));
  }
  anchor.closest('.hv-row').append(menu);
  HIST.menu = menu;
  const list = HIST.root.querySelector('.hv-list');
  const over = menu.getBoundingClientRect().bottom - list.getBoundingClientRect().bottom;
  if (over > 0) {
    menu.classList.add('up');
  }
}

function histCloseMenu() {
  if (HIST.menu) HIST.menu.remove();
  HIST.menu = null;
}

function histStartNaming() {
  HIST.naming = true;
  histDraw();
}

function histNamer() {
  const input = h('input', { type: 'text', class: 'hv-input', placeholder: 'Version name', maxlength: '80', spellcheck: 'false' });
  const save = () => {
    const label = input.value.trim();
    if (!label) {
      input.focus();
      return;
    }
    histNameCurrent(label);
  };
  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') save();
    else if (event.key === 'Escape') {
      HIST.naming = false;
      histDraw();
    }
  });
  const chips = h('div', { class: 'hv-chips' }, HIST_SUGGEST.map((label) => h('button', { type: 'button', class: 'hv-chip', text: label, onclick: () => {
    input.value = label;
    input.focus();
  } })));
  const box = h(
    'div',
    { class: 'hv-namer' },
    input,
    chips,
    h('div', { class: 'hv-namer-actions' },
      h('button', { type: 'button', class: 'pill ghost small', text: 'Cancel', onclick: () => {
        HIST.naming = false;
        histDraw();
      } }),
      h('button', { type: 'button', class: 'pill solid small', text: 'Save', onclick: save })),
  );
  setTimeout(() => input.focus(), 0);
  return box;
}

async function histNameCurrent(label) {
  if (typeof saveNow === 'function') await saveNow();
  const answer = await api('/api/version_name', { label, current: S.source });
  if (answer.error) {
    toast(answer.error, true);
    return;
  }
  HIST.naming = false;
  await histLoad(answer.versions);
  histDraw();
  histShow();
  toast('Version named');
}

async function histSaveName(item, label) {
  const answer = await api('/api/version_name', { name: item.name, label });
  if (answer.error) {
    toast(answer.error, true);
    return;
  }
  await histLoad(answer.versions);
  histDraw();
  histShow();
}

function histDraw() {
  if (!HIST.root) return;
  const list = HIST.root.querySelector('.hv-list');
  const scroll = list.scrollTop;
  list.replaceChildren();
  if (HIST.naming) list.append(histNamer());
  let day = null;
  histGroups().forEach((group) => {
    const head = group.items[0];
    const label = histDay(head.time);
    if (label !== day) {
      day = label;
      list.append(h('div', { class: 'hv-day', text: label }));
    }
    list.append(histRow(head, group, false));
    if (group.items.length > 1 && HIST.unfold[head.name || 'current']) {
      group.items.slice(1).forEach((item) => list.append(histRow(item, group, true)));
    }
  });
  if (!HIST.items.length) list.append(h('div', { class: 'hv-empty', text: 'No versions yet' }));
  list.scrollTop = scroll;
  const name = HIST.root.querySelector('.hv-name-now');
  if (name) name.hidden = HIST.naming;
}

function histPick(key) {
  HIST.picked = key;
  HIST.root.querySelectorAll('.hv-row').forEach((row) => row.classList.toggle('on', row.dataset.key === key));
  histShow();
}

async function histText(item) {
  if (item.current && !item.name) return S.source;
  if (HIST.texts[item.name] === undefined) {
    const answer = await api('/api/version', { name: item.name });
    if (answer.error) throw new Error(answer.error);
    HIST.texts[item.name] = answer.source;
  }
  return HIST.texts[item.name];
}

function histCount(segments, kind) {
  return segments.filter((s) => s.t === kind).reduce((total, s) => total + (s.v.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length, 0);
}

async function histShow() {
  if (!HIST.root) return;
  const stage = HIST.root.querySelector('.hv-stage');
  const item = HIST.items.find((one) => (one.name || 'current') === HIST.picked);
  const seq = (HIST.seq += 1);
  if (!item) {
    stage.replaceChildren();
    return;
  }
  let text;
  try {
    text = await histText(item);
  } catch (error) {
    if (seq !== HIST.seq) return;
    stage.replaceChildren(h('div', { class: 'hv-bar' }, h('div', { class: 'hv-title' }, h('b', { text: 'This version is no longer kept' }))));
    return;
  }
  if (seq !== HIST.seq) return;
  const current = Boolean(item.current);
  const changes = !current && HIST.mode === 'changes';
  const segments = changes ? histDiff(text, S.source) : [{ t: '=', v: text }];
  const title = h('div', { class: 'hv-title' }, h('b', { text: item.label || (current ? 'Current version' : histWhen(item)) }), h('span', { text: item.label || current ? histWhen(item) : `${Number(item.words || 0).toLocaleString()} words` }));
  const bar = h('div', { class: 'hv-bar' }, title);
  if (!current) {
    const toggle = h('div', { class: 'hv-toggle' });
    [['changes', 'Changes since'], ['plain', 'This version']].forEach(([mode, label]) => toggle.append(h('button', {
      type: 'button',
      class: HIST.mode === mode ? 'on' : '',
      text: label,
      onclick: () => {
        if (HIST.mode === mode) return;
        HIST.mode = mode;
        histShow();
      },
    })));
    bar.append(toggle);
    if (changes) {
      const added = histCount(segments, '+');
      const removed = histCount(segments, '-');
      bar.append(added || removed
        ? h('div', { class: 'hv-legend' }, added ? h('span', { class: 'hv-plus', text: `+${added.toLocaleString()}`, title: 'Added since' }) : null, removed ? h('span', { class: 'hv-minus', text: `−${removed.toLocaleString()}`, title: 'Removed since' }) : null)
        : h('div', { class: 'hv-legend' }, h('span', { text: 'Same as now' })));
    }
    bar.append(
      h('span', { class: 'hv-grow' }),
      h('button', { type: 'button', class: 'pill ghost', html: `${icon('copy', 15)}<span>Make a copy</span>`, onclick: () => histCopy(item) }),
      h('button', { type: 'button', class: 'pill solid', html: `${icon('undo', 15)}<span>Restore this version</span>`, onclick: () => histRestore(item) }),
    );
  }
  const scroller = h('div', { class: 'hv-scroll' }, histRender(segments));
  stage.replaceChildren(bar, scroller);
  if (changes) {
    const first = scroller.querySelector('ins, del');
    if (first) scroller.scrollTop = Math.max(0, first.offsetTop - 120);
  }
}

async function histRestore(item) {
  if (typeof saveNow === 'function') await saveNow();
  const answer = await api('/api/version_restore', { name: item.name, current: S.source });
  if (answer.error || typeof answer.source !== 'string') {
    toast(answer.error || 'This version could not be restored', true);
    return;
  }
  closeHistory();
  if (typeof restoreSource === 'function') restoreSource(answer.source);
  else {
    S.source = answer.source;
    schedule(0);
  }
  toast('Version restored. Press Ctrl+Z to undo.');
}

async function histCopy(item) {
  if (typeof settle === 'function') await settle();
  const state = await api('/api/version_copy', { name: item.name });
  if (state.error) {
    toast(state.error, true);
    return;
  }
  closeHistory();
  load(state);
  toast('Copy opened');
}

async function histLoad(versions) {
  const items = (versions || []).map((item) => ({ ...item }));
  if (items.length) {
    try {
      const latest = await histText(items[0]);
      if (latest === S.source) items[0].current = true;
    } catch (error) {
      items.shift();
    }
  }
  if (!items.length || !items[0].current) items.unshift({ name: '', current: true, time: Date.now() / 1000, words: histWordsOf(S.source), added: 0, removed: 0 });
  HIST.items = items;
  if (!HIST.items.some((one) => (one.name || 'current') === HIST.picked)) {
    const older = HIST.items.find((one) => !one.current);
    HIST.picked = older ? older.name : HIST.items[0].name || 'current';
  }
}

function histKeys(event) {
  if (!HIST.root) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    if (HIST.menu) histCloseMenu();
    else if (HIST.renaming) {
      HIST.renaming = null;
      histDraw();
    } else if (HIST.naming) {
      HIST.naming = false;
      histDraw();
    } else closeHistory();
  } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !['INPUT', 'TEXTAREA'].includes(event.target.tagName)) {
    const rows = [...HIST.root.querySelectorAll('.hv-row')];
    const at = rows.findIndex((row) => row.dataset.key === HIST.picked);
    const next = rows[Math.max(0, Math.min(rows.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))];
    if (next) {
      event.preventDefault();
      event.stopPropagation();
      histPick(next.dataset.key);
      next.scrollIntoView({ block: 'nearest' });
    }
  }
}

function histOutside(event) {
  if (HIST.menu && !event.target.closest('.hv-menu, .hv-more')) histCloseMenu();
}

async function openHistory() {
  if (!S.name) return;
  if (S.settingsOpen && typeof closeSettings === 'function') closeSettings();
  if (typeof closeEditor === 'function' && S.edit) closeEditor(true);
  if (typeof saveNow === 'function') await saveNow();
  const answer = await api('/api/versions');
  if (answer.error) {
    toast(answer.error, true);
    return;
  }
  HIST.texts = {};
  HIST.naming = false;
  HIST.renaming = null;
  await histLoad(answer.versions);
  if (!HIST.root) {
    HIST.mode = 'changes';
    HIST.root = h(
      'div',
      { id: 'history' },
      h('section', { class: 'hv-stage' }),
      h(
        'aside',
        { class: 'hv-sheet' },
        h('div', { class: 'hv-head' }, h('span', { text: 'Version history' }), h('button', { type: 'button', class: 'round', title: 'Close', html: icon('close', 16), onclick: closeHistory })),
        h('div', { class: 'hv-actions' }, h('button', { type: 'button', class: 'pill ghost small hv-name-now', html: `${icon('pin', 15)}<span>Name current version</span>`, onclick: histStartNaming })),
        h('div', { class: 'hv-list' }),
      ),
    );
    document.body.append(HIST.root);
    document.addEventListener('keydown', histKeys, true);
    document.addEventListener('mousedown', histOutside, true);
  }
  histDraw();
  histShow();
}

function closeHistory() {
  if (!HIST.root) return;
  histCloseMenu();
  HIST.root.remove();
  HIST.root = null;
  HIST.seq += 1;
  document.removeEventListener('keydown', histKeys, true);
  document.removeEventListener('mousedown', histOutside, true);
}
