function flowShow(on) {
  const scroll = $('#scroll');
  const turn = FLOW.root && FLOW.on !== on && S.name ? scroll.scrollTop / Math.max(1, scroll.scrollHeight - scroll.clientHeight) : null;
  if (FLOW.on !== on && typeof TOUR !== 'undefined' && TOUR.root) endTour();
  flowMount();
  FLOW.on = on;
  document.documentElement.classList.toggle('flow-mode', on);
  FLOW.root.hidden = !on;
  $('#pages').hidden = on;
  FLOW.bar.hidden = !on;
  localStorage.setItem('studio.view', on ? 'write' : 'pages');
  flowPaintToggle();
  if (on) {
    closeEditor(true);
    closePanel();
    S.sel = null;
    if (FLOW.lastSource !== S.source) {
      if (FLOW.lastSource === null) flowLoad();
      else flowPull();
    }
    flowStyle();
    flowAfterRender(S.lastSent);
  } else {
    flowSlashClose();
    flowPopClose();
    if (FLOW.find) conceal(FLOW.find.box);
    closePanel();
    layout();
  }
  renderOutline();
  if (turn !== null) scroll.scrollTop = turn * Math.max(0, scroll.scrollHeight - scroll.clientHeight);
  if (on && turn !== null) FLOW.editor.commands.focus(null, { scrollIntoView: false });
}

function flowPaintToggle() {
  const toggle = $('#viewBtn');
  if (!toggle) return;
  toggle.innerHTML = FLOW.on ? `${icon('page', 16)}<span>Pages</span>` : `${icon('paragraph', 16)}<span>Write</span>`;
  toggle.title = FLOW.on ? 'See the exact pages (Ctrl+Shift+P)' : 'Back to writing (Ctrl+Shift+P)';
}

function flowWhereAll() {
  try {
    return JSON.parse(localStorage.getItem('studio.where') || '{}');
  } catch (error) {
    return {};
  }
}

function flowRemember() {
  clearTimeout(FLOW.rememberTimer);
  FLOW.rememberTimer = setTimeout(() => {
    if (!FLOW.on || !FLOW.editor || !S.path || FLOW.resuming) return;
    const scroll = $('#scroll');
    const pos = FLOW.editor.state.selection.from;
    let y = null;
    try {
      y = FLOW.editor.view.coordsAtPos(pos).top - scroll.getBoundingClientRect().top;
    } catch (error) {
      y = null;
    }
    const all = flowWhereAll();
    delete all[S.path];
    all[S.path] = { pos, y, top: scroll.scrollTop };
    const keys = Object.keys(all);
    keys.slice(0, Math.max(0, keys.length - 40)).forEach((key) => delete all[key]);
    localStorage.setItem('studio.where', JSON.stringify(all));
  }, 400);
}

function flowResume() {
  const saved = S.path && flowWhereAll()[S.path];
  const size = FLOW.editor.state.doc.content.size;
  if (!saved || !(saved.pos > 0 && saved.pos < size)) return flowFocusStart();
  FLOW.resuming = true;
  const place = () => {
    try {
      FLOW.editor.chain().setTextSelection(Math.min(saved.pos, FLOW.editor.state.doc.content.size - 1)).focus(null, { scrollIntoView: false }).run();
      const scroll = $('#scroll');
      if (saved.y === null || saved.y === undefined) scroll.scrollTop = saved.top || 0;
      else scroll.scrollTop += FLOW.editor.view.coordsAtPos(FLOW.editor.state.selection.from).top - scroll.getBoundingClientRect().top - saved.y;
    } catch (error) {
      flowFocusStart();
    }
  };
  const stop = () => {
    FLOW.resuming = false;
    ['wheel', 'mousedown', 'keydown', 'touchstart'].forEach((name) => window.removeEventListener(name, stop, true));
  };
  ['wheel', 'mousedown', 'keydown', 'touchstart'].forEach((name) => window.addEventListener(name, stop, true));
  place();
  [300, 1200, 2600].forEach((wait) => setTimeout(() => FLOW.resuming && place(), wait));
  setTimeout(stop, 2800);
}

function flowFocusStart() {
  let target = null;
  FLOW.editor.state.doc.descendants((node, pos) => {
    if (target !== null) return false;
    if (node.isTextblock) {
      target = pos + node.content.size + 1;
      return false;
    }
    return true;
  });
  const { doc } = FLOW.editor.state;
  if (target !== null && target === doc.content.size - 1 && doc.lastChild.type.name === 'heading') {
    FLOW.editor.view.dispatch(FLOW.editor.state.tr.insert(doc.content.size, FLOW.editor.schema.nodes.paragraph.create()).setMeta('addToHistory', false));
    target += 2;
  }
  if (target === null) FLOW.editor.commands.focus('end', { scrollIntoView: false });
  else FLOW.editor.chain().setTextSelection(target).focus(null, { scrollIntoView: false }).run();
  $('#scroll').scrollTop = 0;
}

function flowFitScale() {
  const page = S.pages.length ? S.pages[0] : { w: 595 };
  const scroll = $('#scroll');
  const shown = (node) => Boolean(node && !node.hidden && !node.classList.contains('leaving'));
  const panel = shown($('#panel')) || shown(document.getElementById('checkSheet'));
  let side = 0;
  if (shown($('#outline'))) side += 250;
  if (panel) side += 350;
  else if (FLOW.notes && FLOW.notes.length) side += 260;
  return Math.max(0.45, Math.min(1.6, (scroll.clientWidth - 90 - side) / page.w));
}

function flowWanted() {
  return localStorage.getItem('studio.view') !== 'pages';
}

function flowHook() {
  flowPaletteActions();
  document.addEventListener('selectionchange', () => FLOW.on && flowRemember());
  $('#scroll').addEventListener('scroll', () => FLOW.on && flowRemember(), { passive: true });
  const baseLoad = load;
  load = function (state) {
    baseLoad(state);
    if (!state.open) {
      if (FLOW.root) {
        FLOW.root.hidden = true;
        FLOW.bar.hidden = true;
        document.documentElement.classList.remove('flow-mode');
      }
      return;
    }
    flowMount();
    FLOW.lastSource = null;
    FLOW.crops = new Map();
    FLOW.lastRects = null;
    FLOW.pageInfo = null;
    FLOW.gaps = null;
    FLOW.paintSign = null;
    FLOW.pageSign = null;
    if (FLOW.marks) FLOW.marks.replaceChildren();
    if (FLOW.sheet) FLOW.sheet.classList.remove('paged');
    if (FLOW.front) FLOW.front.replaceChildren();
    S.lastSent = undefined;
    flowLoad();
    flowNotesLoad();
    FLOW.noteOn = null;
    flowShow(flowWanted());
    flowNotesRefresh();
    if (FLOW.on) setTimeout(flowResume, 50);
  };
  const baseApply = applyResult;
  applyResult = async function (result, sent) {
    await baseApply(result, sent);
    if (!result.fatal && result.pages && result.pages.length) S.lastSent = sent;
    if (FLOW.on) {
      flowPull();
      flowAfterRender(sent);
    }
  };
  const baseInsert = insertTemplate;
  insertTemplate = function (template) {
    if (FLOW.on) return flowInsertTemplate(template);
    return baseInsert(template);
  };
  const baseCommit = commitPanel;
  commitPanel = function (delay) {
    baseCommit(delay);
    if (FLOW.on) flowPull();
  };
  const baseSchedule = schedule;
  schedule = function (delay) {
    baseSchedule(delay);
    if (FLOW.on && S.source !== FLOW.lastSource) flowPull();
  };
  const baseScroll = scrollToRange;
  scrollToRange = function (range) {
    if (!FLOW.on) return baseScroll(range);
    if (FLOW.header.length && range.start <= FLOW.header.length) {
      openSettings();
      return;
    }
    const entries = FLOW.map.filter(Boolean);
    const entry = entries.find((item) => item.start <= range.start && range.start <= item.end) || entries.find((item) => item.start >= range.start) || entries[entries.length - 1];
    if (!entry) return;
    if (entry.kind && !['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'callout'].includes(entry.kind)) {
      const dom = FLOW.editor.view.nodeDOM(entry.offset);
      const scroll = $('#scroll');
      if (dom) scroll.scrollTo({ top: scroll.scrollTop + dom.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 140, behavior: 'smooth' });
      FLOW.editor.chain().setNodeSelection(entry.offset).run();
      if (dom) {
        dom.classList.add('flow-new');
        setTimeout(() => dom.classList.remove('flow-new'), 1200);
      }
      return;
    }
    const dom = FLOW.editor.view.nodeDOM(entry.offset);
    if (!dom) return;
    const scroll = $('#scroll');
    scroll.scrollTo({ top: scroll.scrollTop + dom.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 140, behavior: 'smooth' });
    FLOW.editor.chain().setTextSelection(entry.offset + 1).focus(null, { scrollIntoView: false }).run();
  };
  const baseExitPage = cvExitPage;
  cvExitPage = function () {
    baseExitPage();
    if (FLOW.backToWrite) {
      FLOW.backToWrite = false;
      flowShow(true);
    }
  };
  const baseSelect = select;
  select = function (range) {
    if (FLOW.on || !range || ['blank', 'design'].includes(range.kind) || (typeof CV !== 'undefined' && CV.mode)) return baseSelect(range);
    if ((FLOW.previewClicks || 0) < 2 || Date.now() - (FLOW.previewAt || 0) > 800) return;
    const texty = TEXT_KINDS.has(range.kind) || (typeof isRichText === 'function' && isRichText(range)) || (typeof isProse === 'function' && isProse(range));
    const start = range.start;
    flowShow(true);
    requestAnimationFrame(() => scrollToRange(texty ? { start, end: start, kind: 'para' } : range));
  };
  $('#pages').addEventListener('mousedown', (event) => {
    FLOW.previewClicks = event.detail;
    FLOW.previewAt = Date.now();
    if (event.button !== 0 || (S.edit && S.edit.ta && S.edit.ta.contains && S.edit.ta.contains(event.target))) return;
    S.clickAt = { x: event.clientX, y: event.clientY, t: Date.now() };
  }, true);
  const basePosition = positionSheet;
  positionSheet = function () {
    if (!FLOW.on) return basePosition();
    if (!SHEET.root || !SHEET.range) return;
    const host = flowDomFor(SHEET.range.uid);
    if (!host) return;
    if (SHEET.root.parentNode !== host) host.append(SHEET.root);
    host.classList.toggle('sheeting', SHEET.mode !== 'below');
    SHEET.root.style.left = '';
    SHEET.root.style.top = '';
    SHEET.root.style.width = '';
    SHEET.root.style.minHeight = '';
    SHEET.root.style.fontFamily = docFont();
    SHEET.root.style.fontSize = `${(parseFloat(S.settings['font-size']) || 12) * 0.92 * FLOW_L}px`;
    SHEET.root.style.setProperty('--pt', `${FLOW_L}px`);
  };
  const baseCloseSheet = closeSheet;
  closeSheet = function () {
    baseCloseSheet();
    if (FLOW.root) FLOW.root.querySelectorAll('.fb.sheeting').forEach((node) => node.classList.remove('sheeting'));
  };
  const pageTour = TOUR_STEPS.slice();
  const baseTour = startTour;
  startTour = function (again = false) {
    TOUR_STEPS.splice(0, TOUR_STEPS.length, ...(FLOW.on ? FLOW_TOUR.filter((step) => !step.needs || step.needs()) : pageTour));
    return baseTour(again);
  };
  const baseOutline = renderOutline;
  renderOutline = function () {
    if (FLOW.on && FLOW.editor) return flowOutline();
    return baseOutline();
  };
  let outlineTimer = 0;
  FLOW.outlineSoon = () => {
    clearTimeout(outlineTimer);
    outlineTimer = setTimeout(() => FLOW.on && flowOutline(), 400);
  };
  $('#scroll').addEventListener('scroll', () => {
    if (FLOW.on) requestAnimationFrame(flowOutlineActive);
  }, { passive: true });
  const baseHeadings = headingList;
  headingList = function () {
    if (!FLOW.on || !FLOW.editor) return baseHeadings();
    const out = [];
    FLOW.editor.state.doc.forEach((node, offset) => {
      if (node.type.name !== 'heading') return;
      const entry = FLOW.map.find((item) => item && item.offset === offset);
      if (entry) out.push({ level: node.attrs.level, text: node.textContent, range: flowRangeFor(entry) });
    });
    return out;
  };
  const baseLayout = layout;
  layout = function () {
    if (FLOW.on) {
      S.scale = S.zoom === 'fit' ? flowFitScale() : S.zoom === 'page' ? pageScale() : S.zoom;
      if (zoomPick) zoomPick.setLabel(`${Math.round((S.scale / (96 / 72)) * 100)}%`);
      flowZoomBox();
      if (!FLOW.styled) {
        FLOW.styled = true;
        flowStyle();
      }
      return;
    }
    baseLayout();
  };
  const zoomAt = (scale, x, y) => {
    const scroll = $('#scroll');
    const before = FLOW.zoomer.getBoundingClientRect();
    const old = flowZoom();
    const lx = (x - before.left) / old;
    const ly = (y - before.top) / old;
    S.zoom = scale;
    S.scale = scale;
    flowZoomBox();
    const after = FLOW.zoomer.getBoundingClientRect();
    const now = flowZoom();
    scroll.scrollLeft += after.left + lx * now - x;
    scroll.scrollTop += after.top + ly * now - y;
    if (zoomPick) zoomPick.setLabel(`${Math.round((scale / PX) * 100)}%`);
    clearTimeout(FLOW.sharpTimer);
    FLOW.sharpTimer = setTimeout(async () => {
      const dpi = S.dpi;
      await sharpen();
      if (S.dpi === dpi || !FLOW.on) return;
      FLOW.paintSign = null;
      flowPaintPages();
      FLOW.root.querySelectorAll('.fb').forEach((dom) => dom.flowRepaint && dom.flowRepaint());
      FLOW.front.querySelectorAll('img').forEach((img, index) => {
        if (S.pages[index] && img.getAttribute('src') !== S.pages[index].url) img.src = S.pages[index].url;
      });
    }, 400);
  };
  const basePinch = pinchWheel;
  pinchWheel = function (event) {
    if (!FLOW.on || !FLOW.zoomer) return basePinch(event);
    cancelAnimationFrame(FLOW.zoomAnim);
    const unit = event.deltaMode === 1 ? 0.04 : event.deltaMode === 2 ? 0.5 : 0.0016;
    const step = Math.max(-0.35, Math.min(0.35, -event.deltaY * unit));
    const next = Math.max(0.25 * PX, Math.min(4 * PX, (S.scale || PX) * Math.exp(step)));
    zoomAt(next, event.clientX, event.clientY);
  };
  const baseSetZoom = setZoom;
  setZoom = function (value) {
    if (!FLOW.on || !FLOW.zoomer) return baseSetZoom(value);
    const scroll = $('#scroll');
    const box = scroll.getBoundingClientRect();
    const from = S.scale || PX;
    S.zoom = value;
    const to = value === 'fit' ? flowFitScale() : value === 'page' ? pageScale() : value;
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    cancelAnimationFrame(FLOW.zoomAnim);
    const start = performance.now();
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = (time) => {
      const t = still ? 1 : Math.min(1, (time - start) / 220);
      const ease = 1 - Math.pow(1 - t, 3);
      zoomAt(from + (to - from) * ease, x, y);
      if (t < 1) FLOW.zoomAnim = requestAnimationFrame(tick);
      else {
        S.zoom = value;
        if (FLOW.editor) FLOW.editor.commands.focus(null, { scrollIntoView: false });
      }
    };
    FLOW.zoomAnim = requestAnimationFrame(tick);
  };
  let sideTimer = 0;
  const sideChanged = () => {
    clearTimeout(sideTimer);
    sideTimer = setTimeout(() => {
      if (FLOW.on && S.zoom === 'fit') layout();
    }, 60);
  };
  const sides = new MutationObserver(sideChanged);
  ['#outline', '#panel'].forEach((selector) => {
    const node = $(selector);
    if (node) sides.observe(node, { attributes: true, attributeFilter: ['hidden', 'class'] });
  });
  new MutationObserver((records) => {
    if (records.some((record) => [...record.addedNodes, ...record.removedNodes].some((node) => node.id === 'checkSheet'))) sideChanged();
  }).observe(document.body, { childList: true });
  FLOW.sideChanged = sideChanged;
  const baseHome = goHome;
  goHome = async function () {
    flowSlashClose();
    flowPopClose();
    if (FLOW.find) conceal(FLOW.find.box);
    if (FLOW.root) {
      FLOW.root.hidden = true;
      FLOW.bar.hidden = true;
    }
    document.documentElement.classList.remove('flow-mode');
    return baseHome();
  };
  let markTimer = 0;
  FLOW_HOOKED = true;
  document.addEventListener('keydown', (event) => {
    const open = S.name && !document.documentElement.classList.contains('home');
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.shiftKey && event.key.toLowerCase() === 'p' && open) {
      event.preventDefault();
      event.stopPropagation();
      flowShow(!FLOW.on);
    } else if (mod && event.shiftKey && event.key.toLowerCase() === 'f' && open) {
      event.preventDefault();
      event.stopPropagation();
      flowFocusMode();
    } else if (mod && !event.shiftKey && event.key === '/') {
      event.preventDefault();
      event.stopPropagation();
      flowShortcuts();
    } else if (mod && !event.altKey && open && ['=', '+', '-', '0'].includes(event.key) && typeof zoomStep === 'function') {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === '0') setZoom('fit');
      else zoomStep(event.key === '-' ? -1 : 1);
      if (FLOW.on) FLOW.editor.commands.focus(null, { scrollIntoView: false });
    } else if (event.key === 'Escape' && (document.getElementById('keysSheet') || document.getElementById('statsSheet'))) {
      event.preventDefault();
      event.stopPropagation();
      (document.getElementById('statsSheet') || document.getElementById('keysSheet')).remove();
    } else if (event.key === 'Escape' && document.documentElement.classList.contains('focus-mode') && !FLOW.slash && !FLOW.pop) {
      event.preventDefault();
      event.stopPropagation();
      flowFocusMode(false);
    }
  }, true);
  const baseItems = cmdItems;
  cmdItems = function () {
    const items = baseItems();
    const open = Boolean(S.name) && !document.documentElement.classList.contains('home');
    const add = (label, group, run, words, iconName) => items.unshift({ label, group, run, words: `${label} ${group} ${words}`.toLowerCase(), icon: iconName });
    add('Keyboard shortcuts', 'Help', flowShortcuts, 'keys hotkeys help', 'textIcon');
    if (typeof whatsNew === 'function') add("What's new", 'Help', () => whatsNew(true), 'update version release changes', 'sparkle');
    if (typeof helpOpen === 'function') add('Help', 'Help', helpOpen, 'questions faq how support guide f1', 'info');
    if (open && typeof saveAsTemplate === 'function') add('Save as template', 'Essay', saveAsTemplate, 'reuse my own starter layout', 'copy');
    if (open) {
      add('Find and replace', 'Edit', () => flowFindOpen(true), 'search replace swap ctrl h', 'search');
      add('Focus mode', 'View', () => flowFocusMode(), 'zen distraction free typewriter', 'eye');
      add(FLOW.on ? 'Print preview' : 'Back to writing', 'View', () => flowShow(!FLOW.on), 'pages view layout exact pdf image', 'page');
    }
    return items;
  };
  window.addEventListener('resize', () => {
    clearTimeout(markTimer);
    markTimer = setTimeout(() => FLOW.on && flowMarkers(), 120);
  });
  const dock = $('#dock');
  if (dock) {
    const toggle = h('button', { id: 'viewBtn', class: 'pill soft', type: 'button' });
    toggle.addEventListener('click', () => flowShow(!FLOW.on));
    dock.insertBefore(toggle, dock.querySelector('.sep'));
    flowPaintToggle();
  }
}

let FLOW_HOOKED = false;
flowHook();
