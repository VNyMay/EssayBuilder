const CV_PRESETS = {
  classic: (ink) => [
    cvTextBox('{subject}', { x: '10', y: '12', w: '80', size: '13', bold: '1', upper: '1', spacing: '1.2' }),
    cvTextBox('{title}', { x: '12', y: '40', w: '76', size: '22', bold: '1' }),
    { kind: 'line', p: { x: '30', y: '55', w: '40', bw: '1', border: '#141414' }, text: '' },
    cvTextBox('Research question', { x: '20', y: '57.5', w: '60', size: '9.5', bold: '1', upper: '1', spacing: '1.6', color: '#5d5d58' }),
    cvTextBox('{question}', { x: '12', y: '61', w: '76', size: '14', italic: '1' }),
    cvTextBox('Word count: {words}', { x: '20', y: '88', w: '60', size: '12' }),
  ],
  formal: (ink) => [
    cvTextBox('{subject}', { x: '10', y: '14', w: '80', size: '12', bold: '1', upper: '1', spacing: '1.5' }),
    { kind: 'line', p: { x: '10', y: '35', w: '80', bw: '1.4', border: '#141414' }, text: '' },
    cvTextBox('{title}', { x: '12', y: '40', w: '76', size: '25', bold: '1' }),
    { kind: 'line', p: { x: '10', y: '60', w: '80', bw: '1.4', border: '#141414' }, text: '' },
    cvTextBox('{author}\n{school}\n{session}', { x: '20', y: '72', w: '60', size: '12', line: '1.6' }),
    cvTextBox('Word count: {words}', { x: '20', y: '90', w: '60', size: '11', color: '#5d5d58' }),
  ],
  modern: (ink) => [
    cvTextBox('{subject}', { x: '9', y: '12', w: '70', size: '11', bold: '1', upper: '1', spacing: '2', color: ink, align: 'left' }),
    { kind: 'rect', p: { x: '9', y: '34', w: '1.6', h: '24', bg: ink }, text: '' },
    cvTextBox('{title}', { x: '13', y: '35', w: '78', size: '32', bold: '1', align: 'left', line: '1.15' }),
    { kind: 'line', p: { x: '9', y: '76', w: '82', bw: '0.8', border: '#cfcfc8' }, text: '' },
    cvTextBox('{author}\n{session}', { x: '9', y: '79', w: '60', size: '12', align: 'left', line: '1.6' }),
    cvTextBox('Word count: {words}', { x: '60', y: '79', w: '31', size: '11', align: 'right', color: '#5d5d58' }),
  ],
  minimal: (ink) => [
    cvTextBox('{subject}', { x: '9', y: '10', w: '70', size: '10', upper: '1', spacing: '2.5', color: '#5d5d58', align: 'left' }),
    cvTextBox('{title}', { x: '9', y: '52', w: '82', size: '36', weight: '400', align: 'left', line: '1.12' }),
    { kind: 'line', p: { x: '9', y: '78', w: '82', bw: '0.8', border: '#141414' }, text: '' },
    cvTextBox('{author}    {session}    Word count: {words}', { x: '9', y: '80.5', w: '82', size: '11', align: 'left' }),
  ],
  banner: (ink) => [
    { kind: 'rect', p: { x: '0', y: '0', w: '100', h: '50', bg: ink }, text: '' },
    cvTextBox('{subject}', { x: '9', y: '9', w: '82', size: '12', color: '#ffffff', align: 'left', upper: '1', spacing: '1.5' }),
    cvTextBox('{title}', { x: '9', y: '24', w: '82', h: '22', size: '32', bold: '1', color: '#ffffff', align: 'left', valign: 'bottom' }),
    cvTextBox('{author}\n{school}\n{session}', { x: '9', y: '76', w: '60', size: '12', align: 'left', line: '1.6' }),
    cvTextBox('Word count: {words}', { x: '60', y: '90', w: '31', size: '11', align: 'right', color: '#5d5d58' }),
  ],
  split: (ink) => [
    { kind: 'rect', p: { x: '0', y: '0', w: '34', h: '100', bg: ink }, text: '' },
    cvTextBox('{subject}', { x: '6', y: '9', w: '24', size: '13', bold: '1', color: '#ffffff', align: 'left' }),
    cvTextBox('{title}', { x: '40', y: '32', w: '52', size: '28', bold: '1', align: 'left', line: '1.2' }),
    cvTextBox('{author}\n{session}\nWord count: {words}', { x: '6', y: '80', w: '24', size: '11', color: '#ffffff', align: 'left', line: '1.6' }),
  ],
  image: (ink) => {
    const picture = headerValue('cover-image');
    return [
      ...(picture ? [{ kind: 'image', p: { x: '0', y: '0', w: '100', h: '100', fit: 'cover' }, text: picture }] : []),
      { kind: 'rect', p: { x: '0', y: '0', w: '100', h: '100', bg: '#000000', opacity: '0.42' }, text: '' },
      cvTextBox('{subject}', { x: '9', y: '10', w: '82', size: '12', color: '#ffffff', align: 'left', upper: '1', spacing: '1.5' }),
      cvTextBox('{title}', { x: '9', y: '56', w: '82', size: '38', bold: '1', color: '#ffffff', align: 'left', line: '1.1' }),
      cvTextBox('{author}    {session}    Word count: {words}', { x: '9', y: '88', w: '82', size: '11', color: '#ffffff', align: 'left' }),
    ];
  },
};

let cvFrame = null;

function cvInk() {
  return headerValue('cover-color') || S.settings.accent || '#1f4e79';
}

function cvEnterOverlay(pageIndex) {
  const first = firstRangeOn(pageIndex);
  if (!S.pages.length || !first) return;
  const existing = leadingRanges(first).find((range) => range.kind === 'overlay');
  cvStart(existing || { virtual: true, kind: 'overlay', before: first }, pageIndex);
}

function cvEnterDesign(range) {
  if (!S.pages.length || !range) return;
  const span = (S.regions[range.id] || [])[0];
  if (!span) return;
  cvStart(range, span.page);
}

function cvStart(target, pageIndex) {
  closeEditor(true);
  closePanel();
  CV.target = target;
  CV.pageIndex = pageIndex;
  const span = { page: pageIndex };
  cvLoad();
  CV.mode = 'page';
  CV.sel = -1;
  CV.history = [];
  CV.future = [];
  CV.editing = null;
  S.sel = null;
  S.settingsOpen = true;
  S.coverOpen = false;
  const div = $('#pages').children[span.page];
  if (div) div.scrollIntoView({ behavior: 'smooth', block: 'center' });
  cvDrawPage();
  cvTools();
}

function cvEnterPage(style) {
  if (!S.pages.length) return;
  closeEditor(true);
  closePanel();
  CV.target = null;
  CV.pageIndex = 0;
  cvLoad();
  if (style && CV_PRESETS[style]) {
    CV.boxes = CV_PRESETS[style](cvInk());
    if (style === 'image' || style === 'banner' || style === 'split') setHeader('cover-color', '');
  } else if (!CV.boxes.length && !headerValue('cover-box')) {
    CV.boxes = CV_PRESETS.classic(cvInk());
  }
  if (headerValue('cover-style') !== 'free') setHeader('cover-style', 'free');
  if (/^(no|off|false)$/i.test(headerValue('cover'))) setHeader('cover', 'yes');
  cvSave();
  CV.mode = 'page';
  CV.sel = -1;
  CV.history = [];
  CV.future = [];
  CV.editing = null;
  S.sel = null;
  S.settingsOpen = true;
  S.coverOpen = false;
  $('#scroll').scrollTo({ top: 0, behavior: 'smooth' });
  cvDrawPage();
  cvTools();
}

function cvExitPage() {
  if (CV.mode !== 'page') return;
  if (S.edit && S.edit.cover) closeEditor();
  CV.mode = null;
  CV.root = null;
  CV.target = null;
  CV.pageIndex = 0;
  document.querySelectorAll('.cover-layer').forEach((node) => node.remove());
  if (cvFrame) conceal(cvFrame, true);
  cvFrame = null;
  S.settingsOpen = false;
  conceal($('#panel'));
  placeOverlays();
  if (typeof drawOverlayViews === 'function') drawOverlayViews();
}

function cvDrawPage() {
  if (CV.target && CV.target.virtual) {
    const fresh = S.ranges.find((range) => range.start === CV.target.before.start && range.kind === CV.target.before.kind);
    if (fresh) CV.target.before = fresh;
  } else if (CV.target) {
    const fresh = S.ranges.find((range) => range.start === CV.target.start && range.kind === CV.target.kind);
    if (fresh) CV.target = fresh;
    if (CV.target.kind === 'overlay') {
      if (S.overlays && S.overlays[`ov-${CV.target.start}`] !== undefined) CV.pageIndex = S.overlays[`ov-${CV.target.start}`];
    } else {
      const span = (S.regions[CV.target.id] || [])[0];
      if (span) CV.pageIndex = span.page;
    }
  }
  document.querySelectorAll('.cover-layer').forEach((node) => {
    if (node.parentElement !== $('#pages').children[CV.pageIndex || 0]) node.remove();
  });
  const div = $('#pages').children[CV.pageIndex || 0];
  if (!div) return;
  let layer = div.querySelector('.cover-layer');
  if (!layer) {
    layer = h('div', { class: 'cover-layer' });
    layer.addEventListener('pointerdown', (event) => {
      if (event.target !== layer) return;
      if (S.edit && S.edit.cover) closeEditor();
      CV.sel = -1;
      cvDrawPage();
    });
    div.append(layer);
  }
  CV.page = layer;
  CV.root = layer;
  CV.scale = S.scale;
  const overlay = Boolean(CV.target && CV.target.kind === 'overlay');
  layer.classList.toggle('ov-edit', overlay);
  layer.style.background = overlay ? 'transparent' : (CV.target ? CV.color : headerValue('cover-color')) || '#ffffff';
  div.querySelectorAll('.ov-view').forEach((node) => node.remove());
  layer.style.fontFamily = docFont();
  layer.replaceChildren();
  CV.boxes.forEach((box, index) => layer.append(cvElement(box, index)));
  cvSelection();
  cvInspectPanel();
}

function cvInspectPanel() {
  const panel = $('#panel');
  panel.classList.remove('wide');
  const box = CV.boxes[CV.sel];
  const title = box ? { text: 'Text', rect: 'Shape', ellipse: 'Shape', line: 'Line', image: 'Picture' }[box.kind] : CV.target ? 'Page' : 'Cover';
  CV.inspector = h('div', { class: 'panel-body cv-panel' });
  panel.replaceChildren(
    h('div', { class: 'panel-head' }, h('span', { text: title }), h('button', { class: 'round', html: icon('close', 16), title: 'Done', onclick: cvExitPage })),
    CV.inspector,
  );
  reveal(panel);
  cvInspect();
}

function cvTools() {
  if (cvFrame) cvFrame.remove();
  const shape = h('button', { type: 'button', class: 'cv-tool', html: `${icon('shapes', 18)}<span>Shape</span>`, onclick: () => cvShapeMenu(shape) });
  const field = h('button', { type: 'button', class: 'cv-tool', html: `${icon('braces', 18)}<span>Field</span>`, onclick: () => cvFieldMenu(field) });
  const layouts = h('button', {
    type: 'button',
    class: 'cv-tool',
    html: `${icon('swot', 18)}<span>Layouts</span>`,
    onclick: () => showMenu(layouts, Object.keys(CV_PRESETS).map((key) => ({ value: key, label: { classic: 'IB standard', formal: 'Formal', modern: 'Modern', minimal: 'Minimal', banner: 'Banner', split: 'Split', image: 'Photo' }[key] })), '', (value) => {
      cvSnapshot();
      CV.boxes = CV_PRESETS[value](cvInk());
      CV.sel = -1;
      cvSave();
      cvDrawPage();
    }, false),
  });
  const make = CV.target ? h('button', { type: 'button', class: 'cv-tool', title: 'Turn this page into the cover', html: `${icon('cover', 18)}<span>Make cover</span>`, onclick: cvMakeCover }) : '';
  cvFrame = h(
    'div',
    { class: 'cover-tools rail' },
    h('button', { type: 'button', class: 'cv-tool', html: `${icon('textIcon', 18)}<span>Text</span>`, onclick: () => cvAdd(cvTextBox('Text', { x: '20', y: '40', w: '60', size: '20' }), true) }),
    field,
    shape,
    h('button', { type: 'button', class: 'cv-tool', html: `${icon('image', 18)}<span>Picture</span>`, onclick: cvAddImage }),
    h('span', { class: 'cv-sep' }),
    layouts,
    make,
    h('span', { class: 'cv-sep' }),
    h('button', { type: 'button', class: 'pill solid small', text: 'Done', onclick: cvExitPage }),
  );
  document.body.append(cvFrame);
}

function cvMakeCover() {
  const pageIndex = CV.pageIndex;
  const size = S.pages[pageIndex];
  if (!size) return;
  const round = (value) => String(Math.round(value * 100) / 100);
  const boxes = [];
  const doomed = [];
  const color = CV.target && CV.target.kind === 'design' ? CV.color : '';
  if (CV.target && CV.target.kind === 'design') {
    boxes.push(...CV.boxes);
    doomed.push(CV.target);
  } else {
    const x = (marginPt() / size.w) * 100;
    pageRanges(pageIndex).forEach((range) => {
      const span = (S.regions[range.id] || [])[0];
      if (!span) return;
      const y = round((span.y0 / size.h) * 100);
      if (['heading', 'para', 'text', 'quote', 'list'].includes(range.kind)) {
        const parts = range.kind === 'text' && typeof textParts === 'function' ? textParts(range) : null;
        let text = (parts ? parts.inner : linesOf(range)).join('\n').replace(/\\\\\n/g, '\n');
        if (range.kind === 'heading') text = text.replace(/^#+\s*/, '').replace(/\s*\{[^}]*\}\s*$/, '');
        if (range.kind === 'quote') text = text.replace(/^>\s?/gm, '');
        const heading = range.kind === 'heading';
        boxes.push({ kind: 'text', p: { x: round(x), y, w: round(100 - 2 * x), size: heading ? '20' : String(parseFloat(S.settings['font-size']) || 12), ...(heading ? { bold: '1' } : {}) }, text });
        doomed.push(range);
      } else if (range.kind === 'figure') {
        const src = (linesOf(range).find((line) => /^\s*src\s*:/i.test(line)) || '').replace(/^\s*src\s*:\s*/i, '').trim();
        if (!src) return;
        boxes.push({ kind: 'image', p: { x: round(x), y, w: round(100 - 2 * x), h: round(((span.y1 - span.y0) / size.h) * 100), fit: 'contain' }, text: src });
        doomed.push(range);
      }
    });
    boxes.push(...CV.boxes);
    if (CV.target && !CV.target.virtual) doomed.push(CV.target);
  }
  if (!boxes.length) {
    toast('Nothing on this page to move to the cover');
    return;
  }
  cvExitPage();
  const all = lines();
  const gone = new Set();
  doomed.forEach((range) => {
    for (let n = range.start; n <= range.end; n += 1) gone.add(n - 1);
    if (all[range.end] !== undefined && !all[range.end].trim()) gone.add(range.end);
  });
  let text = all.filter((_, index) => !gone.has(index)).join('\n');
  text = text.replace(/(:::pagebreak[ \t]*\n)(\s*:::pagebreak[ \t]*\n)+/g, '$1');
  restoreSource(text);
  setHeaderLines('cover-box', boxes.map(cvLine));
  setHeader('cover', 'yes');
  setHeader('cover-style', 'free');
  if (color) setHeader('cover-color', color);
  commitHistory();
  S.pendingCover = true;
  toast('This page is now the cover');
}

function cvRichText(index) {
  const box = CV.boxes[index];
  const el = CV.page.querySelector(`.cvb[data-i="${index}"]`);
  if (!el || box.kind !== 'text') return;
  if (S.edit) closeEditor(true);
  CV.editing = index;
  CV.sel = index;
  cvSelection();
  el.classList.add('typing', 'editor', 'rich');
  el.classList.remove('empty');
  el.contentEditable = 'true';
  el.style.cursor = 'text';
  const lone = (box.text.match(/^\{(\w+)\}$/) || [])[1];
  const field = lone && lone !== 'words' && CV_FIELDS.some((item) => item[0] === lone) ? lone : null;
  const tokens = [...box.text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).filter((key) => CV_FIELDS.some((item) => item[0] === key));
  const shown = field ? cvFieldValue(field) || '' : cvShow(box);
  el.replaceChildren(inlineNodes(shown.replace(/\n/g, BREAK)));
  const typed = () => bodyMd(el).replace(/\\\\\n/g, ' ').replace(/\s+/g, ' ').trim();
  const read = () => {
    if (field) return `{${field}}`;
    let out = bodyMd(el).replace(/\\\\\n/g, '\n');
    tokens.forEach((key) => {
      const value = cvFieldValue(key) || (CV_FIELDS.find((item) => item[0] === key) || [])[1];
      if (value && out.includes(value)) out = out.replace(value, `{${key}}`);
    });
    return out;
  };
  let timer = null;
  const commit = () => {
    box.text = read();
    clearTimeout(timer);
    timer = setTimeout(cvSave, 350);
  };
  S.edit = {
    rich: true,
    ta: el,
    range: null,
    prefix: '',
    tail: '',
    cover: {
      commit,
      align: (value) => {
        el.style.textAlign = value;
        box.p.align = value === 'left' ? '' : value;
        if (!box.p.align) delete box.p.align;
        commit();
      },
      close: () => {
        clearTimeout(timer);
        box.text = read();
        CV.editing = null;
        if (field && typed() !== (cvFieldValue(field) || '')) setHeader(field, typed());
        cvSave();
        cvDrawPage();
      },
    },
  };
  savedRange = null;
  el.addEventListener('input', commit);
  el.addEventListener('keydown', richKeys);
  el.addEventListener('paste', (event) => {
    event.preventDefault();
    const text = (event.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });
  el.addEventListener('pointerdown', (event) => event.stopPropagation());
  el.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!S.edit || S.edit.ta !== el) return;
      const active = document.activeElement;
      if (el.contains(active) || (active && active.closest && active.closest('.menu, .cpop, .fpop, .fmtbar, .chip-pop, #palette, #panel'))) return;
      closeEditor();
    }, 0);
  });
  document.addEventListener('selectionchange', trackSelection);
  mountRichBar();
  el.focus({ preventScroll: true });
  const selection = window.getSelection();
  const all = document.createRange();
  all.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(all);
  savedRange = all.cloneRange();
}

const cvScreenDraw = cvDraw;
cvDraw = function () {
  if (CV.mode === 'page') return cvDrawPage();
  return cvScreenDraw();
};

const cvScreenEdit = cvEditText;
cvEditText = function (index) {
  if (CV.mode === 'page') return cvRichText(index);
  return cvScreenEdit(index);
};

const cvScreenElement = cvElement;
cvElement = function (box, index) {
  const el = cvScreenElement(box, index);
  if (CV.mode === 'page' && box.kind === 'text') {
    const shown = cvShow(box);
    el.replaceChildren(inlineNodes(shown.replace(/\n/g, BREAK)));
  }
  return el;
};

const cvScreenInspect = cvInspect;
cvInspect = function () {
  if (CV.mode === 'page' && CV.inspector && !CV.inspector.isConnected) return;
  cvScreenInspect();
};

cvClose = function () {
  if (CV.mode === 'page') cvExitPage();
};

openCoverFree = function (style) {
  cvEnterPage(typeof style === 'string' ? style : null);
};

function cvAfterLayout() {
  if (S.pendingCover && CV.mode !== 'page') {
    S.pendingCover = false;
    setTimeout(() => cvEnterPage(), 0);
    return;
  }
  if (S.pendingDesign && CV.mode !== 'page') {
    const range = S.ranges.find((item) => item.start === S.pendingDesign && item.kind === 'design');
    S.pendingDesign = null;
    if (range) setTimeout(() => cvEnterDesign(range), 0);
    return;
  }
  if (CV.mode !== 'page' || (S.edit && S.edit.cover) || CV.dragging) return;
  if (performance.now() - cvLastDown.time < 500) return;
  if (S.pages.length) cvDrawPage();
}

document.addEventListener(
  'keydown',
  (event) => {
    if (CV.mode !== 'page') return;
    if (S.edit && S.edit.cover) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key;
    if (typeof cvShortcut === 'function' && cvShortcut(event)) return;
    if (key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (CV.sel >= 0) {
        CV.sel = -1;
        cvDrawPage();
      } else cvExitPage();
    } else if (mod && key.toLowerCase() === 'z') {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) cvRestore(CV.future, CV.history);
      else cvRestore(CV.history, CV.future);
    } else if (mod && key.toLowerCase() === 'y') {
      event.preventDefault();
      event.stopPropagation();
      cvRestore(CV.future, CV.history);
    } else if (CV.sel >= 0 && (key === 'Delete' || key === 'Backspace')) {
      event.preventDefault();
      event.stopPropagation();
      cvDelete();
    } else if (CV.sel >= 0 && mod && key.toLowerCase() === 'd') {
      event.preventDefault();
      event.stopPropagation();
      cvDuplicate();
    } else if (CV.sel >= 0 && key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      cvRichText(CV.sel);
    } else if (CV.sel >= 0 && !mod && !event.altKey && key.length === 1 && CV.boxes[CV.sel] && CV.boxes[CV.sel].kind === 'text') {
      event.preventDefault();
      event.stopPropagation();
      cvRichText(CV.sel);
      const selection = window.getSelection();
      if (selection.rangeCount) selection.collapseToEnd();
      document.execCommand('insertText', false, key);
    } else if (CV.sel >= 0 && key.startsWith('Arrow')) {
      event.preventDefault();
      event.stopPropagation();
      const step = event.shiftKey ? 2 : 0.25;
      const box = CV.boxes[CV.sel];
      cvSnapshot();
      if (key === 'ArrowLeft') box.p.x = String(cvNum(box, 'x', 10) - step);
      if (key === 'ArrowRight') box.p.x = String(cvNum(box, 'x', 10) + step);
      if (key === 'ArrowUp') box.p.y = String(cvNum(box, 'y', 10) - step);
      if (key === 'ArrowDown') box.p.y = String(cvNum(box, 'y', 10) + step);
      cvSave();
      cvDrawPage();
    }
  },
  true,
);

document.addEventListener('pointerdown', (event) => {
  if (CV.mode !== 'page') return;
  if (event.target.closest('.cover-layer, .cover-tools, #panel, .menu, .fmtbar, .chip-pop, #bar, #dock, .cmd-back')) return;
  if (event.target.closest('#scroll')) cvExitPage();
});

const cvScreenDown = cvDown;
let cvLastDown = { index: -1, time: 0, x: 0, y: 0 };
cvDown = function (event, index) {
  if (CV.mode === 'page') {
    if (CV.editing === index) return;
    const now = performance.now();
    const near = Math.abs(event.clientX - cvLastDown.x) < 6 && Math.abs(event.clientY - cvLastDown.y) < 6;
    if (CV.boxes[index] && CV.boxes[index].kind === 'text' && cvLastDown.index === index && near && now - cvLastDown.time < 450) {
      cvLastDown = { index: -1, time: 0, x: 0, y: 0 };
      event.preventDefault();
      event.stopPropagation();
      cvRichText(index);
      return;
    }
    cvLastDown = { index, time: now, x: event.clientX, y: event.clientY };
    const again = CV.sel === index && CV.boxes[index] && CV.boxes[index].kind === 'text';
    CV.dragging = true;
    window.addEventListener('pointerup', (up) => {
      CV.dragging = false;
      const still = Math.abs(up.clientX - event.clientX) < 4 && Math.abs(up.clientY - event.clientY) < 4;
      if (again && still && performance.now() - now < 600 && CV.editing !== index) setTimeout(() => cvRichText(index), 0);
    }, { once: true });
  }
  return cvScreenDown(event, index);
};
