const S = {
  source: '',
  name: '',
  ranges: [],
  regions: {},
  pages: [],
  front: null,
  settings: {},
  title: '',
  sel: null,
  edit: null,
  panel: null,
  settingsOpen: false,
  issues: [],
  scale: 1.2,
  zoom: 'fit',
  building: false,
  dirty: false,
  timer: null,
  history: [],
  index: 0,
  locked: false,
  seq: 0,
  focusNew: false,
  busyExport: false,
};

const $ = (selector, root = document) => root.querySelector(selector);

const ZOOM_STEPS = [25, 33, 50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400];
let zoomPick = null;

function h(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value !== undefined && value !== null && value !== false) node.setAttribute(key, value);
  }
  kids.flat().forEach((kid) => {
    if (kid !== null && kid !== undefined) node.append(kid);
  });
  return node;
}

async function api(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return response.json();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toast(text, bad = false) {
  const node = $('#toast');
  node.textContent = text;
  node.className = bad ? 'bad' : '';
  reveal(node);
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => conceal(node), 3200);
}

function setStatus(kind) {
  const node = $('#status');
  node.className = kind === 'busy' ? 'busy' : kind === 'bad' ? 'bad' : '';
  node.textContent = kind === 'busy' ? 'Saving' : kind === 'bad' ? 'Blocked' : 'Saved';
  if (kind === 'ok') S.savedAt = new Date();
  updatePill(kind);
}

function updatePill(kind) {
  const pill = $('#statusPill');
  if (!pill) return;
  const open = Boolean(S.name) && !document.documentElement.classList.contains('home');
  pill.hidden = !open;
  if (!open) return;
  const parts = [];
  const state = kind || (S.dirty ? 'busy' : 'ok');
  parts.push(state === 'busy' ? 'Saving' : state === 'bad' ? 'Blocked' : S.savedAt ? `Saved ${S.savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Saved');
  if (S.words) parts.push(`${Number(S.words).toLocaleString()} ${Number(S.words) === 1 ? 'word' : 'words'}`);
  if (S.pages && S.pages.length) parts.push(`${S.pages.length} ${S.pages.length === 1 ? 'page' : 'pages'}`);
  pill.className = state;
  pill.innerHTML = parts.map((part, index) => `<span class="${index === 0 ? 'state' : ''}">${part}</span>`).join('');
  const segments = [...pill.children];
  segments[0].title = 'Versions';
  segments[0].onclick = () => {
    openSettings();
    openVersions();
  };
  const pagesPart = segments.find((node) => /page/.test(node.textContent));
  if (pagesPart) {
    pagesPart.title = 'Outline';
    pagesPart.onclick = () => toggleOutline();
  }
}

function lines() {
  return S.source.split('\n');
}

function linesOf(range) {
  return lines().slice(range.start - 1, range.end);
}

function shiftAfter(line, delta, except) {
  S.ranges.forEach((range) => {
    if (range !== except && range.start > line) {
      range.start += delta;
      range.end += delta;
    }
  });
}

function setRangeLines(range, replacement) {
  const all = lines();
  const next = replacement.length ? replacement : [''];
  const count = range.end - range.start + 1;
  all.splice(range.start - 1, count, ...next);
  const delta = next.length - count;
  S.source = all.join('\n');
  const oldEnd = range.end;
  range.end = range.start + next.length - 1;
  if (delta) shiftAfter(oldEnd, delta, range);
}

function normalizeRanges() {
  const all = lines();
  S.ranges.forEach((range, i) => {
    if (range.kind !== 'pipetable' || i === 0) return;
    let at = range.start - 2;
    while (at >= 0 && !all[at].trim()) at -= 1;
    if (at >= 0 && /^Table:/i.test(all[at].trim())) {
      const previous = S.ranges[i - 1];
      if (previous.end >= at + 1 && previous.start <= at) {
        range.start = at + 1;
        previous.end = at;
        while (previous.end > previous.start && !all[previous.end - 1].trim()) previous.end -= 1;
        if (previous.end < previous.start) previous.end = previous.start;
      }
    }
  });
}

function commitHistory() {
  if (S.history[S.index] === S.source) return;
  S.history.splice(S.index + 1);
  S.history.push(S.source);
  if (S.history.length > 120) S.history.shift();
  S.index = S.history.length - 1;
}

let saveTimer = null;
let savedSource = null;

function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 250);
}

async function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!S.name || S.source === savedSource) return;
  const text = S.source;
  try {
    await api('/api/save', { source: text, keep: keepVersions() });
    savedSource = text;
  } catch (error) {
    savedSource = null;
  }
}

function saveOnLeave() {
  if (!S.name || S.source === savedSource) return;
  navigator.sendBeacon('/api/save', new Blob([JSON.stringify({ source: S.source })], { type: 'application/json' }));
}

function schedule(delay = 700) {
  saveSoon();
  S.dirty = true;
  setStatus('busy');
  clearTimeout(S.timer);
  S.timer = setTimeout(run, delay);
}

function lockHits() {
  S.locked = true;
  $('#pages').classList.add('locked');
}

function unlockHits() {
  S.locked = false;
  $('#pages').classList.remove('locked');
}

async function run() {
  S.timer = null;
  if (S.building) {
    schedule(300);
    return;
  }
  commitHistory();
  S.building = true;
  const sent = S.source;
  let result;
  try {
    result = await api('/api/render', { source: sent, have: S.fontStamp || '', dpi: wantedDpi() });
  } catch (error) {
    result = { fatal: String(error) };
  }
  S.building = false;
  if (S.source !== sent) {
    schedule(250);
    return;
  }
  await applyResult(result, sent);
}

function parseIssues(result) {
  const out = [];
  const take = (text, level) => {
    const match = text.match(/^([^:]*):(\d+):\s*([\s\S]*)$/);
    out.push({ level, text: match ? match[3] : text, line: match && match[1] === S.name ? Number(match[2]) : null });
  };
  (result.errors || []).forEach((text) => take(text, 'error'));
  (result.warnings || []).forEach((text) => take(text, 'warn'));
  if (result.fatal) out.push({ level: 'error', text: result.fatal, line: null });
  return out;
}

function renderIssues() {
  const button = $('#issues');
  const errors = S.issues.filter((item) => item.level === 'error').length;
  button.hidden = !S.issues.length;
  button.className = `pill soft ${errors ? 'error' : 'warn'}`;
  button.innerHTML = `${icon('warn', 16)}<span>${S.issues.length}</span>`;
}

function loadImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = resolve;
    image.src = url;
  });
}

async function applyResult(result, sent) {
  S.issues = parseIssues(result);
  renderIssues();
  if (result.fatal || (result.errors && result.errors.length)) {
    S.dirty = false;
    setStatus('bad');
    if (result.title !== undefined) S.title = result.title;
    return;
  }
  if (result.fontCss !== undefined) applyFontCss(result.fontCss);
  S.fontStamp = result.fontStamp || S.fontStamp;
  await Promise.all(result.pages.map((page) => loadImage(page.url)));
  if (sent !== undefined && S.source !== sent) {
    schedule(250);
    return;
  }
  const start = S.pendingStart != null ? S.pendingStart : S.sel ? S.sel.start : null;
  S.pendingStart = null;
  S.labels = result.labels || {};
  S.cites = result.cites || {};
  S.sources = result.sources || {};
  S.pages = result.pages;
  S.dpi = result.dpi || 144;
  S.regions = result.regions;
  S.overlays = result.overlays || {};
  S.ranges = result.ranges.map((range) => ({ ...range }));
  S.front = result.front;
  S.settings = result.settings;
  S.words = result.words || 0;
  S.title = result.title;
  normalizeRanges();
  S.sel = start === null ? null : S.ranges.find((range) => range.start === start) || null;
  if (S.edit && !S.edit.cover) {
    if (S.sel) S.edit.range = S.sel;
    else closeEditor(true);
  }
  if (S.panel) {
    if (S.sel) S.panel.range = S.sel;
    else closePanel();
  }
  S.dirty = false;
  unlockHits();
  setStatus('ok');
  syncTitle();
  document.querySelectorAll('.page.leaving').forEach((node) => node.classList.remove('leaving'));
  layout();
  renderOutline();
  if (S.edit && S.edit.rich) {
    S.edit.base = null;
    positionEditor();
  }
  if (!localStorage.getItem('studio.toured')) setTimeout(() => startTour(), 600);
  if (S.focusNew && S.sel) {
    S.focusNew = false;
    S.glow = S.sel.id;
    setTimeout(() => {
      S.glow = null;
    }, 1400);
    if (TEXT_KINDS.has(S.sel.kind) || isRichText(S.sel) || isProse(S.sel)) openEditor(S.sel, S.focusSelectAll !== false);
    S.focusSelectAll = true;
    scrollToRange(S.sel);
  }
}

function applyFontCss(css) {
  let tag = document.getElementById('doc-fonts');
  if (!tag) {
    tag = h('style', { id: 'doc-fonts' });
    document.head.append(tag);
  }
  tag.textContent = css;
}

function fitScale() {
  const width = S.pages.length ? S.pages[0].w : 595;
  return Math.max(0.25, Math.min(1.6, ($('#scroll').clientWidth - 90) / width));
}

function pageScale() {
  const page = S.pages.length ? S.pages[0] : { w: 595, h: 842 };
  return Math.max(0.25, Math.min(fitScale(), ($('#scroll').clientHeight - 70) / page.h));
}

function marginPt() {
  return (parseFloat(S.settings.margins) || 25) * 72 / 25.4;
}

function firstSpan(range) {
  const spans = S.regions[range.id];
  return spans && spans.length ? spans[0] : null;
}

function layout() {
  const box = $('#pages');
  S.scale = S.zoom === 'fit' ? fitScale() : S.zoom === 'page' ? pageScale() : S.zoom;
  while (box.children.length > S.pages.length) box.lastChild.remove();
  const groups = S.regions && S.ranges.length ? pageGroups() : [];
  S.pages.forEach((page, i) => {
    let div = box.children[i];
    if (!div) {
      div = h('div', { class: 'page' }, h('img', { draggable: 'false' }));
      box.append(div);
    }
    div.style.width = `${page.w * S.scale}px`;
    div.style.height = `${page.h * S.scale}px`;
    const image = div.firstChild;
    if (image.getAttribute('src') !== page.url) {
      if (image.getAttribute('src') && image.complete) {
        const ghost = image.cloneNode();
        ghost.className = 'page-ghost';
        div.append(ghost);
        setTimeout(() => ghost.remove(), 260);
      }
      image.src = page.url;
    }
    div.querySelectorAll('.hit, .tool, .ins, .grip, .ins-marker, .reflow, .mask, .page-add, .page-del, .page-tool, .page-num, .page-design, .cover-toggle').forEach((node) => node.remove());
    if (S.arrivePage === i && S.pages.length) {
      S.arrivePage = null;
      div.classList.remove('arrive');
      void div.offsetWidth;
      div.classList.add('arrive');
      setTimeout(() => div.classList.remove('arrive'), 900);
    }
    const gap = div.getBoundingClientRect().left - $('#scroll').getBoundingClientRect().left;
    div.classList.toggle('tight', gap < 56);
    div.style.setProperty('--inset', `${Math.max(10, 10 - gap)}px`);
    const coverOn = !/^(no|off|false)$/i.test(S.settings.cover || 'yes');
    if (i === 0) {
      div.append(h('button', {
        type: 'button',
        class: `cover-toggle${coverOn ? ' on' : ''}`,
        title: coverOn ? 'Turn the cover off' : 'Turn the cover on',
        html: '<span class="switch"><i></i></span><span>Cover</span>',
        onclick: (event) => {
          event.stopPropagation();
          event.currentTarget.classList.toggle('on');
          setTimeout(() => {
            commitHistory();
            if (coverOn) setHeader('cover', 'no');
            else {
              setHeader('cover', 'yes');
              if (!headerValue('cover-style')) setHeader('cover-style', 'classic');
            }
            commitHistory();
          }, 180);
        },
      }));
    }
    const designFirst = firstRangeOn(i);
    if ((i === 0 && coverOn && S.front) || designFirst) {
      div.append(h('button', {
        type: 'button',
        class: 'page-design',
        title: 'Design this page',
        html: icon('shapes', 16),
        onclick: (event) => {
          event.stopPropagation();
          if (i === 0 && coverOn && !designFirst) return cvEnterPage();
          if (i === 0 && coverOn && designFirst && (S.regions[designFirst.id] || [])[0] && S.regions[designFirst.id][0].page !== 0) return cvEnterPage();
          if (designFirst.kind === 'design') return cvEnterDesign(designFirst);
          cvEnterOverlay(i);
        },
      }));
    }
    const spot = numberingOn(i);
    if (spot) {
      const tag = h('button', {
        type: 'button',
        class: `page-num${spot.rule ? ' set' : ''}`,
        title: 'Page number',
        html: icon('hash', 14),
        onclick: (event) => {
          event.stopPropagation();
          numberMenu(tag, i);
        },
      });
      tag.style.top = `${(S.pages[i].h - 34) * S.scale + 5}px`;
      div.append(tag);
    }
    const last = i === S.pages.length - 1;
    div.append(h('button', {
      type: 'button',
      class: `page-add${last ? ' last' : ''}`,
      html: `${icon('plus', last ? 22 : 16)}<span>New page</span>`,
      onclick: (event) => {
        event.stopPropagation();
        addPageAfter(i);
      },
    }));
    div.classList.toggle('picked', Boolean(S.pagePicks && S.pagePicks.has(i)));
    if (pageRanges(i).length || i > 0 || coverIsOn()) {
      div.append(deleteButton(i));
    }
    div.append(...pageTools(i, groups));
  });
  drawHits();
  drawOverlayViews();
  if (typeof drawInsertPoints === 'function') drawInsertPoints();
  placeOverlays();
  if (typeof cvAfterLayout === 'function') cvAfterLayout();
  if (zoomPick) zoomPick.setLabel(`${Math.round((S.scale / (96 / 72)) * 100)}%`);
  if (typeof positionSheet === 'function') positionSheet();
}

function toggleMulti(range) {
  if (!S.multi) S.multi = new Set();
  if (S.edit && S.edit.range && !S.multi.size && S.edit.range !== range) S.multi.add(S.edit.range.start);
  if (S.sel && !S.multi.size && S.sel !== range) S.multi.add(S.sel.start);
  if (S.multi.has(range.start)) S.multi.delete(range.start);
  else S.multi.add(range.start);
  closeEditor(true);
  closePanel();
  S.sel = null;
  document.querySelectorAll('.hit').forEach((hit) => {
    const item = S.ranges.find((candidate) => String(candidate.id) === hit.dataset.id);
    hit.classList.toggle('multi', Boolean(item && S.multi.has(item.start)));
  });
  paintMultiBar();
}

function pickThrough(range) {
  const current = (S.edit && S.edit.range) || S.sel;
  const anchor = S.ranges.find((item) => item.start === S.anchorStart) || current || range;
  const from = S.ranges.indexOf(anchor);
  const to = S.ranges.indexOf(range);
  const [low, high] = from < to ? [from, to] : [to, from];
  S.multi = new Set(S.ranges.slice(low, high + 1).filter((item) => (S.regions[item.id] || []).length).map((item) => item.start));
  S.anchorStart = anchor.start;
  closeEditor(true);
  closePanel();
  S.sel = null;
  placeOverlays();
  paintMultiHits();
  paintMultiBar();
}

function clearMulti() {
  if (!S.multi) return;
  S.multi = null;
  document.querySelectorAll('.hit.multi').forEach((hit) => hit.classList.remove('multi'));
  paintMultiBar();
}

function restyleBlock(block, kind, key, value) {
  const base = parseFloat(S.settings['font-size']) || 12;
  const pickValue = (current) => (typeof value === 'function' ? value(current) : value);
  if (kind === 'heading') {
    const match = block[0].match(/^(#{1,3}\s+)(.*?)((?<!\])\s*\{([^{}]*)\})?\s*$/);
    if (!match) return block;
    const tokens = (match[4] || '').trim().split(/\s+/).filter(Boolean);
    const own = tokens.find((item) => item.startsWith(`${key}=`));
    const level = match[1].trim().length;
    const current = own ? parseFloat(own.split('=')[1]) : [20, 14, 12][level - 1];
    const next = pickValue(current);
    const kept = tokens.filter((item) => !item.startsWith(`${key}=`));
    if (next) kept.push(`${key}=${/\s/.test(next) ? `"${next}"` : next}`);
    return [`${match[1]}${match[2]}${kept.length ? ` {${kept.join(' ')}}` : ''}`, ...block.slice(1)];
  }
  if (kind === 'list' || kind === 'quote') {
    const marker = kind === 'list' ? /^(\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)(.*)$/ : /^(\s*>\s?)(.*)$/;
    return block.map((line) => {
      const match = line.match(marker);
      if (!match || !match[2].trim()) return line;
      const whole = match[2].match(/^\[(.*)\]\{([^{}]*)\}$/);
      const inner = whole ? whole[1] : match[2];
      const tokens = whole ? whole[2].match(/[A-Za-z][\w-]*="[^"]*"|\S+/g) || [] : [];
      const own = tokens.find((item) => item.startsWith(`${key}=`));
      const current = key === 'size' ? (own ? parseFloat(own.split('=')[1]) : base) : own ? own.slice(key.length + 1).replace(/"/g, '') : '';
      const next = pickValue(current);
      const kept = tokens.filter((item) => !item.startsWith(`${key}=`));
      if (next) kept.push(`${key}=${/\s/.test(next) ? `"${next}"` : next}`);
      return `${match[1]}${kept.length ? `[${inner}]{${kept.join(' ')}}` : inner}`;
    });
  }
  if (kind === 'para') {
    const next = pickValue(base);
    return next ? [':::text', `${key}: ${next}`, '---', ...block, ':::'] : block;
  }
  if (kind === 'text') {
    const split = block.findIndex((line) => line.trim() === '---');
    if (split < 0) return block;
    const head = block.slice(0, split);
    const line = head.find((item) => new RegExp(`^${key}\\s*:`, 'i').test(item));
    const current = line ? parseFloat(line.split(':')[1]) : base;
    const next = pickValue(key === 'size' ? current : line);
    const kept = head.filter((item) => !new RegExp(`^${key}\\s*:`, 'i').test(item));
    if (next) kept.push(`${key}: ${next}`);
    return [...kept, ...block.slice(split)];
  }
  return block;
}

function styleBlocks(key, value) {
  if (!S.multi || !S.multi.size) return;
  const all = lines();
  const picked = S.ranges.filter((range) => S.multi.has(range.start)).sort((a, b) => a.start - b.start);
  let delta = 0;
  const next = new Set();
  picked.forEach((range) => {
    const from = range.start - 1 + delta;
    const block = all.slice(from, range.end + delta);
    const out = restyleBlock(block, range.kind, key, value);
    all.splice(from, block.length, ...out);
    next.add(from + 1);
    delta += out.length - block.length;
  });
  S.multi = next;
  restoreSource(all.join('\n'));
  paintMultiBar();
}

function deleteBlocks() {
  if (!S.multi || !S.multi.size) return;
  const all = lines();
  S.ranges.filter((range) => S.multi.has(range.start)).sort((a, b) => b.start - a.start).forEach((range) => {
    let count = range.end - range.start + 1;
    if (all[range.end] !== undefined && !all[range.end].trim()) count += 1;
    all.splice(range.start - 1, count);
  });
  S.multi = null;
  restoreSource(all.join('\n'));
  paintMultiBar();
  toast('Blocks deleted. Ctrl+Z brings them back.');
}

function paintMultiBar() {
  spotSoon();
  let bar = $('#multiBar');
  if (!S.multi || !S.multi.size) {
    if (bar) conceal(bar, true);
    return;
  }
  if (!bar) {
    bar = h('div', { id: 'multiBar', class: 'multi-bar' });
    document.body.append(bar);
  }
  const count = S.multi.size;
  const step = (direction) => (current) => {
    const list = SIZE_LIST.map(Number);
    return String((direction > 0 ? list.find((size) => size > current + 0.01) : [...list].reverse().find((size) => size < current - 0.01)) || current);
  };
  bar.replaceChildren(
    h('span', { class: 'multi-count', text: `${count} ${count === 1 ? 'block' : 'blocks'}` }),
    fontPicker('', (value) => styleBlocks('font', value), { empty: 'Font' }),
    h('button', { type: 'button', class: 'pill ghost small', title: 'Smaller (Ctrl+Shift+<)', text: 'A−', onclick: () => styleBlocks('size', step(-1)) }),
    h('button', { type: 'button', class: 'pill ghost small', title: 'Bigger (Ctrl+Shift+>)', text: 'A+', onclick: () => styleBlocks('size', step(1)) }),
    dropdown({ choices: SIZE_LIST.map((size) => ({ value: size, label: `${size} pt` })), value: '', label: 'Size', onPick: (value) => styleBlocks('size', value) }),
    h('button', { type: 'button', class: 'pill small danger-pill', html: `${icon('trash', 14)}<span>Delete</span>`, onclick: deleteBlocks }),
    h('button', { type: 'button', class: 'round', title: 'Clear selection (Esc)', html: icon('close', 15), onclick: clearMulti }),
  );
  reveal(bar);
}

function drawHits() {
  const box = $('#pages');
  const side = Math.max(0, marginPt() - 10) * S.scale;
  const used = new Set();
  const stacks = {};
  S.ranges.forEach((range) => {
    (S.regions[range.id] || []).forEach((span) => {
      (stacks[span.page] = stacks[span.page] || []).push(span);
    });
  });
  Object.values(stacks).forEach((list) => list.sort((a, b) => a.y0 - b.y0));
  const room = (span) => {
    const list = stacks[span.page] || [];
    const at = list.indexOf(span);
    const before = list[at - 1];
    const after = list[at + 1];
    const top = before && before.y1 > span.y0 - 6 ? Math.max((before.y1 + span.y0) / 2, before.y1) : span.y0 - 3;
    const bottom = after && after.y0 < span.y1 + 6 ? Math.min((span.y1 + after.y0) / 2, after.y0) : span.y1 + 3;
    return [Math.min(top, span.y0), Math.max(bottom, span.y1)];
  };
  S.ranges.forEach((range) => {
    (S.regions[range.id] || []).forEach((span) => {
      const div = box.children[span.page];
      if (!div) return;
      used.add(span.page);
      const page = S.pages[span.page];
      const blank = range.kind === 'blank';
      const [near, far] = room(span);
      const top = (blank ? marginPt() : Math.max(near, 0)) * S.scale;
      const bottom = (blank ? page.h - marginPt() : Math.min(far, page.h - marginPt() * 0.55)) * S.scale;
      const hit = h('div', {
        class: `hit${blank ? ' blank' : ''}${S.sel === range ? ' sel' : ''}`,
        'data-id': range.id,
        style: `left:${side}px;right:${side}px;top:${top}px;height:${Math.max(bottom - top, 8)}px`,
        onclick: (event) => {
          if (event.shiftKey) {
            pickThrough(range);
            return;
          }
          if (event.ctrlKey || event.metaKey) {
            toggleMulti(range);
            S.anchorStart = range.start;
            return;
          }
          clearMulti();
          S.anchorStart = range.start;
          select(range);
        },
      });
      if (S.multi && S.multi.has(range.start)) hit.classList.add('multi');
      if (S.glow !== undefined && S.glow !== null && S.glow === range.id) hit.classList.add('fresh');
      div.append(hit);
    });
  });
  if (S.settings.cover === 'yes' && box.children[0] && !used.has(0)) {
    box.children[0].append(h('div', { class: 'hit cover', title: 'Edit cover', onclick: () => (headerValue('cover-style') === 'free' ? cvEnterPage() : openCover()) }));
  }
}

function placeOverlays() {
  document.querySelectorAll('.hit').forEach((hit) => {
    hit.classList.toggle('sel', Boolean(S.sel) && String(S.sel.id) === hit.dataset.id);
  });
  document.querySelectorAll('.tool, .resize-ghost, .grip').forEach((node) => node.remove());
  if (S.sel && isVisual(S.sel.kind)) {
    const first = document.querySelector(`.hit[data-id="${S.sel.id}"]`);
    if (first) attachHandles(first, S.sel);
  }
  if (S.sel && firstSpan(S.sel)) {
    const span = firstSpan(S.sel);
    const div = $('#pages').children[span.page];
    if (typeof attachGrip === 'function') attachGrip(S.sel);
    const tool = h(
      'div',
      { class: 'tool' },
      ...(isVisual(S.sel.kind) ? toolbarLayout(S.sel) : []),
      h('button', { html: icon('up', 16), title: 'Move up', onmousedown: keep, onclick: () => move(-1) }),
      h('button', { html: icon('down', 16), title: 'Move down', onmousedown: keep, onclick: () => move(1) }),
      h('button', { html: icon('copy', 16), title: 'Duplicate', onmousedown: keep, onclick: () => duplicate() }),
      h('button', { class: 'danger', html: icon('trash', 16), title: 'Delete', onmousedown: keep, onclick: () => remove(S.sel) }),
    );
    tool.style.right = `${Math.max(marginPt() - 6, 8) * S.scale}px`;
    tool.style.top = `${Math.max(span.y0 * S.scale - 40, 4)}px`;
    div.append(tool);
  }
  if (S.edit) positionEditor();
  spotSoon();
}

function keep(event) {
  event.preventDefault();
}

function scrollToRange(range) {
  const span = firstSpan(range);
  if (!span) return;
  const div = $('#pages').children[span.page];
  if (div) $('#scroll').scrollTo({ top: div.offsetTop + span.y0 * S.scale - 160, behavior: 'smooth' });
}

function select(range) {
  if (S.sel === range && (S.edit || S.panel)) {
    if (!S.edit && S.panel && isProse(range)) openEditor(range);
    return;
  }
  closeEditor();
  closePanel();
  S.settingsOpen = false;
  S.sel = range;
  unpickPage();
  if (range.kind === 'design' && typeof cvEnterDesign === 'function') return cvEnterDesign(range);
  if (TEXT_KINDS.has(range.kind) || isRichText(range)) openEditor(range);
  else {
    openPanel(range);
    if (isProse(range)) openEditor(range);
  }
  placeOverlays();
}

function deselect() {
  unpickPage();
  closeEditor();
  closePanel();
  S.settingsOpen = false;
  S.sel = null;
  conceal($('#panel'));
  placeOverlays();
}

function docFont() {
  const names = (S.settings.font || 'Cambria').split(',').map((name) => name.trim()).filter(Boolean);
  const generic = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'system-ui']);
  return `${names.map((name) => (generic.has(name) ? name : `"${name}"`)).join(',')},Georgia,serif`;
}

function editorStyle(range) {
  const size = parseFloat(S.settings['font-size']) || 11;
  const zoom = size / 12;
  const first = (linesOf(range)[0] || '').match(/^(#{1,3})\s/);
  if (range.kind === 'heading' && first) return headingLook(first[1].length, zoom);
  const spacing = parseFloat(S.settings['line-spacing']);
  return { size: size * S.scale, weight: 400, italic: false, height: spacing > 0 ? spacing : 1.8 };
}

function headingLook(level, zoom) {
  const set = S.settings;
  const look = String(set['heading-style'] || 'accent').toLowerCase();
  let points = [20, 14, 12][level - 1] * zoom;
  let height = [1.25, 1.35, 1.4][level - 1];
  let weight = 700;
  let color = '';
  let decoration = '';
  if (look === 'underline' && level < 3) {
    weight = 400;
    decoration = 'underline';
    points = level === 1 ? 17 : 14;
  } else if (look === 'plain' && level === 1) points = 17;
  else if (look === 'accent') {
    color = set.accent || '#1f4e79';
    if (level === 1) {
      points = 15;
      height = 1.3;
    } else if (level === 2) points = 12.5;
  }
  const big = parseFloat(set['heading-size']);
  if (big && level < 3) points = level === 1 ? big : big * 0.85;
  const own = parseFloat(set[`h${level}-size`]);
  if (own && level > 1) points = own;
  const custom = String(set['heading-color'] || '').trim();
  if (/^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(custom)) color = custom;
  const upper = level < 3 && /^(upper|caps|uppercase)$/i.test(String(set['heading-case'] || '').trim());
  const where = String(set['heading-align'] || '').trim().toLowerCase();
  const align = level < 3 && ['center', 'centre', 'right'].includes(where) ? (where === 'right' ? 'right' : 'center') : '';
  const font = String(set['heading-font'] || '').split(',')[0].trim();
  return { size: points * S.scale, weight, italic: level === 3, height, color, decoration, upper, align, font };
}

function inPlace(range) {
  return (range.kind === 'para' || range.kind === 'heading' || range.kind === 'blank' || range.kind === 'list' || isRichText(range));
}

function positionEditor() {
  if (!S.edit || S.edit.cover || !S.edit.range) return;
  const { range, ta } = S.edit;
  const span = firstSpan(range);
  if (!span) return;
  const div = $('#pages').children[span.page];
  if (ta.parentNode !== div) div.append(ta);
  spotSoon();
  const style = editorStyle(range);
  const prose = Boolean(S.edit.prose);
  const place = (inPlace(range) && ta.classList.contains('rich')) || prose;
  const padX = place ? 0 : 14;
  const left = marginPt() * S.scale - padX;
  const width = (S.pages[span.page].w - 2 * marginPt()) * S.scale + 2 * padX;
  ta.classList.toggle('inplace', place);
  ta.classList.toggle('prose', prose);
  ta.style.left = `${left}px`;
  ta.style.width = `${width}px`;
  const textTop = prose ? span.y0 : span.t !== undefined ? span.t : span.y0;
  ta.style.top = `${textTop * S.scale}px`;
  ta.style.fontFamily = style.font ? `"${style.font}",${docFont()}` : docFont();
  ta.style.fontSize = `${style.size}px`;
  ta.style.fontWeight = style.weight;
  ta.style.fontStyle = style.italic || (prose && ['theorem', 'lemma', 'proposition', 'corollary'].includes(range.kind)) ? 'italic' : 'normal';
  ta.style.lineHeight = style.height;
  ta.style.color = place && style.color ? style.color : '';
  ta.style.textDecoration = style.decoration || '';
  ta.style.textTransform = style.upper ? 'uppercase' : '';
  ta.style.letterSpacing = style.upper ? '0.04em' : '';
  if (prose && S.edit.paperFor !== span.page) {
    const look = paperLook(span);
    S.edit.paperFor = span.page;
    ta.style.setProperty('--ed-bg', look.bg);
    ta.style.background = look.bg;
    ta.style.borderLeft = look.edge ? `${2 * S.scale}px solid ${look.edge}` : '';
    if (look.edge) ta.style.setProperty('--ed-edge', look.edge);
    const boxed = Boolean(look.edge) || look.bg !== '#fff';
    ta.style.padding = boxed ? `${8 * S.scale}px ${(look.edge ? 12 : 14) * S.scale}px` : '0';
  }
  if (place) {
    const explicit = /^align\s*:/im.test(S.edit.prefix || '');
    const headAlign = range.kind === 'heading' && ((S.edit.tail || '').match(/align=([a-z]+)/i) || [])[1];
    if (range.kind === 'heading') ta.style.textAlign = headAlign || style.align || 'left';
    else if (!explicit) ta.style.textAlign = S.edit.byLine || String(S.settings.justify || 'yes').toLowerCase() === 'no' ? 'left' : 'justify';
    const indent = String(S.settings['paragraph-indent'] || '').trim();
    ta.style.textIndent = indent && !/^(no|none|0)$/i.test(indent) && range.kind === 'para' ? `calc(${parseFloat(indent) || 0} * ${/em$/.test(indent) ? style.size : 1}px)` : '0';
    ta.style.minHeight = `${prose ? Math.max((span.y1 - span.y0) * S.scale, style.size * style.height) : style.size * style.height}px`;
    if (prose) proseColumns(ta, range, S.edit.model);
  } else {
    ta.style.minHeight = `${style.size * style.height * 2}px`;
  }
  fitEditor(ta);
  if (S.edit.base == null) S.edit.base = ta.offsetHeight / S.scale;
  if (place) {
    ta.style.top = `${textTop * S.scale}px`;
    reflow(div, span, ta);
  } else {
    clearReflow();
    const gap = 14;
    const above = span.y0 * S.scale - ta.offsetHeight - gap;
    ta.style.top = `${above >= 6 ? above : span.y1 * S.scale + gap}px`;
  }
  placeFormatBar();
  if (typeof paintCaret === 'function') requestAnimationFrame(paintCaret);
}

function markEditing(div) {
  document.querySelectorAll('#pages > .page.editing').forEach((page) => {
    if (page !== div) page.classList.remove('editing');
  });
  if (div) div.classList.add('editing');
}

function spotSoon() {
  const editor = S.edit && !S.edit.cover && S.edit.ta && S.edit.ta.isConnected ? S.edit.ta : null;
  const sheet = typeof SHEET !== 'undefined' && SHEET.root && SHEET.mode !== 'below' ? SHEET.root : null;
  let host = editor || sheet;
  let hit = null;
  if (!host && S.sel && S.panel && !(S.multi && S.multi.size)) {
    hit = document.querySelector(`.hit[data-id="${S.sel.id}"]`);
    host = hit;
  }
  document.querySelectorAll('.hit.focus').forEach((node) => {
    if (node !== hit) node.classList.remove('focus', 'focus-in');
  });
  if (hit) {
    hit.classList.add('focus');
    if (S.spotFor !== S.sel.id) hit.classList.add('focus-in');
  }
  S.spotFor = host && S.sel ? S.sel.id : null;
  markEditing(host ? host.closest('.page') : null);
}

function clearReflow() {
  document.querySelectorAll('.reflow, .mask').forEach((node) => node.remove());
}

function reflow(div, span, ta) {
  clearReflow();
  const spans = S.regions[S.edit.range.id] || [];
  const page = S.pages[span.page];
  const bottom = (page.h - marginPt()) * S.scale;
  const top = parseFloat(ta.style.top) || (span.t !== undefined ? span.t : span.y0) * S.scale;
  const delta = ta.offsetHeight - (S.edit.base ? S.edit.base * S.scale : ta.offsetHeight);
  if (spans.length !== 1 || bottom <= top) {
    spans.forEach((other, index) => {
      const sheet = $('#pages').children[other.page];
      if (!sheet) return;
      const from = index === 0 ? top : other.y0 * S.scale;
      sheet.append(h('div', { class: 'mask', style: `top:${from}px;height:${Math.max(other.y1 * S.scale - from + 4, 0)}px` }));
    });
    return;
  }
  const edge = top + ta.offsetHeight;
  div.append(h('div', { class: 'mask', style: `top:${top}px;height:${Math.max(bottom - top, 0)}px` }));
  if (edge < bottom) {
    const image = h('img', { src: div.firstChild.src, draggable: 'false', style: `top:${delta - edge}px;width:${page.w * S.scale}px;height:${page.h * S.scale}px` });
    div.append(h('div', { class: 'reflow', style: `top:${edge}px;height:${bottom - edge}px` }, image));
  }
}

function fitEditor(ta) {
  ta.style.height = 'auto';
  ta.style.height = `${Math.max(ta.scrollHeight, parseFloat(ta.style.minHeight) || 0)}px`;
}

function openEditor(range, selectAll = false) {
  if (!firstSpan(range)) return;
  if ((['para', 'heading', 'blank', 'list'].includes(range.kind) || isRichText(range) || isProse(range)) && typeof openRich === 'function') return openRich(range, selectAll);
  const ta = h('textarea', { class: 'editor', spellcheck: 'false' });
  ta.value = linesOf(range).join('\n');
  S.edit = { range, ta };
  ta.addEventListener('input', () => {
    setRangeLines(S.edit.range, ta.value.split('\n'));
    positionEditor();
    schedule(250);
  });
  ta.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeEditor();
    }
  });
  ta.addEventListener('blur', () => {
    if (S.edit && S.edit.ta === ta) closeEditor();
  });
  positionEditor();
  mountFormatBar();
  ta.focus();
  if (selectAll) ta.select();
  else ta.setSelectionRange(ta.value.length, ta.value.length);
}

function closeEditor(silent = false) {
  if (!S.edit) return;
  if (S.edit.cover) {
    const { cover, bar } = S.edit;
    S.edit = null;
    if (bar) bar.remove();
    if (typeof closeChipPop === 'function') closeChipPop();
    cover.close();
    return;
  }
  const { range, ta, bar } = S.edit;
  const keepPage = Boolean(S.edit.blank || S.edit.keep);
  S.edit = null;
  clearReflow();
  spotSoon();
  const empty = !(ta.value !== undefined ? ta.value : ta.textContent).trim();
  ta.remove();
  if (bar) bar.remove();
  if (typeof closeChipPop === 'function') closeChipPop();
  if (empty && !silent && !keepPage) remove(range);
}

function closePanel() {
  if (typeof closeSheet === 'function') closeSheet();
  S.panel = null;
  if (!S.settingsOpen) conceal($('#panel'));
  spotSoon();
}

function remove(range) {
  if (!range) return;
  const all = lines();
  let from = range.start - 1;
  let count = range.end - range.start + 1;
  if (all[from + count] !== undefined && !all[from + count].trim()) count += 1;
  else if (from > 0 && !all[from - 1].trim()) {
    from -= 1;
    count += 1;
  }
  all.splice(from, count);
  S.source = all.join('\n');
  S.ranges.splice(S.ranges.indexOf(range), 1);
  shiftAfter(range.end, -count);
  if (S.sel === range) {
    if (S.edit) closeEditor(true);
    closePanel();
    S.sel = null;
  }
  lockHits();
  placeOverlays();
  schedule(300);
}

function duplicate() {
  const range = S.sel;
  if (!range) return;
  closeEditor(true);
  const copy = linesOf(range);
  const all = lines();
  all.splice(range.end, 0, '', ...copy);
  S.source = all.join('\n');
  shiftAfter(range.end, copy.length + 1);
  const fresh = { id: `n${++S.seq}`, start: range.end + 2, end: range.end + 1 + copy.length, kind: range.kind };
  S.ranges.splice(S.ranges.indexOf(range) + 1, 0, fresh);
  S.sel = fresh;
  closePanel();
  lockHits();
  if (!TEXT_KINDS.has(fresh.kind)) openPanel(fresh);
  placeOverlays();
  schedule(300);
}

function move(direction) {
  const range = S.sel;
  if (!range) return;
  const index = S.ranges.indexOf(range);
  const other = S.ranges[index + direction];
  if (!other) return;
  closeEditor(true);
  const first = direction < 0 ? other : range;
  const second = direction < 0 ? range : other;
  const all = lines();
  const a = all.slice(first.start - 1, first.end);
  const gap = all.slice(first.end, second.start - 1);
  const b = all.slice(second.start - 1, second.end);
  all.splice(first.start - 1, second.end - first.start + 1, ...b, ...gap, ...a);
  S.source = all.join('\n');
  const begin = first.start;
  second.start = begin;
  second.end = begin + b.length - 1;
  first.start = second.end + 1 + gap.length;
  first.end = first.start + a.length - 1;
  const at = Math.min(index, index + direction);
  S.ranges.splice(at, 2, second, first);
  lockHits();
  placeOverlays();
  schedule(300);
}

function insertLines(block, kind) {
  if (!S.pages.length) return;
  closeEditor(true);
  const target = S.target && S.ranges.includes(S.target.range) ? S.target : null;
  S.target = null;
  if (typeof clearMarker === 'function') clearMarker();
  const anchor = target ? target.range : S.sel;
  if (anchor && anchor.kind === 'blank' && kind !== 'blank') return fillBlank(anchor, block, kind);
  if (target && target.where === 'replace') return replaceWith(target.range, block, kind);
  if (target && target.where === 'before') return insertBefore(target.range, block, kind);
  const after = target ? target.range : S.sel || rangeAtView();
  const all = lines();
  let at = after ? after.end : S.front ? S.front[1] : all.length;
  if (!after && !S.front) while (at > 0 && !all[at - 1].trim()) at -= 1;
  all.splice(at, 0, '', ...block);
  S.source = all.join('\n');
  shiftAfter(at, block.length + 1);
  const fresh = { id: `n${++S.seq}`, start: at + 2, end: at + 1 + block.length, kind };
  const place = after ? S.ranges.indexOf(after) + 1 : 0;
  S.ranges.splice(place, 0, fresh);
  closePanel();
  S.settingsOpen = false;
  S.sel = fresh;
  S.focusNew = true;
  lockHits();
  if (kind === 'design') S.pendingDesign = fresh.start;
  else if (!TEXT_KINDS.has(kind)) openPanel(fresh);
  placeOverlays();
  schedule(200);
}

const NUMBER_MODES = ['hide', 'skip', 'start', 'restart'];
const NUMBER_STYLES = ['numbers', 'roman', 'Roman', 'letters', 'Letters'];

function firstRangeOn(pageIndex) {
  let best = null;
  let top = Infinity;
  S.ranges.forEach((range) => {
    if (range.kind === 'pagebreak' || range.kind === 'numbering' || range.kind === 'overlay') return;
    const span = (S.regions[range.id] || [])[0];
    if (span && span.page === pageIndex && span.y0 < top) {
      best = range;
      top = span.y0;
    }
  });
  return best;
}

function leadingRanges(first) {
  const out = [];
  let at = S.ranges.indexOf(first) - 1;
  while (at >= 0 && ['numbering', 'overlay'].includes(S.ranges[at].kind)) {
    out.push(S.ranges[at]);
    at -= 1;
  }
  return out;
}

function numberingOn(pageIndex) {
  const first = firstRangeOn(pageIndex);
  if (!first) return null;
  return { first, rule: leadingRanges(first).find((range) => range.kind === 'numbering') || null };
}

function drawOverlayViews() {
  document.querySelectorAll('.ov-view').forEach((node) => node.remove());
  if (!S.overlays || typeof cvParse !== 'function') return;
  S.ranges.filter((range) => range.kind === 'overlay').forEach((range) => {
    const pageIndex = S.overlays[`ov-${range.start}`];
    const div = $('#pages').children[pageIndex];
    if (pageIndex === undefined || !div) return;
    if (CV.mode === 'page' && CV.target && CV.target.kind === 'overlay' && CV.target.start === range.start) return;
    const view = h('div', { class: 'ov-view' });
    const saved = CV.scale;
    CV.scale = S.scale;
    linesOf(range).forEach((line) => {
      const match = line.match(/^\s*box\s*:\s*(.*)$/i);
      const box = match && cvParse(match[1]);
      if (!box) return;
      const el = h('div', { class: `cvb cvb-${box.kind}` });
      if (box.kind === 'text') el.textContent = cvShow(box);
      else if (box.kind === 'image' && box.text) el.append(h('img', { src: fileUrl(box.text), draggable: 'false', style: `object-fit:${box.p.fit || 'cover'}` }));
      cvStyle(el, box);
      view.append(el);
    });
    CV.scale = saved;
    view.style.fontFamily = docFont();
    div.append(view);
  });
}

function numberWords(rule) {
  return rule ? linesOf(rule)[0].replace(/^:::\s*numbering\s*/i, '').split(/[\s,]+/).filter(Boolean) : [];
}

function numberMenu(button, pageIndex) {
  const spot = numberingOn(pageIndex);
  if (!spot) return;
  const words = numberWords(spot.rule);
  const mode = words.find((word) => NUMBER_MODES.includes(word)) || 'auto';
  const style = words.find((word) => NUMBER_STYLES.includes(word)) || '';
  const mark = (value, label) => ({ value, label: value === style ? `${label} ✓` : label });
  const choices = [
    { value: 'auto', label: 'Number normally' },
    { value: 'hide', label: 'Hide on this page' },
    { value: 'skip', label: "Don't count this page" },
    { value: 'start', label: 'Start numbering here' },
    { value: 'restart', label: 'Restart at 1 here' },
    mark('numbers', '1, 2, 3 from here'),
    mark('roman', 'i, ii, iii from here'),
    mark('Roman', 'I, II, III from here'),
    mark('letters', 'a, b, c from here'),
  ];
  showMenu(button, choices, mode, (value) => {
    let next = [...words];
    if (NUMBER_STYLES.includes(value)) {
      next = next.filter((word) => !NUMBER_STYLES.includes(word));
      if (value !== style) next.push(value);
    } else {
      next = next.filter((word) => !NUMBER_MODES.includes(word) && !/^\d+$/.test(word));
      if (value !== 'auto') next.unshift(value);
    }
    writeNumbering(spot, next);
  }, true);
}

function writeNumbering(spot, words) {
  const all = lines();
  const line = `:::numbering ${words.join(' ')}`;
  if (spot.rule) {
    let count = spot.rule.end - spot.rule.start + 1;
    if (!words.length && all[spot.rule.start - 1 + count] !== undefined && !all[spot.rule.start - 1 + count].trim()) count += 1;
    all.splice(spot.rule.start - 1, count, ...(words.length ? [line] : []));
  } else if (words.length) {
    all.splice(spot.first.start - 1, 0, line, '');
  } else {
    return;
  }
  restoreSource(all.join('\n'));
}

function fillBlank(range, block, kind) {
  setRangeLines(range, [':::pagebreak']);
  range.kind = 'pagebreak';
  S.sel = null;
  S.target = { range, where: 'after' };
  insertLines(block, kind);
}

function lastRangeOn(pageIndex, strict = false) {
  let best = null;
  let bestKey = -1;
  S.ranges.forEach((range) => {
    if (range.kind === 'pagebreak') return;
    (S.regions[range.id] || []).forEach((span) => {
      const key = span.page * 100000 + span.y1;
      if (span.page <= pageIndex && key > bestKey) {
        best = range;
        bestKey = key;
      }
    });
  });
  return best || (strict ? null : S.ranges[S.ranges.length - 1] || null);
}

function pageInView() {
  const scroll = $('#scroll');
  const middle = scroll.scrollTop + scroll.clientHeight / 2;
  const pages = [...$('#pages').children];
  let index = 0;
  pages.forEach((div, i) => {
    if (div.offsetTop <= middle) index = i;
  });
  return Math.min(index, S.pages.length - 1);
}

function rangeAtView() {
  if (!S.ranges.length || !S.regions) return S.ranges[S.ranges.length - 1] || null;
  const page = pageInView();
  const seen = S.ranges.filter((range) => (S.regions[range.id] || []).some((span) => span.page <= page));
  return seen.length ? seen[seen.length - 1] : null;
}

function pageRanges(pageIndex) {
  return S.ranges.filter((range) => {
    const spans = S.regions[range.id] || [];
    return spans.length && spans.every((span) => span.page === pageIndex);
  });
}

function coverIsOn() {
  return Boolean(S.front) && !/^(no|off|false)$/i.test(S.settings.cover || 'yes');
}

function removePage(pageIndex) {
  if (!S.pages.length) return;
  if (pageIndex === 0 && coverIsOn()) {
    commitHistory();
    setHeader('cover', 'no');
    commitHistory();
    toast('Cover removed. Ctrl+Z brings it back.');
    return;
  }
  const doomed = pageRanges(pageIndex);
  if (doomed.length) {
    let before = S.ranges[S.ranges.indexOf(doomed[0]) - 1];
    while (before && ['numbering', 'overlay'].includes(before.kind)) {
      doomed.unshift(before);
      before = S.ranges[S.ranges.indexOf(before) - 1];
    }
    if (before && before.kind === 'pagebreak') doomed.unshift(before);
  } else {
    const after = S.ranges.find((range) => (S.regions[range.id] || []).some((span) => span.page > pageIndex));
    const index = after ? S.ranges.indexOf(after) : S.ranges.length;
    const breaker = S.ranges[index - 1];
    if (breaker && breaker.kind === 'pagebreak') doomed.push(breaker);
  }
  if (!doomed.length) return;
  commitHistory();
  closeEditor(true);
  closePanel();
  S.sel = null;
  [...doomed].sort((a, b) => b.start - a.start).forEach((range) => remove(range));
  commitHistory();
  toast('Page removed. Ctrl+Z brings it back.');
}

function pageWeight(pageIndex) {
  return pageRanges(pageIndex).reduce((sum, range) => {
    if (range.kind === 'blank' || range.kind === 'pagebreak') return sum;
    if (!TEXT_KINDS.has(range.kind)) return sum + 40;
    return sum + linesOf(range).join(' ').split(/\s+/).filter(Boolean).length;
  }, 0);
}

function animateRemovePage(pageIndex, page) {
  const before = S.source;
  if (page) {
    page.style.setProperty('--h', `${page.offsetHeight}px`);
    page.classList.add('leaving');
    const previous = page.previousElementSibling;
    const scroll = $('#scroll');
    if (!page.nextElementSibling && previous && scroll) {
      const top = scroll.scrollTop + previous.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 24;
      scroll.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  }
  setTimeout(() => {
    removePage(pageIndex);
    if (S.source === before && page) page.classList.remove('leaving');
  }, 560);
}

function pickPage(index, how = '') {
  const had = S.pagePicks || new Set();
  if (index === null || index === undefined) S.pagePicks = new Set();
  else if (how === 'range' && S.pagePick !== null && S.pagePick !== undefined) {
    S.pagePicks = new Set();
    const [from, to] = [Math.min(S.pagePick, index), Math.max(S.pagePick, index)];
    for (let i = from; i <= to; i += 1) S.pagePicks.add(i);
  } else if (how === 'toggle') {
    S.pagePicks = new Set(had);
    if (S.pagePicks.has(index)) S.pagePicks.delete(index);
    else S.pagePicks.add(index);
  } else S.pagePicks = new Set([index]);
  if (how !== 'range') S.pagePick = S.pagePicks.size ? index : null;
  if (S.pagePick !== null && S.pagePick !== undefined && !S.pagePicks.has(S.pagePick)) S.pagePick = [...S.pagePicks][0];
  if (!S.pagePicks.size) S.pagePick = null;
  S.armed = null;
  paintPicks();
}

function paintPicks() {
  const picks = S.pagePicks || new Set();
  document.querySelectorAll('#pages > .page').forEach((div, i) => div.classList.toggle('picked', picks.has(i)));
}

function pickedPages() {
  return [...(S.pagePicks || [])].sort((a, b) => a - b);
}

function unpickPage() {
  if ((S.pagePick === null || S.pagePick === undefined) && !(S.pagePicks && S.pagePicks.size)) return;
  S.pagePick = null;
  S.pagePicks = new Set();
  S.armed = null;
  document.querySelectorAll('#pages > .page.picked').forEach((div) => div.classList.remove('picked', 'armed'));
}

function pageRuns(list) {
  const runs = [];
  list.forEach((index) => {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === index - 1) last.push(index);
    else runs.push([index]);
  });
  return runs;
}

function runRanges(run) {
  return S.ranges.filter((range) => {
    const spans = S.regions[range.id] || [];
    return spans.length && spans.every((span) => run.includes(span.page));
  });
}

function pagesText(list) {
  const all = lines();
  return pageRuns(list)
    .map((run) => {
      const ranges = runRanges(run).filter((range) => range.kind !== 'pagebreak');
      if (!ranges.length) return '';
      const first = leadingRanges(ranges[0]).reverse()[0] || ranges[0];
      return all.slice(first.start - 1, ranges[ranges.length - 1].end).join('\n');
    })
    .filter(Boolean)
    .join('\n\n:::pagebreak\n\n');
}

function confirmHeavyPages(list, label) {
  const key = list.join(',');
  const weight = list.reduce((sum, index) => sum + pageWeight(index), 0);
  if (weight <= 30 || (S.armed && S.armed.index === key && performance.now() - S.armed.time < 2500)) {
    S.armed = null;
    return true;
  }
  S.armed = { index: key, time: performance.now() };
  list.forEach((index) => {
    const div = $('#pages').children[index];
    if (!div) return;
    div.classList.remove('armed');
    void div.offsetWidth;
    div.classList.add('armed');
  });
  toast(`These pages have a lot on them. Press ${label} again to remove them.`);
  return false;
}

function removePages(list) {
  if (!list.length) return;
  if (coverIsOn() && list.includes(0)) {
    setHeader('cover', 'no');
    list = list.filter((index) => index !== 0);
  }
  const doomed = new Set();
  pageRuns(list).forEach((run) => {
    const ranges = runRanges(run);
    if (!ranges.length) return;
    let before = S.ranges[S.ranges.indexOf(ranges[0]) - 1];
    while (before && ['numbering', 'overlay'].includes(before.kind)) {
      doomed.add(before);
      before = S.ranges[S.ranges.indexOf(before) - 1];
    }
    if (before && before.kind === 'pagebreak') {
      doomed.add(before);
      while (ranges.length && ranges[ranges.length - 1].kind === 'pagebreak') ranges.pop();
    }
    ranges.forEach((range) => doomed.add(range));
  });
  commitHistory();
  closeEditor(true);
  closePanel();
  S.sel = null;
  [...doomed].sort((a, b) => b.start - a.start).forEach((range) => remove(range));
  commitHistory();
  toast('Pages removed. Ctrl+Z brings them back.');
}

function pageText(index) {
  const ranges = pageRanges(index).filter((range) => !['pagebreak'].includes(range.kind));
  if (!ranges.length) return '';
  const all = lines();
  const first = leadingRanges(ranges[0]).reverse()[0] || ranges[0];
  return all.slice(first.start - 1, ranges[ranges.length - 1].end).join('\n');
}

function confirmHeavy(index, label) {
  if (pageWeight(index) <= 30 || (S.armed && S.armed.index === index && performance.now() - S.armed.time < 2500)) {
    S.armed = null;
    return true;
  }
  S.armed = { index, time: performance.now() };
  const div = $('#pages').children[index];
  if (div) {
    div.classList.remove('armed');
    void div.offsetWidth;
    div.classList.add('armed');
  }
  toast(`This page has a lot on it. Press ${label} again to remove it.`);
  return false;
}

function dropPickedPage(label) {
  const picked = pickedPages();
  if (!picked.length) return;
  if (picked.length > 1) {
    if (!confirmHeavyPages(picked, label)) return;
    unpickPage();
    removePages(picked);
    return;
  }
  const index = picked[0];
  if (!confirmHeavy(index, label)) return;
  unpickPage();
  animateRemovePage(index, $('#pages').children[index]);
}

function deleteButton(pageIndex) {
  const heavy = pageWeight(pageIndex) > 30;
  const button = h('button', {
    type: 'button',
    class: `page-del${heavy ? ' heavy' : ''}`,
    title: heavy ? 'Hold to remove page' : 'Remove page',
    html: `${icon('trash', 15)}${heavy ? '<svg class="hold-ring" viewBox="0 0 34 34"><rect x="1" y="1" width="32" height="32" rx="11" pathLength="100"/></svg>' : ''}`,
  });
  const go = () => animateRemovePage(pageIndex, button.closest('.page'));
  let timer = null;
  const stop = () => {
    clearTimeout(timer);
    timer = null;
    button.classList.remove('holding');
  };
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!heavy || event.detail === 0) go();
  });
  if (!heavy) return button;
  button.addEventListener('pointerdown', (event) => {
    if (event.button) return;
    event.stopPropagation();
    button.setPointerCapture(event.pointerId);
    button.classList.remove('nudge');
    button.classList.add('holding');
    timer = setTimeout(() => {
      timer = null;
      button.classList.remove('holding');
      button.classList.add('done');
      go();
    }, 750);
  });
  button.addEventListener('pointerup', () => {
    if (!timer) return;
    stop();
    void button.offsetWidth;
    button.classList.add('nudge');
    setTimeout(() => button.classList.remove('nudge'), 1400);
  });
  button.addEventListener('pointercancel', stop);
  button.addEventListener('lostpointercapture', () => timer && stop());
  return button;
}

function addPageAfter(pageIndex) {
  if (!S.pages.length) return;
  const range = lastRangeOn(pageIndex, true);
  if (range) S.target = { range, where: 'after' };
  else {
    const next = S.ranges.find((item) => item.kind !== 'pagebreak' && (S.regions[item.id] || []).some((span) => span.page > pageIndex));
    if (S.edit) closeEditor(true);
    S.sel = null;
    S.target = next ? { range: next, where: 'before' } : null;
  }
  S.arrivePage = pageIndex + 1;
  insertLines([':::blank'], 'blank');
  S.focusSelectAll = false;
}

function pickFile(accept = '') {
  return new Promise((resolve) => {
    const input = $('#file');
    input.value = '';
    input.accept = accept;
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

function toBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(file);
  });
}

async function upload(file) {
  const answer = await api('/api/upload', { name: file.name, data: await toBase64(file) });
  if (answer.error) {
    toast(answer.error, true);
    return null;
  }
  return answer.path;
}

async function insertTemplate(template) {
  conceal($('#palette'));
  if (template.upload) {
    const file = await pickFile('image/*');
    if (!file) return;
    const path = await upload(file);
    if (path) insertLines([':::figure', `src: ${path}`, 'caption: Figure caption.', 'width: 70%', ':::'], 'figure');
    return;
  }
  if (template.kind === 'bibliography') {
    const title = citationTitle(headerValue('citations') || S.settings.citations);
    insertLines([`# ${title} {nonumber}`, '', ...template.lines], 'heading');
    return;
  }
  insertLines(template.lines.slice(), template.kind);
}

function openPanel(range) {
  S.settingsOpen = false;
  S.panel = { range, model: parseBlock(range.kind, linesOf(range)) };
  renderPanel();
  if (typeof openSheet === 'function') openSheet(range);
}

function commitPanel(delay) {
  const { range, model } = S.panel;
  setRangeLines(range, serializeBlock(model));
  schedule(delay);
}

function inputFor(row, spec, onChange) {
  if (spec === 'y') {
    const box = h('input', { type: 'checkbox' });
    box.checked = ['yes', 'true', 'on', '1'].includes(String(row.value).toLowerCase());
    box.addEventListener('change', () => {
      row.value = box.checked ? 'yes' : 'no';
      onChange(150);
    });
    return h('div', { class: 'field' }, box);
  }
  if (Array.isArray(spec) && spec.length && typeof spec[0] === 'object') {
    const choices = spec.some((item) => item.value === row.value) ? spec : [...spec, { value: row.value, label: row.value }];
    const pick = dropdown({
      choices,
      value: row.value,
      onPick: (value) => {
        row.value = value;
        onChange(150);
      },
    });
    return h('div', { class: 'field' }, pick);
  }
  if (Array.isArray(spec)) {
    const choices = spec.includes(row.value) ? spec : [...spec, row.value];
    const pick = dropdown({
      choices: choices.map((choice) => ({ value: choice, label: choice || 'auto' })),
      value: row.value,
      onPick: (value) => {
        row.value = value;
        onChange(150);
      },
    });
    return h('div', { class: 'field' }, pick);
  }
  const text = h('input', { type: 'text', spellcheck: 'false' });
  text.value = row.value;
  text.addEventListener('input', () => {
    row.value = text.value;
    onChange(700);
  });
  const field = h('div', { class: 'field' }, text);
  if (spec === 'f') {
    field.append(
      h('button', {
        class: 'mini',
        html: icon('upload', 15),
        title: 'Choose file',
        onclick: async () => {
          const file = await pickFile();
          if (!file) return;
          const path = await upload(file);
          if (!path) return;
          const cut = row.value.indexOf('|');
          row.value = cut >= 0 ? `${path} ${row.value.slice(cut)}` : path;
          text.value = row.value;
          onChange(150);
        },
      }),
    );
  }
  return field;
}

function renderPanel() {
  const { range, model } = S.panel;
  const schema = schemaOf(range.kind);
  const root = $('#panel');
  const previous = root.querySelector('.panel-body');
  const scroll = previous && previous.dataset.rid === String(range.id) ? previous.scrollTop : 0;
  root.replaceChildren();
  root.classList.remove('wide');
  reveal(root);
  const head = h(
    'div',
    { class: 'panel-head' },
    h('span', { text: schema ? schema.label : prettyKey(range.kind) }),
    panelHelpButton(range.kind),
    h('button', { class: 'round', html: icon('close', 16), title: 'Close', onclick: deselect }),
  );
  const body = h('div', { class: 'panel-body', 'data-rid': String(range.id) });
  root.append(head, body);
  requestAnimationFrame(() => {
    body.scrollTop = scroll;
  });
  if (model.kind === 'raw') {
    const area = h('textarea', { spellcheck: 'false' });
    area.value = model.body.join('\n');
    area.addEventListener('input', () => {
      model.body = area.value.split('\n');
      commitPanel(700);
    });
    body.append(area);
    return;
  }
  if (curatedPanel(range.kind, model, body, range)) return;
  if (schema && schema.args) {
    const arg = { value: model.args || '' };
    const field = inputFor(arg, 't', (delay) => {
      model.args = arg.value;
      commitPanel(delay);
    });
    body.append(h('div', { class: 'row' }, h('label', { text: schema.args }), field, h('span')));
  }
  genericEditor(body, model, schema, new Set(), true);
}

function genericEditor(container, model, schema, exclude, withBody) {
  const keys = schema ? schema.keys : {};
  model.rows.forEach((row, i) => {
    if (row.key && exclude.has(row.key)) return;
    const spec = row.raw !== undefined ? 't' : keys[row.key] || 't';
    const proxy =
      row.raw !== undefined
        ? {
            get value() {
              return row.raw;
            },
            set value(text) {
              row.raw = text;
            },
          }
        : row;
    container.append(
      h(
        'div',
        { class: 'row' },
        h('label', { text: row.raw !== undefined ? 'Note' : prettyKey(row.key), title: row.key || '' }),
        inputFor(proxy, spec, commitPanel),
        h('button', {
          class: 'mini',
          html: icon('close', 13),
          title: 'Remove',
          onclick: () => {
            model.rows.splice(i, 1);
            commitPanel(200);
            renderPanel();
          },
        }),
      ),
    );
  });
  const used = new Set(model.rows.map((row) => row.key));
  const repeat = new Set(schema ? schema.repeat || [] : []);
  const choices = Object.keys(keys).filter((key) => (repeat.has(key) || !used.has(key)) && !exclude.has(key));
  const hasTable = withBody && schema && schema.layers && !model.body.length;
  if (choices.length || hasTable) {
    const entries = choices.map((key) => ({ value: key, label: prettyKey(key) }));
    if (hasTable) entries.push({ value: '__table', label: 'Table data' });
    const pick = dropdown({
      choices: entries,
      value: '',
      label: 'Add option',
      keep: true,
      className: 'add',
      leading: icon('plus', 15),
      onPick: (key) => {
        if (model.kind === 'pipetable') promote(model);
        if (key === '__table') model.body = ['| Name | Value |', '|---|---|', '| A | 1 |'];
        else {
          const spec = keys[key];
          const value = spec === 'y' ? 'yes' : Array.isArray(spec) ? spec.find((choice) => choice) || '' : '';
          model.rows.push({ key, value });
        }
        commitPanel(200);
        renderPanel();
        const inputs = $('#panel').querySelectorAll('.row input[type=text]');
        if (inputs.length) inputs[inputs.length - 1].focus();
      },
    });
    container.append(pick);
  }
  if (withBody && ((schema && schema.body) || model.body.length)) {
    const area = h('textarea', { spellcheck: 'false' });
    area.value = model.body.join('\n');
    area.addEventListener('input', () => {
      model.body = area.value.split('\n');
      commitPanel(700);
    });
    container.append(h('div', { class: 'body-field' }, h('label', { text: (schema && schema.body) || 'Data' }), area));
  }
}

const SETTING_FIELDS = [
  { key: 'title', label: 'Title', spec: 't' },
  { key: 'subject', label: 'Subject', spec: 't' },
  { key: 'font', label: 'Font', spec: 'font' },
  { key: 'font-size', label: 'Font size', spec: ['10', '10.5', '11', '11.5', '12', '13', '14'] },
  { key: 'paper', label: 'Paper', spec: ['A4', 'Letter', 'A5', 'Legal'] },
  { key: 'margins', label: 'Margins', spec: 't' },
  { key: 'accent', label: 'Accent', spec: 'c' },
  { key: 'cover', label: 'Cover', spec: 'y' },
  { key: 'contents', label: 'Contents', spec: 'y' },
  { key: 'embed-project', label: 'Editable PDF', spec: 'y' },
  { group: 'Headings' },
  { key: 'heading-font', label: 'Font', spec: 'font' },
  { key: 'heading-style', label: 'Style', spec: [{ value: '', label: 'Line under' }, { value: 'underline', label: 'Underlined' }, { value: 'plain', label: 'Plain' }, { value: 'accent', label: 'Accent colour' }] },
  { key: 'heading-size', label: 'Size', spec: [{ value: '', label: 'Automatic' }, ...['13', '14', '15', '16', '17', '18', '20', '22', '24'].map((v) => ({ value: v, label: `${v} pt` }))] },
  { key: 'heading-color', label: 'Colour', spec: 'c' },
  { key: 'heading-align', label: 'Align', spec: [{ value: '', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }] },
  { key: 'heading-case', label: 'Capitals', spec: [{ value: '', label: 'Normal' }, { value: 'upper', label: 'ALL CAPS' }] },
  { key: 'heading-numbers', label: 'Numbers', spec: 'y' },
  { key: 'section-breaks', label: 'New page each', spec: 'y' },
  { group: 'Contents' },
  { key: 'contents', label: 'Show', spec: 'y' },
  { key: 'contents-title', label: 'Title', spec: 't' },
  { key: 'contents-depth', label: 'Depth', spec: [{ value: '', label: 'Sections + sub-sections' }, { value: '1', label: 'Sections only' }] },
  { key: 'contents-numbers', label: 'Numbers', spec: 'y' },
  { key: 'contents-dots', label: 'Dot leaders', spec: 'y' },
  { key: 'list-of-figures', label: 'List of figures', spec: 'y', off: true },
  { key: 'list-of-tables', label: 'List of tables', spec: 'y', off: true },
  { group: 'References' },
  { key: 'citations', label: 'Citation style', spec: [{ value: 'apa', label: 'APA 7' }, { value: 'mla', label: 'MLA 9' }, { value: 'harvard', label: 'Harvard' }, { value: 'chicago', label: 'Chicago' }, { value: 'ieee', label: 'IEEE' }] },
];

function citationTitle(style) {
  return { mla: 'Works Cited', chicago: 'Bibliography' }[String(style || 'apa').toLowerCase()] || 'References';
}

function headerValue(key) {
  if (S.front) {
    const all = lines();
    const pattern = new RegExp(`^${key}\\s*:\\s*(.*)$`, 'i');
    for (let i = S.front[0] - 1; i <= S.front[1] - 1; i += 1) {
      const match = (all[i] || '').match(pattern);
      if (match) return match[1].trim();
    }
  }
  if (key === 'title') return S.title;
  return S.settings[key] || '';
}

function setCitationStyle(value) {
  const before = citationTitle(headerValue('citations'));
  setHeader('citations', value);
  const after = citationTitle(value);
  if (before === after) return;
  const all = lines();
  let changed = false;
  all.forEach((line, index) => {
    const match = line.match(/^#\s+(References|Works Cited|Bibliography)(\s*\{[^{}]*\})?\s*$/);
    if (!match) return;
    all[index] = `# ${after}${match[2] || ''}`;
    changed = true;
  });
  if (!changed) return;
  S.source = all.join('\n');
  schedule(150);
}

function setHeader(key, value) {
  const all = lines();
  let delta = 0;
  if (!S.front) {
    if (value === '') return;
    all.unshift(`${key}: ${value}`, '---', '');
    delta = 3;
    S.front = [1, 2];
  } else {
    const [first, last] = S.front;
    const pattern = new RegExp(`^${key}\\s*:`, 'i');
    let at = -1;
    for (let i = first - 1; i <= last - 1; i += 1) {
      if (pattern.test(all[i])) {
        at = i;
        break;
      }
    }
    if (at >= 0 && value === '') {
      all.splice(at, 1);
      delta = -1;
    } else if (at >= 0) all[at] = `${key}: ${value}`;
    else if (value !== '') {
      const ends = all[last - 1].trim() === '---';
      all.splice(ends ? last - 1 : last, 0, `${key}: ${value}`);
      delta = 1;
    }
    S.front = [first, last + delta];
  }
  S.source = all.join('\n');
  if (delta) S.ranges.forEach((range) => {
    range.start += delta;
    range.end += delta;
  });
  lockHits();
  schedule(500);
}

function pdfFolderRow(body) {
  const label = h('span', { class: 'folder-name' });
  const pick = h('button', { type: 'button', class: 'pill ghost small folder-pick', html: icon('folder', 15) }, label);
  const clear = h('button', { type: 'button', class: 'round', title: 'Ask each time', html: icon('close', 14) });
  const paint = (folder) => {
    label.textContent = folder ? folder.split(/[\\/]/).filter(Boolean).pop() : 'Ask each time';
    pick.title = folder || 'Choose where your PDFs go';
    clear.hidden = !folder;
  };
  pick.addEventListener('click', async () => {
    const native = nativeApi();
    if (!native || !native.choose_folder) {
      toast('Choosing a folder works in the desktop app', true);
      return;
    }
    const folder = await native.choose_folder();
    if (!folder) return;
    paint((await api('/api/pdf_folder', { folder })).folder);
  });
  clear.addEventListener('click', async () => paint((await api('/api/pdf_folder', { folder: '' })).folder));
  api('/api/export_target').then((where) => paint(where.folder || '')).catch(() => paint(''));
  body.append(h('div', { class: 'row' }, h('label', { text: 'PDF folder' }), h('div', { class: 'field folder-field' }, pick, clear), h('span')));
}

function openSettings() {
  closeEditor(true);
  S.panel = null;
  S.sel = null;
  S.settingsOpen = true;
  S.coverOpen = false;
  const root = $('#panel');
  root.replaceChildren();
  root.classList.remove('wide');
  reveal(root);
  const body = h('div', { class: 'panel-body' });
  SETTING_FIELDS.forEach((item) => {
    if (item.group) {
      body.append(h('div', { class: 'panel-group', text: item.group }));
      return;
    }
    const current = headerValue(item.key);
    const row = { value: item.spec === 'y' ? (item.off ? (/^(yes|on|true)$/i.test(current) ? 'yes' : 'no') : /^(no|off|false)$/i.test(current) ? 'no' : 'yes') : current };
    let field;
    if (item.spec === 'c') {
      field = h('div', { class: 'field' }, colourButton(/^#[0-9a-f]{6}$/i.test(current) ? current : '', (value) => setHeader(item.key, value), item.key !== 'accent'));
    } else if (item.spec === 'font') {
      field = h('div', { class: 'field' }, fontPicker(current, (value) => setHeader(item.key, value), { empty: item.key === 'font' ? 'Cambria (default)' : 'Same as text' }));
    } else {
      field = inputFor(row, item.spec, () => (item.key === 'citations' ? setCitationStyle(row.value) : setHeader(item.key, row.value)));
    }
    body.append(h('div', { class: 'row' }, h('label', { text: item.label }), field, h('span')));
  });
  pdfFolderRow(body);
  body.append(h('div', { class: 'row' }, h('label', { text: 'Copy' }), h('button', { type: 'button', class: 'pill ghost small', html: `${icon('copy', 15)}<span>Make a copy</span>`, onclick: makeCopy }), h('span')));
  body.append(h('div', { class: 'row' }, h('label', { text: 'Versions' }), h('button', { type: 'button', class: 'pill ghost small', html: `${icon('clock', 15)}<span>Show</span>`, onclick: openVersions }), h('span')));
  body.append(h('div', { class: 'row' }, h('label', { text: 'Keep' }), segmented(
    [{ value: 0, label: 'Off' }, { value: 10, label: '10' }, { value: 30, label: '30' }, { value: 60, label: '60' }],
    keepVersions(),
    (value) => {
      localStorage.setItem('studio.keep', String(value));
      api('/api/save', { source: S.source, keep: value });
    },
  ), h('span')));
  root.append(
    h('div', { class: 'panel-head' }, h('span', { text: 'Settings' }), h('button', { class: 'round', html: icon('close', 16), title: 'Close', onclick: closeSettings })),
    body,
  );
  placeOverlays();
}

async function makeCopy() {
  await settle();
  const state = await api('/api/copy');
  if (state.error) {
    toast(state.error, true);
    return;
  }
  load(state);
  toast('Copy opened');
}

async function openVersions() {
  const root = $('#panel');
  const answer = await api('/api/versions');
  const list = h('div', { class: 'panel-body versions' });
  const days = new Intl.DateTimeFormat([], { dateStyle: 'medium', timeStyle: 'short' });
  answer.versions.forEach((item) => {
    list.append(h('button', {
      type: 'button',
      class: 'version',
      html: `<b>${days.format(new Date(item.time * 1000))}</b><span>${item.words} words</span>`,
      onclick: async () => {
        const data = await api('/api/version', { name: item.name });
        restoreSource(data.source);
        closeSettings();
        toast('Version restored. Press Ctrl+Z to undo.');
      },
    }));
  });
  if (!answer.versions.length) list.append(h('div', { class: 'empty', text: 'Nothing yet' }));
  root.replaceChildren(
    h('div', { class: 'panel-head' }, h('button', { class: 'round', html: icon('arrowLeft', 16), title: 'Back', onclick: openSettings }), h('span', { text: 'Versions' }), h('button', { class: 'round', html: icon('close', 16), title: 'Close', onclick: closeSettings })),
    list,
  );
}

function restoreSource(text) {
  commitHistory();
  S.source = text;
  commitHistory();
  closeEditor(true);
  closePanel();
  S.sel = null;
  S.ranges = [];
  lockHits();
  placeOverlays();
  document.querySelectorAll('.hit').forEach((node) => node.remove());
  schedule(0);
}

function closeSettings() {
  S.settingsOpen = false;
  S.coverOpen = false;
  conceal($('#panel'));
}

function syncTitle() {
  const input = $('#title');
  if (document.activeElement !== input) input.value = headerValue('title');
}

function undo(step) {
  commitHistory();
  const target = S.index + step;
  if (target < 0 || target >= S.history.length) return;
  S.index = target;
  S.source = S.history[target];
  closeEditor(true);
  closePanel();
  closeSettings();
  S.sel = null;
  S.ranges = [];
  lockHits();
  placeOverlays();
  document.querySelectorAll('.hit').forEach((node) => node.remove());
  schedule(0);
}

async function settle() {
  while (S.dirty || S.building || S.timer) {
    if (!S.building && S.timer) {
      clearTimeout(S.timer);
      S.timer = null;
      run();
    }
    await sleep(120);
  }
}

function headingList() {
  return S.ranges
    .filter((range) => range.kind === 'heading')
    .map((range) => {
      const first = (linesOf(range)[0] || '').match(/^(#{1,3})\s+(.*)$/);
      if (!first) return null;
      const text = first[2].replace(/(?<!\])\s*\{[^{}]*\}\s*$/, '').replace(/\$[^$]*\$/g, '…').replace(/[*_`]/g, '').trim();
      return { range, level: first[1].length, text: text || 'Untitled' };
    })
    .filter(Boolean);
}

function renderOutline() {
  const box = $('#outline');
  const open = localStorage.getItem('studio.outline') === '1' && Boolean(S.name) && !document.documentElement.classList.contains('home');
  box.hidden = !open;
  $('#outlineBtn').classList.toggle('on', open);
  if (!open) return;
  const items = headingList();
  box.replaceChildren(
    h('div', { class: 'outline-head' }, h('span', { text: 'Outline' }), h('button', { class: 'round', html: icon('close', 14), title: 'Close', onclick: toggleOutline })),
    h(
      'div',
      { class: 'outline-list' },
      ...(items.length
        ? items.map((item) => h('button', { type: 'button', class: `ol l${item.level}`, text: item.text, onclick: () => scrollToRange(item.range) }))
        : [h('div', { class: 'empty', text: 'No headings yet' })]),
    ),
  );
}

function toggleOutline() {
  localStorage.setItem('studio.outline', localStorage.getItem('studio.outline') === '1' ? '0' : '1');
  renderOutline();
}

function bindTips() {
  const tip = $('#tip');
  let timer = null;
  let holder = null;
  const hide = () => {
    clearTimeout(timer);
    tip.hidden = true;
    holder = null;
  };
  document.addEventListener('mouseover', (event) => {
    const node = event.target.closest && event.target.closest('[title], [data-tip]');
    if (!node || node === holder) return;
    hide();
    if (node.hasAttribute('title')) {
      node.dataset.tip = node.getAttribute('title');
      node.removeAttribute('title');
    }
    if (!node.dataset.tip) return;
    holder = node;
    timer = setTimeout(() => {
      tip.textContent = node.dataset.tip;
      tip.hidden = false;
      const rect = node.getBoundingClientRect();
      const k = UI.size;
      const width = tip.offsetWidth * k;
      const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
      tip.style.left = `${left / k}px`;
      tip.style.top = `${(rect.bottom + 10) / k}px`;
    }, 380);
  });
  document.addEventListener('mouseout', (event) => {
    if (holder && !holder.contains(event.relatedTarget)) hide();
  });
  document.addEventListener('mousedown', hide);
  document.addEventListener('scroll', hide, true);
}

function nativeApi() {
  return window.pywebview && window.pywebview.api && window.pywebview.api.minimize ? window.pywebview.api : null;
}

function setWindowMode(mode) {
  S.winMode = mode;
  document.documentElement.dataset.win = mode;
  const button = $('#wMax');
  if (button) {
    button.innerHTML = icon(mode === 'normal' ? 'shapeSquare' : 'copy', 14);
    button.title = mode === 'normal' ? 'Maximise' : 'Restore';
  }
}

function bindNative() {
  const api = nativeApi();
  if (!api || S.nativeBound) return;
  S.nativeBound = true;
  document.documentElement.classList.add('native');
  $('#winctl').hidden = false;
  $('#edges').hidden = false;
  $('#wMin').innerHTML = icon('minus', 14);
  $('#wClose').innerHTML = icon('close', 14);
  setWindowMode('normal');
  $('#wMin').onclick = () => api.minimize();
  $('#wMax').onclick = async () => setWindowMode(await api.maximize_toggle());
  $('#wClose').onclick = async () => {
    await saveNow();
    api.close();
  };
  const bar = $('#bar');
  const plain = (event) => !event.target.closest('button, input, select, a, .pill, #winctl');
  let lastDown = 0;
  bar.addEventListener('mousedown', async (event) => {
    if (event.button !== 0 || !plain(event)) return;
    const now = Date.now();
    if (now - lastDown < 420) {
      lastDown = 0;
      setWindowMode(await api.maximize_toggle());
      return;
    }
    lastDown = now;
    api.start_drag();
  });
  setInterval(async () => {
    const mode = await api.state();
    if (mode !== S.winMode) setWindowMode(mode);
  }, 350);
  $('#edges').addEventListener('mousedown', (event) => {
    const edge = event.target.dataset && event.target.dataset.edge;
    if (edge && event.button === 0) api.start_resize(edge);
  });
  document.addEventListener('keydown', async (event) => {
    if (event.key === 'F11') {
      event.preventDefault();
      setWindowMode(await api.fullscreen_toggle());
    }
  });
}

async function goHome() {
  if (!S.name) return;
  closeEditor(true);
  closePanel();
  closeSettings();
  await settle();
  const state = await api('/api/close');
  S.name = '';
  S.sel = null;
  S.source = '';
  S.pages = [];
  S.ranges = [];
  $('#pages').replaceChildren();
  const start = $('#start');
  start.classList.remove('entering');
  void start.offsetWidth;
  start.classList.add('entering');
  showStart(state);
}

async function exportPdf() {
  if (S.busyExport) return;
  const base = String(S.title || S.name || 'Essay').replace(/\.txt$/i, '').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Essay';
  let handle = null;
  let target = null;
  const native = nativeApi();
  if (native && native.choose_save) {
    const where = await api('/api/export_target').catch(() => ({}));
    const last = String(where.path || '');
    const parts = last.split(/[\\/]/);
    const lastName = parts.pop();
    target = last ? await native.choose_save(lastName, parts.join('\\')) : await native.choose_save(`${base}.pdf`, where.folder || '');
    if (!target) return;
  } else if (window.showSaveFilePicker) {
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: `${base}.pdf`,
        types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
      });
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      handle = null;
    }
  }
  S.busyExport = true;
  setStatus('busy');
  await settle();
  const answer = await api('/api/export');
  S.busyExport = false;
  setStatus('ok');
  if (answer.error) {
    toast(answer.error, true);
    return;
  }
  const url = `/export/${encodeURIComponent(answer.name)}`;
  if (target) {
    const copied = await api('/api/copy_export', { name: answer.name, path: target });
    if (copied.error) toast(copied.error, true);
    else toast(`Saved ${String(target).split(/[\\/]/).pop()}`);
    return;
  }
  if (handle) {
    const blob = await (await fetch(url)).blob();
    const writer = await handle.createWritable();
    await writer.write(blob);
    await writer.close();
    toast(`Saved ${handle.name}`);
    return;
  }
  const link = h('a', { href: url, download: answer.name });
  document.body.append(link);
  link.click();
  link.remove();
  toast(`Exported ${answer.name}`);
}

function openIssues() {
  const list = $('#issueList');
  if (!list.hidden && !list.classList.contains('leaving')) {
    conceal(list);
    return;
  }
  list.replaceChildren(
    ...S.issues.map((item) =>
      h(
        'button',
        {
          onclick: () => {
            list.hidden = true;
            const range = item.line ? S.ranges.find((r) => item.line >= r.start && item.line <= r.end) : null;
            if (range && firstSpan(range)) {
              scrollToRange(range);
              select(range);
            } else if (range) {
              S.sel = range;
              openPanel(range);
            }
          },
        },
        h('span', { class: `dot ${item.level === 'error' ? 'error' : ''}` }),
        h('span', { class: 'line', text: item.line ? `L${item.line}` : '' }),
        h('span', { text: item.text }),
      ),
    ),
  );
  reveal(list);
}

function buildPalette() {
  const palette = $('#palette');
  const base = ['Text', 'Media', 'Data', 'Science', 'Diagrams'];
  const extra = [...new Set(TEMPLATES.map((template) => template.group))].filter((name) => ![...base, 'Layout'].includes(name));
  const groups = [...base, ...extra, 'Layout'];
  const search = h('input', { type: 'text', class: 'palette-search', spellcheck: 'false', placeholder: 'Search blocks' });
  search.addEventListener('input', () => {
    closeHelpCard();
    const term = search.value.trim().toLowerCase();
    palette.querySelectorAll('.palette-grid button').forEach((tile) => {
      tile.hidden = term !== '' && !templateMatches(tile.template, term);
    });
    palette.querySelectorAll('.palette-grid').forEach((grid) => {
      const empty = ![...grid.children].some((tile) => !tile.hidden);
      grid.hidden = empty;
      grid.previousElementSibling.hidden = empty;
    });
  });
  const help = h('button', { type: 'button', class: 'palette-help', title: 'What each block does', html: '<b>?</b><span>Help</span>' });
  help.addEventListener('click', () => {
    palette.classList.toggle('helping');
    help.classList.toggle('on', palette.classList.contains('helping'));
    closeHelpCard();
  });
  palette.append(h('div', { class: 'palette-head' }, search, help));
  new MutationObserver(() => {
    if (!palette.hidden || !palette.classList.contains('helping')) return;
    palette.classList.remove('helping');
    help.classList.remove('on');
    closeHelpCard();
  }).observe(palette, { attributes: true, attributeFilter: ['hidden'] });
  const tints = ['#fbbc04', '#ea4335', '#4285f4', '#34a853', '#a142f4', '#24c1e0', '#fa7b17', '#5856d6', '#f538a0', '#00a9a5', '#ff9500', '#af52de'];
  groups.forEach((name, groupIndex) => {
    const items = TEMPLATES.filter((template) => template.group === name);
    if (!items.length) return;
    palette.append(h('div', { class: 'palette-group', text: name }));
    const grid = h('div', { class: 'palette-grid' });
    items.forEach((template, index) => {
      const tile = h('button', {
        html: `${icon(template.icon, 26)}<span>${template.label}</span>`,
        title: template.label,
        style: `--tint:${name === 'Layout' ? '#d9dee6' : tints[groupIndex % tints.length]};--i:${Math.min(index, 14)}`,
        onclick: () => (palette.classList.contains('helping') ? openHelpCard(tile, template) : insertTemplate(template)),
      });
      tile.template = template;
      grid.append(tile);
    });
    palette.append(grid);
  });
}

function openHelpView(template, what, how) {
  const close = () => {
    view.remove();
    document.removeEventListener('keydown', keys, true);
  };
  const keys = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };
  const view = h(
    'div',
    { class: 'help-view' },
    h(
      'div',
      { class: 'help-view-card' },
      h('div', { class: 'help-view-sample' }, h('img', { src: `previews/${template.id}.webp`, alt: '', draggable: 'false' })),
      h(
        'div',
        { class: 'help-view-side' },
        h('div', { class: 'help-title', html: `${icon(template.icon, 24)}<span>${template.label}</span>` }),
        h('div', { class: 'help-tag', text: 'What it is' }),
        h('p', { class: 'help-what', text: what }),
        how ? h('div', { class: 'help-tag', text: 'How to use it' }) : null,
        how ? h('p', { class: 'help-how', text: how }) : null,
        h(
          'div',
          { class: 'help-actions' },
          h('button', {
            type: 'button',
            class: 'pill solid small',
            html: `${icon('plus', 15)}<span>Insert</span>`,
            onclick: () => {
              close();
              insertTemplate(template);
            },
          }),
          moreHelpButton(template.id, close),
          h('button', { type: 'button', class: 'pill ghost small', text: 'Close', onclick: close }),
        ),
      ),
    ),
  );
  view.addEventListener('mousedown', (event) => {
    event.stopPropagation();
    if (event.target === view) close();
  });
  document.addEventListener('keydown', keys, true);
  document.body.append(view);
}

function closeHelpCard() {
  const card = $('#palette .help-card');
  if (card) card.remove();
  document.querySelectorAll('#palette .palette-grid button.asked').forEach((tile) => tile.classList.remove('asked'));
}

function openHelpCard(tile, template) {
  const palette = $('#palette');
  const again = tile.classList.contains('asked');
  closeHelpCard();
  if (again) return;
  const [what, how] = HELP[template.id] || HELP[template.kind] || [template.label, ''];
  const sample = h('div', { class: 'help-sample' }, h('img', { src: `previews/${template.id}.webp`, alt: '', draggable: 'false' }));
  const body = h(
    'div',
    { class: 'help-body' },
    sample,
    h('div', {}, h('div', { class: 'help-tag', text: 'What it is' }), h('p', { class: 'help-what', text: what }), how ? h('div', { class: 'help-tag', text: 'How to use it' }) : null, how ? h('p', { class: 'help-how', text: how }) : null),
  );
  sample.title = 'See it bigger';
  sample.addEventListener('click', () => openHelpView(template, what, how));
  sample.firstChild.addEventListener('error', () => {
    sample.remove();
    body.classList.add('plain');
  });
  const card = h(
    'div',
    { class: 'help-card' },
    h('div', { class: 'help-title', html: `${icon(template.icon, 22)}<span>${template.label}</span>` }),
    body,
    h(
      'div',
      { class: 'help-actions' },
      h('button', { type: 'button', class: 'pill solid small', html: `${icon('plus', 15)}<span>Insert</span>`, onclick: () => insertTemplate(template) }),
      moreHelpButton(template.id),
      h('button', { type: 'button', class: 'pill ghost small', text: 'Close', onclick: closeHelpCard }),
    ),
  );
  tile.classList.add('asked');
  tile.parentNode.after(card);
  card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  if (palette.contains(card)) card.style.setProperty('--arrow', `${tile.offsetLeft + tile.offsetWidth / 2 - card.offsetLeft}px`);
}

const PX = 96 / 72;
let pinch = null;

function pinchWheel(event) {
  const pages = $('#pages');
  if (!S.pages.length || !pages.children.length) return;
  if (!pinch) {
    clearTimeout(setZoom.timer);
    const box = pages.getBoundingClientRect();
    const sheets = [...pages.children];
    const div = sheets.find((node) => {
      const rect = node.getBoundingClientRect();
      return event.clientY >= rect.top - 22 && event.clientY <= rect.bottom + 22;
    }) || sheets[0];
    const rect = div.getBoundingClientRect();
    pinch = {
      base: S.scale,
      scale: S.scale,
      index: sheets.indexOf(div),
      fx: (event.clientX - rect.left) / rect.width,
      fy: (event.clientY - rect.top) / rect.height,
      cx: event.clientX,
      cy: event.clientY,
      timer: 0,
    };
    pages.style.transition = 'none';
    pages.style.willChange = 'transform';
    pages.style.transformOrigin = `${event.clientX - box.left}px ${event.clientY - box.top}px`;
  }
  const unit = event.deltaMode === 1 ? 0.04 : event.deltaMode === 2 ? 0.5 : 0.0016;
  const step = Math.max(-0.35, Math.min(0.35, -event.deltaY * unit));
  pinch.scale = Math.max(0.25 * PX, Math.min(4 * PX, pinch.scale * Math.exp(step)));
  pages.style.transform = `scale(${pinch.scale / pinch.base})`;
  if (zoomPick) zoomPick.setLabel(`${Math.round((pinch.scale / PX) * 100)}%`);
  clearTimeout(pinch.timer);
  pinch.timer = setTimeout(endPinch, 160);
}

function endPinch() {
  if (!pinch) return;
  const { scale, index, fx, fy, cx, cy } = pinch;
  pinch = null;
  const scroll = $('#scroll');
  const pages = $('#pages');
  pages.style.transform = '';
  pages.style.transformOrigin = '';
  pages.style.willChange = '';
  S.zoom = scale;
  layout();
  const div = pages.children[index];
  if (div) {
    const rect = div.getBoundingClientRect();
    scroll.scrollLeft += rect.left + fx * rect.width - cx;
    scroll.scrollTop += rect.top + fy * rect.height - cy;
  }
  void pages.offsetWidth;
  pages.style.transition = '';
  clearTimeout(setZoom.timer);
  setZoom.timer = setTimeout(sharpen, 220);
}

function zoomStep(direction) {
  const now = (S.scale / (96 / 72)) * 100;
  const next = direction > 0 ? ZOOM_STEPS.find((v) => v > now + 0.5) : [...ZOOM_STEPS].reverse().find((v) => v < now - 0.5);
  if (next) setZoom((next / 100) * (96 / 72));
}

function keepVersions() {
  const value = Number(localStorage.getItem('studio.keep'));
  return localStorage.getItem('studio.keep') === null || !Number.isFinite(value) ? 30 : value;
}

function wantedDpi() {
  const scale = S.scale || 96 / 72;
  const pixels = scale * (window.devicePixelRatio || 1) * 72;
  return Math.max(144, Math.min(300, Math.ceil(pixels / 24) * 24));
}

async function sharpen() {
  const dpi = wantedDpi();
  if (!S.pages.length || S.building || (S.dpi || 144) >= dpi || S.sharpening === dpi) return;
  S.sharpening = dpi;
  try {
    const answer = await api('/api/sharpen', { dpi });
    if (S.sharpening !== dpi || !answer.pages || answer.pages.length !== S.pages.length || S.dirty || S.building) return;
    await Promise.all(answer.pages.map((page) => loadImage(page.url)));
    if (S.dirty || S.building || answer.pages.length !== S.pages.length) return;
    S.pages = S.pages.map((page, index) => ({ ...page, url: answer.pages[index].url }));
    S.dpi = answer.dpi;
    [...$('#pages').children].forEach((div, index) => {
      const image = div.firstChild;
      if (image && S.pages[index] && image.getAttribute('src') !== S.pages[index].url) image.src = S.pages[index].url;
    });
  } finally {
    if (S.sharpening === dpi) S.sharpening = 0;
  }
}

function setZoom(value) {
  const scroll = $('#scroll');
  const pages = $('#pages');
  const before = S.scale || 1;
  const anchor = (scroll.scrollTop + scroll.clientHeight / 2) / before;
  S.zoom = value;
  layout();
  const after = S.scale;
  scroll.scrollTop = anchor * after - scroll.clientHeight / 2;
  if (Math.abs(after - before) < 0.001 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const originY = scroll.scrollTop + scroll.clientHeight / 2 - pages.offsetTop;
  pages.style.transition = 'none';
  pages.style.transformOrigin = `50% ${originY}px`;
  pages.style.transform = `scale(${before / after})`;
  void pages.offsetWidth;
  pages.style.transition = 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)';
  pages.style.transform = '';
  clearTimeout(setZoom.timer);
  setZoom.timer = setTimeout(() => {
    pages.style.transition = '';
    pages.style.transformOrigin = '';
    sharpen();
  }, 360);
}

async function dropFile(event) {
  event.preventDefault();
  const file = [...event.dataTransfer.files].find((item) => item.type.startsWith('image/'));
  if (!file) return;
  const hit = event.target.closest ? event.target.closest('.hit') : null;
  if (hit) {
    const range = S.ranges.find((item) => String(item.id) === hit.dataset.id);
    if (range) S.sel = range;
  }
  const path = await upload(file);
  if (path) insertLines([':::figure', `src: ${path}`, 'caption: Figure caption.', 'width: 70%', ':::'], 'figure');
}

function bindTilt(box, selector) {
  if (!box || box.dataset.tilt) return;
  box.dataset.tilt = '1';
  box.addEventListener('pointermove', (event) => {
    const card = event.target.closest(selector);
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    card.style.setProperty('--ry', `${((x - 0.5) * 10).toFixed(2)}deg`);
    card.style.setProperty('--rx', `${((0.5 - y) * 8).toFixed(2)}deg`);
    card.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    card.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
  });
  box.addEventListener('pointerout', (event) => {
    const card = event.target.closest(selector);
    if (!card || card.contains(event.relatedTarget)) return;
    card.style.setProperty('--ry', '0deg');
    card.style.setProperty('--rx', '0deg');
  });
}

function essayInfo(state, path) {
  return (state.details && state.details[path]) || (S.library || []).find((item) => item.path === path) || {};
}

function timeAgo(seconds) {
  const gap = Math.max(0, Date.now() / 1000 - seconds);
  if (gap < 60) return 'just now';
  if (gap < 3600) return `${Math.floor(gap / 60)} min ago`;
  if (gap < 86400) return `${Math.floor(gap / 3600)} h ago`;
  if (gap < 86400 * 7) return `${Math.floor(gap / 86400)} d ago`;
  return new Date(seconds * 1000).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function showStart(state) {
  reveal($('#start'));
  document.documentElement.classList.add('home');
  updatePill();
  renderOutline();
  $('#newEssay').innerHTML = `<span class="badge">${icon('newFile', 24)}</span><span>New essay</span>`;
  $('#openEssay').innerHTML = `<span class="badge">${icon('folder', 24)}</span><span>Open essay</span>`;
  const query = (S.recentQuery || '').trim().toLowerCase();
  const everything = (S.showAll || query) && S.library;
  const pool = everything ? S.library.filter((item) => !query || `${item.name} ${item.folder}`.toLowerCase().includes(query)).map((item) => item.path) : state.recent || [];
  const picked = query ? pool.slice(0, 60) : everything ? pool : pool.slice(0, 8);
  const order = localStorage.getItem('studio.recentSort') || 'opened';
  const nameOf = (path) => (path.split(/[\\/]/).pop() || '').toLowerCase();
  const items = order === 'name' ? [...picked].sort((a, b) => nameOf(a).localeCompare(nameOf(b))) : order === 'edited' ? [...picked].sort((a, b) => (essayInfo(state, b).modified || 0) - (essayInfo(state, a).modified || 0)) : picked;
  const listView = localStorage.getItem('studio.recentView') === 'list';
  $('#recent').classList.toggle('as-list', listView);
  const viewButton = $('#recentView');
  viewButton.innerHTML = icon(listView ? 'columns' : 'list', 16);
  viewButton.title = listView ? 'Grid view' : 'List view';
  viewButton.onclick = () => {
    localStorage.setItem('studio.recentView', listView ? 'grid' : 'list');
    showStart(state);
  };
  const sortButton = $('#recentSort');
  sortButton.textContent = { opened: 'Last opened', edited: 'Last edited', name: 'Name' }[order];
  sortButton.onclick = () => showMenu(sortButton, [{ value: 'opened', label: 'Last opened' }, { value: 'edited', label: 'Last edited' }, { value: 'name', label: 'Name' }], order, (value) => {
    localStorage.setItem('studio.recentSort', value);
    showStart(state);
  });
  document.querySelector('#recentBox .recent-title').textContent = S.showAll && !query ? 'All essays' : query ? 'Search' : 'Recent';
  S.shownRecent = items;
  $('#recentBox').hidden = !items.length && !query && !(state.recent || []).length;
  const search = $('#recentSearch');
  search.oninput = async () => {
    S.recentQuery = search.value;
    if (search.value.trim() && !S.library) {
      const answer = await api('/api/library');
      S.library = answer.items || [];
    }
    showStart(state);
  };
  search.onkeydown = (event) => {
    if (event.key === 'Escape') {
      search.value = '';
      S.recentQuery = '';
      showStart(state);
    }
  };
  if (search.value !== (S.recentQuery || '')) search.value = S.recentQuery || '';
  bindTilt($('#recent'), 'button.sheet');
  bindTilt($('#start .tiles'), '.tile');
  $('#recent').replaceChildren(
    ...(query && !items.length ? [h('div', { class: 'recent-empty', text: 'No essays match' })] : []),
    ...(!query && (S.showAll || (state.recent || []).length >= 8) ? [h('button', {
      type: 'button',
      class: 'sheet-more-all',
      html: `${icon(S.showAll ? 'up' : 'folder', 22)}<span>${S.showAll ? 'Show less' : 'Show all essays'}</span>`,
      onclick: async () => {
        if (!S.showAll && !S.library) S.library = (await api('/api/library')).items || [];
        S.showAll = !S.showAll;
        showStart(state);
      },
    })] : []),
    ...items.map((path, index) => {
      const parts = path.split(/[\\/]/);
      const name = (parts.pop() || '').replace(/\.(txt|pdf)$/i, '');
      const folder = parts.pop() || '';
      const turn = ((name.length * 37 + index * 53) % 9) / 2 - 2;
      const info = essayInfo(state, path);
      const card = h('button', {
        class: `sheet${info.thumb ? ' has-thumb' : ''}${S.recentPick && S.recentPick.has(path) ? ' picked' : ''}`,
        'data-path': path,
        style: `--r:${turn.toFixed(1)}deg;--i:${index}`,
        html: info.thumb
          ? `<span class="sheet-thumb"><img alt="" draggable="false" loading="lazy" src="${info.thumb}"></span><span class="sheet-label"><span class="sheet-title"></span><span class="sheet-where"></span></span><span class="sheet-check">${icon('check', 16)}</span>`
          : `<span class="sheet-title"></span><span class="sheet-lines"></span><span class="sheet-where"></span><span class="sheet-check">${icon('check', 16)}</span>`,
        onclick: (event) => {
          if (S.recentPick || event.ctrlKey || event.shiftKey || event.metaKey) {
            if (!S.recentPick) S.recentPick = new Set();
            if (S.recentPick.has(path)) S.recentPick.delete(path);
            else S.recentPick.add(path);
            card.classList.toggle('picked', S.recentPick.has(path));
            paintRecentBar(state);
            return;
          }
          openPath(path);
        },
      });
      card.querySelector('.sheet-title').textContent = name;
      card.querySelector('.sheet-where').textContent = info.modified ? `${folder} · ${timeAgo(info.modified)}` : folder;
      const more = h('span', { class: 'sheet-more', role: 'button', title: 'More', html: icon('more', 18) });
      more.addEventListener('click', (event) => {
        event.stopPropagation();
        showMenu(more, [
          { value: 'forget', label: 'Remove from list' },
          { value: 'trash', label: 'Delete file', style: 'color:var(--danger)' },
        ], '', async (value) => {
          card.classList.add('gone');
          await new Promise((resolve) => setTimeout(resolve, 320));
          try {
            const next = await api(value === 'trash' ? '/api/trash' : '/api/forget', { path });
            if (next.error) throw new Error(next.error.replace(/^\w+: /, ''));
            S.library = null;
            toast(value === 'trash' ? 'Moved to the Recycle Bin' : 'Removed from the list');
            showStart(next);
          } catch (error) {
            card.classList.remove('gone');
            toast(error.message || 'Could not do that', true);
          }
        });
      });
      card.append(more);
      return card;
    }),
  );
  $('#recentSelect').onclick = () => {
    S.recentPick = S.recentPick ? null : new Set();
    showStart(state);
  };
  paintRecentBar(state);
}

function paintRecentBar(state) {
  const bar = $('#recentBar');
  const button = $('#recentSelect');
  const items = S.shownRecent || state.recent || [];
  const picking = Boolean(S.recentPick);
  document.querySelector('#recentBox').classList.toggle('picking', picking);
  button.textContent = picking ? 'Done' : 'Select';
  if (!picking) {
    conceal(bar);
    return;
  }
  const count = S.recentPick.size;
  const act = async (route, done) => {
    if (!count) return;
    const paths = [...S.recentPick];
    document.querySelectorAll('#recent button.sheet.picked').forEach((card) => card.classList.add('gone'));
    await new Promise((resolve) => setTimeout(resolve, 320));
    const next = await api(route, { paths });
    S.recentPick = null;
    S.library = null;
    if (next.error) {
      toast(next.error.replace(/^\w+: /, ''), true);
      showStart(state);
      return;
    }
    toast(next.failed ? `${done}, but ${next.failed} could not be changed` : done);
    showStart(next);
  };
  bar.replaceChildren(
    h('span', { class: 'recent-count', text: count ? `${count} selected` : 'Click essays to select them' }),
    h('button', { type: 'button', class: 'pill ghost small', text: count === items.length ? 'Select none' : 'Select all', onclick: () => {
      S.recentPick = count === items.length ? new Set() : new Set(items);
      showStart(state);
    } }),
    h('button', { type: 'button', class: 'pill ghost small', text: 'Remove from list', disabled: !count, onclick: () => act('/api/forget', count === 1 ? 'Removed from the list' : `${count} removed from the list`) }),
    h('button', { type: 'button', class: 'pill small danger-pill', html: `${icon('trash', 14)}<span>Delete</span>`, disabled: !count, onclick: () => act('/api/trash', count === 1 ? 'Moved to the Recycle Bin' : `${count} moved to the Recycle Bin`) }),
  );
  reveal(bar);
}

async function openPath(path) {
  load(await api('/api/open', { path }));
}

function load(state) {
  if (!state.open) {
    showStart(state);
    return;
  }
  if (state.notice) setTimeout(() => toast(state.notice), 900);
  conceal($('#start'));
  document.documentElement.classList.remove('home');
  S.source = state.source;
  S.name = state.name;
  S.history = [state.source];
  S.index = 0;
  savedSource = state.source;
  S.ranges = [];
  S.sel = null;
  closeEditor(true);
  closePanel();
  closeSettings();
  $('#pages').replaceChildren();
  S.pages = [];
  lockHits();
  schedule(0);
}

function bind() {
  $('#export').innerHTML = `${icon('export', 16)}<span>Export PDF</span>`;
  $('#insertBtn').innerHTML = `${icon('plus', 16)}<span>Insert</span>`;
  $('#settingsBtn').innerHTML = `${icon('gear', 17)}<span>Settings</span>`;
  $('#themeBtn').innerHTML = `${icon('palette', 17)}<span>Theme</span>`;
  $('#coverBtn').innerHTML = `${icon('cover', 17)}<span>Cover</span>`;
  $('#zoomOut').innerHTML = icon('minus', 16);
  $('#zoomIn').innerHTML = icon('plus', 16);
  $('#export').onclick = exportPdf;
  $('#issues').onclick = openIssues;
  $('#settingsBtn').onclick = () => (S.settingsOpen && !S.coverOpen ? closeSettings() : openSettings());
  $('#coverBtn').onclick = () => (S.settingsOpen && S.coverOpen ? closeSettings() : openCover());
  $('#insertBtn').onclick = () => {
    cancelTarget();
    toggleShown($('#palette'));
    conceal($('#issueList'));
  };
  const appearance = buildAppearance();
  $('#themeBtn').onclick = () => {
    toggleShown(appearance);
    conceal($('#issueList'));
  };
  $('#zoomOut').onclick = () => zoomStep(-1);
  $('#zoomIn').onclick = () => zoomStep(1);
  zoomPick = dropdown({
    choices: [{ value: 'fit', label: 'Fit width' }, { value: 'page', label: 'Fit page' }, ...ZOOM_STEPS.map((v) => ({ value: String(v), label: `${v}%` }))],
    value: 'fit',
    label: '100%',
    keep: true,
    className: 'zoom',
    up: true,
    onPick: (value) => setZoom(value === 'fit' || value === 'page' ? value : (Number(value) / 100) * (96 / 72)),
  });
  $('#zoomHolder').append(zoomPick);
  $('#homeBtn').onclick = goHome;
  $('#pageBtn').innerHTML = icon('newFile', 18);
  $('#pageBtn').onclick = () => addPageAfter(pageInView());
  $('#outlineBtn').innerHTML = icon('list', 18);
  $('#outlineBtn').onclick = toggleOutline;
  bindTips();
  $('#homeBtn').querySelector('.home-arrow').innerHTML = icon('arrowLeft', 18);
  $('#newEssay').onclick = async () => load(await api('/api/new'));
  $('#openEssay').onclick = async () => {
    const answer = await api('/api/pick');
    if (!answer.headless) {
      load(answer);
      return;
    }
    const file = await pickFile('.txt,.docx,.pdf');
    if (!file) return;
    load(await api('/api/import', { name: file.name, data: await toBase64(file) }));
  };
  const title = $('#title');
  const commit = () => {
    if (title.value.trim() !== headerValue('title')) setHeader('title', title.value.trim());
  };
  title.addEventListener('change', commit);
  title.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') title.blur();
  });
  bindPlace();
  const scroll = $('#scroll');
  scroll.addEventListener('dragover', (event) => event.preventDefault());
  scroll.addEventListener('drop', dropFile);
  scroll.addEventListener(
    'wheel',
    (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      pinchWheel(event);
    },
    { passive: false },
  );
  scroll.addEventListener('mousedown', (event) => {
    const blank = event.target === scroll || event.target.id === 'pages' || event.target.classList.contains('page') || (event.target.tagName === 'IMG' && event.target.parentNode && event.target.parentNode.classList.contains('page'));
    if (event.target === scroll || event.target.id === 'pages') {
      conceal($('#palette'));
      conceal($('#issueList'));
    }
    const sheet = event.target.closest && event.target.closest('#pages > .page');
    const onSheet = sheet && (event.target === sheet || (event.target.tagName === 'IMG' && event.target.parentNode === sheet));
    let margin = false;
    if (onSheet && !S.settingsOpen && !(typeof CV !== 'undefined' && CV.mode === 'page')) {
      const index = [...$('#pages').children].indexOf(sheet);
      const rect = sheet.getBoundingClientRect();
      const x = (event.clientX - rect.left) / S.scale;
      const size = S.pages[index];
      margin = Boolean(size && (x < marginPt() * 0.8 || x > size.w - marginPt() * 0.8));
    }
    if (blank && !margin && !(typeof CV !== 'undefined' && CV.mode === 'page')) startMarquee(event);
    if (blank && !S.settingsOpen && (S.sel || S.edit || S.panel)) {
      deselect();
      return;
    }
    if (margin) {
      const index = [...$('#pages').children].indexOf(sheet);
      const how = event.shiftKey ? 'range' : event.ctrlKey || event.metaKey ? 'toggle' : '';
      if (!how && S.pagePicks && S.pagePicks.size === 1 && S.pagePicks.has(index)) pickPage(null);
      else pickPage(index, how);
      return;
    }
    unpickPage();
  });
  document.addEventListener('mousedown', (event) => {
    if (!event.target.closest('#palette, #insertBtn')) {
      conceal($('#palette'));
      cancelTarget();
    }
    if (!event.target.closest('#issueList, #issues')) conceal($('#issueList'));
  });
  window.addEventListener('resize', () => {
    if ((S.zoom === 'fit' || S.zoom === 'page') && S.pages.length) layout();
  });
  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);
    const inEditor = Boolean(S.edit && S.edit.ta && S.edit.ta.isContentEditable && S.edit.ta.contains(event.target));
    const redoing = key === 'y' || (key === 'z' && event.shiftKey);
    if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(key) && inEditor && ((redoing ? S.edit.redos : S.edit.typed) || 0) > 0) {
      return;
    } else if ((event.ctrlKey || event.metaKey) && key === 'z') {
      event.preventDefault();
      undo(event.shiftKey ? 1 : -1);
    } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && ['Period', 'Comma'].includes(event.code) && !typing && !S.edit && S.multi && S.multi.size) {
      event.preventDefault();
      const list = SIZE_LIST.map(Number);
      const up = event.code === 'Period';
      styleBlocks('size', (current) => String((up ? list.find((size) => size > current + 0.01) : [...list].reverse().find((size) => size < current - 0.01)) || current));
    } else if (['Delete', 'Backspace'].includes(event.key) && !typing && !S.edit && S.multi && S.multi.size) {
      event.preventDefault();
      deleteBlocks();
    } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'Enter') {
      event.preventDefault();
      addPageAfter(pageInView());
    } else if ((event.ctrlKey || event.metaKey) && key === 'y') {
      event.preventDefault();
      undo(1);
    } else if (event.key === 'Escape') {
      if (openMenu) closeMenu();
      else if (!$('#appearance').hidden) conceal($('#appearance'));
      else if (!$('#palette').hidden || !$('#issueList').hidden) {
        cancelTarget();
        conceal($('#palette'));
        conceal($('#issueList'));
      } else if (S.edit) closeEditor();
      else if (S.multi && S.multi.size) clearMulti();
      else deselect();
    } else if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key) && S.sel && !typing) {
      event.preventDefault();
      move(event.key === 'ArrowUp' ? -1 : 1);
    } else if (['Delete', 'Backspace'].includes(event.key) && !typing && !S.edit && pickedPages().length) {
      event.preventDefault();
      dropPickedPage('Delete');
    } else if (event.key === 'Delete' && !typing && S.sel && !TEXT_KINDS.has(S.sel.kind)) {
      remove(S.sel);
    }
  });
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || !['Period', 'Comma'].includes(event.code)) return;
    if (!(target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && target.type === 'text')) || !target.closest('#panel, #pages')) return;
    const { selectionStart: from, selectionEnd: to, value } = target;
    if (from === to) return;
    event.preventDefault();
    event.stopPropagation();
    const picked = value.slice(from, to);
    const styled = picked.match(/^\[([\s\S]*)\]\{([^{}]*)\}$/);
    const inner = styled ? styled[1] : picked;
    const options = styled ? styled[2] : '';
    const found = options.match(/(?:^|\s)size=([\d.]+)/);
    const now = found ? Number(found[1]) : 12;
    const sizes = SIZE_LIST.map(Number);
    const next = (event.code === 'Period' ? sizes.find((size) => size > now) : [...sizes].reverse().find((size) => size < now)) || now;
    const rest = options.replace(/(?:^|\s)size=[\d.]+/, '').trim();
    target.setRangeText(`[${inner}]{${[`size=${next}`, rest].filter(Boolean).join(' ')}}`, from, to, 'select');
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }, true);
  document.addEventListener('beforeinput', (event) => {
    if (!S.edit || !S.edit.ta || !S.edit.ta.contains(event.target)) return;
    if (event.inputType === 'historyUndo') {
      S.edit.typed = Math.max(0, (S.edit.typed || 0) - 1);
      S.edit.redos = (S.edit.redos || 0) + 1;
    } else if (event.inputType === 'historyRedo') {
      S.edit.redos = Math.max(0, (S.edit.redos || 0) - 1);
      S.edit.typed = (S.edit.typed || 0) + 1;
    } else {
      S.edit.typed = (S.edit.typed || 0) + 1;
      S.edit.redos = 0;
    }
  }, true);
  const blockClipboard = (event) => {
    if ((typeof CV !== 'undefined' && CV.mode === 'page') || !clipRanges().length) return false;
    const selection = window.getSelection();
    const collapsed = !selection || selection.isCollapsed;
    if (S.edit) return Boolean(S.edit.rich && !S.edit.cover && S.edit.ta.contains(event.target) && collapsed);
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable;
    return !typing && collapsed;
  };
  const pagePicked = (event) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable;
    return !typing && !S.edit && pickedPages().length > 0;
  };
  const clipPages = (event) => {
    const text = pagesText(pickedPages());
    if (!text) return false;
    S.clip = { text, kind: 'para', page: true };
    event.clipboardData.setData('text/plain', text);
    event.clipboardData.setData(BLOCK_MIME, JSON.stringify(S.clip));
    return true;
  };
  document.addEventListener('copy', (event) => {
    if (pagePicked(event)) {
      event.preventDefault();
      const count = pickedPages().length;
      if (clipPages(event)) toast(count > 1 ? `${count} pages copied` : 'Page copied');
      return;
    }
    if (!blockClipboard(event)) return;
    event.preventDefault();
    const ranges = clipRanges();
    writeBlockClip(event, ranges);
    toast(ranges.length > 1 ? `${ranges.length} blocks copied` : 'Block copied');
  });
  document.addEventListener('cut', (event) => {
    if (pagePicked(event)) {
      event.preventDefault();
      const picked = pickedPages();
      if (picked.length === 1 && picked[0] === 0 && coverIsOn()) {
        unpickPage();
        removePage(0);
        return;
      }
      if (picked.length === 1) {
        if (!confirmHeavy(picked[0], 'Ctrl+X')) return;
        clipPages(event);
        unpickPage();
        animateRemovePage(picked[0], $('#pages').children[picked[0]]);
        return;
      }
      if (!confirmHeavyPages(picked, 'Ctrl+X')) return;
      clipPages(event);
      unpickPage();
      removePages(picked);
      return;
    }
    if (!blockClipboard(event)) return;
    event.preventDefault();
    const ranges = clipRanges();
    writeBlockClip(event, ranges);
    if (S.edit) closeEditor(true);
    commitHistory();
    if (ranges.length > 1) deleteBlocks();
    else remove(ranges[0]);
    commitHistory();
  });
  document.addEventListener('paste', (event) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable;
    if (typing || S.edit || !S.pages.length || (typeof CV !== 'undefined' && CV.mode === 'page')) return;
    const block = readBlockClip(event);
    const picked = pickedPages();
    if (picked.length && !(block && block.page)) S.sel = lastRangeOn(picked[picked.length - 1], true);
    const text = (event.clipboardData.getData('text/plain') || '').replace(/\r/g, '');
    if (!text.trim() && !block) return;
    event.preventDefault();
    if (block && block.page) {
      commitHistory();
      const anchor = picked.length ? lastRangeOn(picked[picked.length - 1], true) : S.sel || S.ranges[S.ranges.length - 1];
      const all = lines();
      const at = anchor ? anchor.end : all.length;
      all.splice(at, 0, '', ':::pagebreak', '', ...block.text.split('\n'));
      unpickPage();
      restoreSource(all.join('\n'));
      return;
    }
    if (block) {
      pasteBlock(block);
      return;
    }
    const styled = event.clipboardData.getData(INLINE_MIME);
    commitHistory();
    if (styled.trim()) insertLines(styled.trim().split('\n'), 'para');
    else insertLines(text.trim().split(/\n\s*\n/).map((part) => part.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).join('\n\n').split('\n'), 'para');
    commitHistory();
  });
  setInterval(() => fetch('/api/ping').catch(() => null), 5000);
}

const BLOCK_MIME = 'application/x-essay-block';

function clipRanges() {
  if (S.multi && S.multi.size) return S.ranges.filter((range) => S.multi.has(range.start));
  return S.sel ? [S.sel] : [];
}

function writeBlockClip(event, ranges) {
  const text = ranges.map((range) => linesOf(range).join('\n')).join('\n\n');
  S.clip = { text, kind: ranges[0].kind };
  event.clipboardData.setData('text/plain', text);
  event.clipboardData.setData(BLOCK_MIME, JSON.stringify(S.clip));
}

function readBlockClip(event) {
  const raw = event.clipboardData.getData(BLOCK_MIME);
  if (raw) {
    try {
      const clip = JSON.parse(raw);
      if (clip && clip.text) return clip;
    } catch (error) {
      return null;
    }
  }
  const text = (event.clipboardData.getData('text/plain') || '').replace(/\r/g, '');
  return S.clip && text === S.clip.text ? S.clip : null;
}

function pasteBlock(clip) {
  commitHistory();
  insertLines(clip.text.split('\n'), clip.kind);
  commitHistory();
}

async function main() {
  window.addEventListener('pagehide', saveOnLeave);
  window.addEventListener('beforeunload', saveOnLeave);
  window.addEventListener('pywebviewready', bindNative);
  if (nativeApi()) bindNative();
  TEMPLATES.forEach((template) => {
    if (ICON_SET[template.id]) template.icon = template.id;
  });
  bind();
  buildPalette();
  loadPlaces();
  const state = await (await fetch('/api/state')).json();
  load(state);
  pickTheme();
}

main();
