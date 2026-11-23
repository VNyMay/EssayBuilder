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
let lastWheel = 0;

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
  await applyResult(result);
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

async function applyResult(result) {
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
  if (S.focusNew && S.sel) {
    S.focusNew = false;
    if (TEXT_KINDS.has(S.sel.kind) || isRichText(S.sel)) openEditor(S.sel, S.focusSelectAll !== false);
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
  S.pages.forEach((page, i) => {
    let div = box.children[i];
    if (!div) {
      div = h('div', { class: 'page' }, h('img', { draggable: 'false' }));
      box.append(div);
    }
    div.style.width = `${page.w * S.scale}px`;
    div.style.height = `${page.h * S.scale}px`;
    const image = div.firstChild;
    if (image.getAttribute('src') !== page.url) image.src = page.url;
    div.querySelectorAll('.hit, .tool, .ins, .grip, .ins-marker, .reflow, .mask, .page-add, .page-del, .page-num, .page-design, .add-cover').forEach((node) => node.remove());
    if (S.arrivePage === i && S.pages.length) {
      S.arrivePage = null;
      div.classList.remove('arrive');
      void div.offsetWidth;
      div.classList.add('arrive');
      setTimeout(() => div.classList.remove('arrive'), 900);
    }
    const coverOn = !/^(no|off|false)$/i.test(S.settings.cover || 'yes');
    if (i === 0 && !coverOn) {
      div.append(h('button', {
        type: 'button',
        class: 'add-cover',
        html: `${icon('plus', 14)}<span>Add cover</span>`,
        onclick: (event) => {
          event.stopPropagation();
          setHeader('cover', 'yes');
          if (!headerValue('cover-style')) setHeader('cover-style', 'classic');
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
    if (pageRanges(i).length || i > 0) {
      div.append(deleteButton(i));
    }
  });
  drawHits();
  drawOverlayViews();
  if (typeof drawInsertPoints === 'function') drawInsertPoints();
  placeOverlays();
  if (typeof cvAfterLayout === 'function') cvAfterLayout();
  if (zoomPick) zoomPick.setLabel(`${Math.round((S.scale / (96 / 72)) * 100)}%`);
}

function drawHits() {
  const box = $('#pages');
  const side = Math.max(0, marginPt() - 10) * S.scale;
  const used = new Set();
  S.ranges.forEach((range) => {
    (S.regions[range.id] || []).forEach((span) => {
      const div = box.children[span.page];
      if (!div) return;
      used.add(span.page);
      const page = S.pages[span.page];
      const blank = range.kind === 'blank';
      const top = (blank ? marginPt() : Math.max(span.y0 - 3, 0)) * S.scale;
      const bottom = (blank ? page.h - marginPt() : Math.min(span.y1 + 3, page.h - marginPt() * 0.55)) * S.scale;
      const hit = h('div', {
        class: `hit${blank ? ' blank' : ''}${S.sel === range ? ' sel' : ''}`,
        'data-id': range.id,
        style: `left:${side}px;right:${side}px;top:${top}px;height:${Math.max(bottom - top, 8)}px`,
        onclick: () => select(range),
      });
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
  if (S.sel === range && (S.edit || S.panel)) return;
  closeEditor();
  closePanel();
  S.settingsOpen = false;
  S.sel = range;
  if (range.kind === 'design' && typeof cvEnterDesign === 'function') return cvEnterDesign(range);
  if (TEXT_KINDS.has(range.kind) || isRichText(range)) openEditor(range);
  else openPanel(range);
  placeOverlays();
}

function deselect() {
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
  if (range.kind === 'heading' && first) {
    const level = first[1].length;
    const points = [20, 14, 12][level - 1] * zoom;
    return { size: points * S.scale, weight: 700, italic: level === 3, height: 1.3 };
  }
  const spacing = parseFloat(S.settings['line-spacing']);
  return { size: size * S.scale, weight: 400, italic: false, height: spacing > 0 ? spacing : 1.8 };
}

function inPlace(range) {
  return (range.kind === 'para' || range.kind === 'blank' || isRichText(range));
}

function positionEditor() {
  if (!S.edit || S.edit.cover || !S.edit.range) return;
  const { range, ta } = S.edit;
  const span = firstSpan(range);
  if (!span) return;
  const div = $('#pages').children[span.page];
  if (ta.parentNode !== div) div.append(ta);
  const style = editorStyle(range);
  const place = inPlace(range) && ta.classList.contains('rich');
  const padX = place ? 0 : 14;
  const left = marginPt() * S.scale - padX;
  const width = (S.pages[span.page].w - 2 * marginPt()) * S.scale + 2 * padX;
  ta.classList.toggle('inplace', place);
  ta.style.left = `${left}px`;
  ta.style.width = `${width}px`;
  const textTop = span.t !== undefined ? span.t : span.y0;
  ta.style.top = `${textTop * S.scale}px`;
  ta.style.fontFamily = docFont();
  ta.style.fontSize = `${style.size}px`;
  ta.style.fontWeight = style.weight;
  ta.style.fontStyle = style.italic ? 'italic' : 'normal';
  ta.style.lineHeight = style.height;
  if (place) {
    const explicit = /^align\s*:/im.test(S.edit.prefix || '');
    if (!explicit) ta.style.textAlign = String(S.settings.justify || 'yes').toLowerCase() === 'no' ? 'left' : 'justify';
    const indent = String(S.settings['paragraph-indent'] || '').trim();
    ta.style.textIndent = indent && !/^(no|none|0)$/i.test(indent) && range.kind === 'para' ? `calc(${parseFloat(indent) || 0} * ${/em$/.test(indent) ? style.size : 1}px)` : '0';
    ta.style.minHeight = `${style.size * style.height}px`;
  } else {
    ta.style.minHeight = `${style.size * style.height * 2}px`;
  }
  fitEditor(ta);
  if (S.edit.base == null) S.edit.base = ta.offsetHeight;
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
}

function clearReflow() {
  document.querySelectorAll('.reflow, .mask').forEach((node) => node.remove());
}

function reflow(div, span, ta) {
  clearReflow();
  const spans = S.regions[S.edit.range.id] || [];
  const page = S.pages[span.page];
  const bottom = (page.h - marginPt()) * S.scale;
  const top = (span.t !== undefined ? span.t : span.y0) * S.scale;
  const delta = ta.offsetHeight - (S.edit.base || ta.offsetHeight);
  if (spans.length !== 1 || bottom <= top) return;
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
  if ((['para', 'heading', 'blank'].includes(range.kind) || isRichText(range)) && typeof openRich === 'function') return openRich(range, selectAll);
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
  const keepPage = Boolean(S.edit.blank);
  S.edit = null;
  clearReflow();
  const empty = !(ta.value !== undefined ? ta.value : ta.textContent).trim();
  ta.remove();
  if (bar) bar.remove();
  if (typeof closeChipPop === 'function') closeChipPop();
  if (empty && !silent && !keepPage) remove(range);
}

function closePanel() {
  S.panel = null;
  if (!S.settingsOpen) conceal($('#panel'));
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
  const after = target ? target.range : S.sel || S.ranges[S.ranges.length - 1] || null;
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

function pageRanges(pageIndex) {
  return S.ranges.filter((range) => {
    const spans = S.regions[range.id] || [];
    return spans.length && spans.every((span) => span.page === pageIndex);
  });
}

function removePage(pageIndex) {
  if (!S.pages.length || S.front && pageIndex === 0 && S.settings.cover === 'yes') return;
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

function deleteButton(pageIndex) {
  const heavy = pageWeight(pageIndex) > 30;
  const button = h('button', {
    type: 'button',
    class: `page-del${heavy ? ' heavy' : ''}`,
    title: heavy ? 'Hold to remove page' : 'Remove page',
    html: `${icon('trash', 15)}${heavy ? '<svg class="hold-ring" viewBox="0 0 34 34"><rect x="1" y="1" width="32" height="32" rx="11" pathLength="100"/></svg>' : ''}`,
  });
  const go = () => {
    const page = button.closest('.page');
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
  };
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
  insertLines(template.lines.slice(), template.kind);
}

function openPanel(range) {
  S.settingsOpen = false;
  S.panel = { range, model: parseBlock(range.kind, linesOf(range)) };
  renderPanel();
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
  { key: 'font', label: 'Font', spec: 't' },
  { key: 'font-size', label: 'Font size', spec: ['10', '10.5', '11', '11.5', '12', '13', '14'] },
  { key: 'paper', label: 'Paper', spec: ['A4', 'Letter', 'A5', 'Legal'] },
  { key: 'margins', label: 'Margins', spec: 't' },
  { key: 'accent', label: 'Accent', spec: 'c' },
  { key: 'cover', label: 'Cover', spec: 'y' },
  { key: 'contents', label: 'Contents', spec: 'y' },
  { key: 'embed-project', label: 'Editable PDF', spec: 'y' },
];

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
    const current = headerValue(item.key);
    const row = { value: item.spec === 'y' ? (/^(no|off|false)$/i.test(current) ? 'no' : 'yes') : current };
    let field;
    if (item.spec === 'c') {
      const color = h('input', { type: 'color' });
      color.value = /^#[0-9a-f]{6}$/i.test(current) ? current : '#1f4e79';
      color.addEventListener('input', () => setHeader(item.key, color.value));
      field = h('div', { class: 'field' }, color);
    } else {
      field = inputFor(row, item.spec, () => setHeader(item.key, row.value));
    }
    body.append(h('div', { class: 'row' }, h('label', { text: item.label }), field, h('span')));
  });
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
    target = await native.choose_save(`${base}.pdf`);
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
    const term = search.value.trim().toLowerCase();
    palette.querySelectorAll('.palette-grid button').forEach((tile) => {
      tile.hidden = term !== '' && !tile.title.toLowerCase().includes(term);
    });
    palette.querySelectorAll('.palette-grid').forEach((grid) => {
      const empty = ![...grid.children].some((tile) => !tile.hidden);
      grid.hidden = empty;
      grid.previousElementSibling.hidden = empty;
    });
  });
  palette.append(search);
  const tints = ['#fbbc04', '#ea4335', '#4285f4', '#34a853', '#a142f4', '#24c1e0', '#fa7b17', '#5856d6', '#f538a0', '#00a9a5', '#ff9500', '#af52de'];
  groups.forEach((name, groupIndex) => {
    const items = TEMPLATES.filter((template) => template.group === name);
    if (!items.length) return;
    palette.append(h('div', { class: 'palette-group', text: name }));
    const grid = h('div', { class: 'palette-grid' });
    items.forEach((template, index) => {
      grid.append(
        h('button', {
          html: `${icon(template.icon, 26)}<span>${template.label}</span>`,
          title: template.label,
          style: `--tint:${name === 'Layout' ? '#d9dee6' : tints[groupIndex % tints.length]};--i:${Math.min(index, 14)}`,
          onclick: () => insertTemplate(template),
        }),
      );
    });
    palette.append(grid);
  });
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

function showStart(state) {
  reveal($('#start'));
  document.documentElement.classList.add('home');
  updatePill();
  renderOutline();
  $('#newEssay').innerHTML = `<span class="badge">${icon('newFile', 24)}</span><span>New essay</span>`;
  $('#openEssay').innerHTML = `<span class="badge">${icon('folder', 24)}</span><span>Open essay</span>`;
  const items = state.recent || [];
  $('#recentBox').hidden = !items.length;
  bindTilt($('#recent'), 'button.sheet');
  bindTilt($('#start .tiles'), '.tile');
  $('#recent').replaceChildren(
    ...items.slice(0, 8).map((path, index) => {
      const parts = path.split(/[\\/]/);
      const name = (parts.pop() || '').replace(/\.(txt|pdf)$/i, '');
      const folder = parts.pop() || '';
      const turn = ((name.length * 37 + index * 53) % 9) / 2 - 2;
      const card = h('button', {
        class: 'sheet',
        'data-path': path,
        style: `--r:${turn.toFixed(1)}deg;--i:${index}`,
        html: '<span class="sheet-title"></span><span class="sheet-lines"></span><span class="sheet-where"></span>',
        onclick: () => openPath(path),
      });
      card.querySelector('.sheet-title').textContent = name;
      card.querySelector('.sheet-where').textContent = folder;
      return card;
    }),
  );
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
      if (Date.now() - lastWheel < 90) return;
      lastWheel = Date.now();
      zoomStep(event.deltaY < 0 ? 1 : -1);
    },
    { passive: false },
  );
  scroll.addEventListener('mousedown', (event) => {
    const blank = event.target === scroll || event.target.id === 'pages' || event.target.classList.contains('page') || (event.target.tagName === 'IMG' && event.target.parentNode && event.target.parentNode.classList.contains('page'));
    if (event.target === scroll || event.target.id === 'pages') {
      conceal($('#palette'));
      conceal($('#issueList'));
    }
    if (blank && !S.settingsOpen && (S.sel || S.edit || S.panel)) deselect();
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
    } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'Enter') {
      event.preventDefault();
      addPageAfter(pageInView());
    } else if ((event.ctrlKey || event.metaKey) && key === 'y') {
      event.preventDefault();
      undo(1);
    } else if ((event.ctrlKey || event.metaKey) && ['=', '+'].includes(event.key)) {
      event.preventDefault();
      zoomStep(1);
    } else if ((event.ctrlKey || event.metaKey) && event.key === '-') {
      event.preventDefault();
      zoomStep(-1);
    } else if ((event.ctrlKey || event.metaKey) && event.key === '0') {
      event.preventDefault();
      setZoom('fit');
    } else if (event.key === 'Escape') {
      if (openMenu) closeMenu();
      else if (!$('#appearance').hidden) conceal($('#appearance'));
      else if (!$('#palette').hidden || !$('#issueList').hidden) {
        cancelTarget();
        conceal($('#palette'));
        conceal($('#issueList'));
      } else if (S.edit) closeEditor();
      else deselect();
    } else if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key) && S.sel && !typing) {
      event.preventDefault();
      move(event.key === 'ArrowUp' ? -1 : 1);
    } else if (event.key === 'Delete' && !typing && S.sel && !TEXT_KINDS.has(S.sel.kind)) {
      remove(S.sel);
    }
  });
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
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable;
    if (typing || S.edit || !S.sel || (typeof CV !== 'undefined' && CV.mode === 'page')) return false;
    const selection = window.getSelection();
    return !selection || selection.isCollapsed;
  };
  document.addEventListener('copy', (event) => {
    if (!blockClipboard(event)) return;
    event.preventDefault();
    S.clip = { text: linesOf(S.sel).join('\n'), kind: S.sel.kind };
    event.clipboardData.setData('text/plain', S.clip.text);
    toast('Block copied');
  });
  document.addEventListener('cut', (event) => {
    if (!blockClipboard(event)) return;
    event.preventDefault();
    S.clip = { text: linesOf(S.sel).join('\n'), kind: S.sel.kind };
    event.clipboardData.setData('text/plain', S.clip.text);
    commitHistory();
    remove(S.sel);
    commitHistory();
  });
  document.addEventListener('paste', (event) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable;
    if (typing || S.edit || !S.pages.length || (typeof CV !== 'undefined' && CV.mode === 'page')) return;
    const text = (event.clipboardData.getData('text/plain') || '').replace(/\r/g, '');
    if (!text.trim()) return;
    event.preventDefault();
    commitHistory();
    if (S.clip && text === S.clip.text) insertLines(S.clip.text.split('\n'), S.clip.kind);
    else insertLines(text.trim().split(/\n\s*\n/).map((part) => part.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean).join('\n\n').split('\n'), 'para');
    commitHistory();
  });
  setInterval(() => fetch('/api/ping').catch(() => null), 5000);
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
}

main();
