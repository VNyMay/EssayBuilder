function menuMotion(node) {
  if (!node || node.menuMotion) return;
  node.menuMotion = true;
  const rows = () => [...node.querySelectorAll('.frow')].filter((row) => !row.hidden);
  const hl = h('div', { class: 'menu-hl snap' });
  node.prepend(hl);
  node.classList.add('has-hl');
  if (!node.classList.contains('fslash')) {
    node.classList.add('stagger');
    rows().slice(0, 14).forEach((row, i) => row.style.setProperty('--i', i));
  }
  node.menuMove = (row) => {
    if (!row) {
      hl.classList.remove('on');
      return;
    }
    hl.style.width = `${row.offsetWidth}px`;
    hl.style.height = `${row.offsetHeight}px`;
    hl.style.transform = `translate(${row.offsetLeft}px, ${row.offsetTop}px)`;
    if (!hl.classList.contains('on')) {
      hl.classList.add('snap', 'on');
      requestAnimationFrame(() => requestAnimationFrame(() => hl.classList.remove('snap')));
    }
  };
  node.addEventListener('mouseover', (event) => {
    const row = event.target.closest('.frow');
    if (row && node.contains(row)) {
      node.kbIndex = rows().indexOf(row);
      node.menuMove(row);
    }
  });
  node.addEventListener('mouseleave', () => {
    node.kbIndex = -1;
    node.menuMove(null);
  });
  node.kbIndex = -1;
}

function menuKeys(event) {
  const palette = document.getElementById('palette');
  if (event.key === 'Escape' && palette && !palette.hidden && !palette.classList.contains('leaving')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    conceal(palette);
    if (FLOW.on && FLOW.editor) FLOW.editor.view.dom.focus({ preventScroll: true });
    return;
  }
  const pop = typeof FLOW !== 'undefined' ? FLOW.pop : null;
  if (!pop || !pop.isConnected || pop.classList.contains('leaving')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopImmediatePropagation();
    flowPopClose();
    if (FLOW.on && FLOW.editor) FLOW.editor.view.dom.focus({ preventScroll: true });
    return;
  }
  if (pop.querySelector('input, textarea') || pop.classList.contains('fslash')) return;
  const rows = [...pop.querySelectorAll('.frow')].filter((row) => !row.hidden);
  if (!rows.length) return;
  const keys = { ArrowDown: 1, ArrowUp: -1, Home: 'first', End: 'last', Tab: event.shiftKey ? -1 : 1 };
  if (event.key in keys) {
    event.preventDefault();
    event.stopPropagation();
    const step = keys[event.key];
    let index = pop.kbIndex;
    if (index < 0) index = Math.max(-1, rows.findIndex((row) => row.classList.contains('on')));
    if (step === 'first') index = 0;
    else if (step === 'last') index = rows.length - 1;
    else index = index < 0 ? (step > 0 ? 0 : rows.length - 1) : (index + step + rows.length) % rows.length;
    pop.kbIndex = index;
    rows[index].scrollIntoView({ block: 'nearest' });
    pop.menuMove && pop.menuMove(rows[index]);
    return;
  }
  if ((event.key === 'Enter' || event.key === ' ') && pop.kbIndex >= 0 && rows[pop.kbIndex]) {
    event.preventDefault();
    event.stopPropagation();
    rows[pop.kbIndex].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  }
}

document.addEventListener('keydown', menuKeys, true);

function shellToggled(anchor) {
  return FLOW.closedFrom === anchor && performance.now() - (FLOW.closedAt || 0) < 400;
}

function shellDesign() {
  const check = document.getElementById('checkBtn');
  if (!check || document.getElementById('designBtn')) return;
  const button = h('button', { id: 'designBtn', class: 'pill soft', type: 'button', title: 'Cover, fonts, margins and page', html: `${icon('palette', 17)}<span>Design</span>${icon('chevron', 14)}` });
  check.before(button);
  const later = (run) => () => setTimeout(run, 0);
  button.addEventListener('mousedown', (event) => {
    event.preventDefault();
    if (shellToggled(button)) return;
    flowMenu(button, [
      { label: 'Cover page', icon: 'cover', hint: 'Title, name, school', run: later(() => openCover()) },
      { label: 'Fonts, margins and page', icon: 'gear', hint: 'Whole essay', run: later(() => openSettings()) },
      { label: 'App colours', icon: 'palette', hint: 'Only on this computer', cls: 'sep-top', run: later(() => $('#themeBtn').click()) },
    ]);
  });
}

function shellDock() {
  const dock = document.getElementById('dock');
  if (!dock || document.getElementById('writeBtn')) return;
  const back = h('button', { id: 'writeBtn', class: 'pill solid', type: 'button', title: 'Back to writing (Esc)', html: `${icon('arrowLeft', 16)}<span>Back to writing</span>` });
  back.addEventListener('click', () => flowShow(true));
  const thumb = h('span', { class: 'view-thumb' });
  const write = h('button', { type: 'button', class: 'view-opt', 'data-view': 'write', title: 'Write and edit your essay', html: `${icon('paragraph', 15)}<span>Write</span>` });
  const look = h('button', { type: 'button', class: 'view-opt', 'data-view': 'preview', title: 'See the exact PDF pages (Ctrl+Shift+P)', html: `${icon('page', 15)}<span>Preview</span>` });
  const toggle = h('div', { class: 'view-switch', role: 'group', 'aria-label': 'View' }, thumb, write, look);
  const hint = h('span', { class: 'preview-hint', text: 'Double-click to edit' });
  write.addEventListener('click', () => !FLOW.on && flowShow(true));
  look.addEventListener('click', () => FLOW.on && flowShow(false));
  const paint = () => {
    const on = document.documentElement.classList.contains('flow-mode') ? write : look;
    write.classList.toggle('on', on === write);
    look.classList.toggle('on', on === look);
    if (!on.offsetWidth) return;
    thumb.style.width = `${on.offsetWidth}px`;
    thumb.style.transform = `translateX(${on.offsetLeft}px)`;
  };
  dock.prepend(toggle, hint, back);
  new MutationObserver(() => requestAnimationFrame(paint)).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  requestAnimationFrame(paint);
  setTimeout(paint, 600);
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented || !S.name || document.documentElement.classList.contains('home')) return;
    if (document.querySelector('.cmd-back, #helpSheet, .keys-back, .menu:not([hidden]), .fmenu:not(.leaving)') || (typeof CV !== 'undefined' && CV.mode)) return;
    const panel = document.getElementById('panel');
    if (panel && !panel.hidden && !panel.classList.contains('leaving')) {
      event.preventDefault();
      if (S.settingsOpen) closeSettings();
      else closePanel();
      return;
    }
    if (!FLOW.on) {
      event.preventDefault();
      flowShow(true);
    }
  });
}

function shellFitTween() {
  const baseLayout = layout;
  layout = function () {
    if (!FLOW.on || !FLOW.zoomer || S.zoom !== 'fit' || !FLOW.styled || FLOW.resizing || !S.scale || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cancelAnimationFrame(FLOW.fitAnim);
      return baseLayout();
    }
    const target = flowFitScale();
    const from = S.scale;
    if (Math.abs(target - from) < 0.004) return baseLayout();
    cancelAnimationFrame(FLOW.fitAnim);
    const scroll = $('#scroll');
    const box = scroll.getBoundingClientRect();
    const anchorY = box.top + box.height * 0.4;
    const local = (anchorY - FLOW.zoomer.getBoundingClientRect().top) / flowZoom();
    const start = performance.now();
    const tick = (time) => {
      const t = Math.min(1, (time - start) / 300);
      const ease = 1 - Math.pow(1 - t, 4);
      S.scale = from + (target - from) * ease;
      flowZoomBox();
      scroll.scrollTop += FLOW.zoomer.getBoundingClientRect().top + local * flowZoom() - anchorY;
      if (zoomPick) zoomPick.setLabel(`${Math.round((S.scale / (96 / 72)) * 100)}%`);
      if (t < 1) FLOW.fitAnim = requestAnimationFrame(tick);
      else baseLayout();
    };
    FLOW.fitAnim = requestAnimationFrame(tick);
  };
  window.addEventListener('resize', () => {
    FLOW.resizing = true;
    clearTimeout(FLOW.resizeTimer);
    FLOW.resizeTimer = setTimeout(() => {
      FLOW.resizing = false;
    }, 250);
  });
}

function shellPopToggle() {
  const baseOutside = flowPopOutside;
  document.addEventListener(
    'mousedown',
    (event) => {
      if (FLOW.pop && FLOW.popAnchor && FLOW.popAnchor.contains && FLOW.popAnchor.contains(event.target)) {
        FLOW.closedFrom = FLOW.popAnchor;
        FLOW.closedAt = performance.now();
      }
    },
    true,
  );
  return baseOutside;
}

function shellMenus() {
  new MutationObserver((records) => {
    records.forEach((record) =>
      record.addedNodes.forEach((node) => {
        if (node.nodeType === 1 && node.classList.contains('fmenu')) menuMotion(node);
      }),
    );
  }).observe(document.body, { childList: true });
}

function shellPalette() {
  const palette = document.getElementById('palette');
  if (!palette) return;
  const place = () => {
    const add = document.querySelector('#fbar .fpick.addmenu');
    const bar = document.getElementById('fbar');
    if (palette.hidden || !document.documentElement.classList.contains('flow-mode') || !add || !bar) {
      palette.classList.remove('dropped');
      ['left', 'top', 'bottom', 'transform', 'transformOrigin', 'maxHeight'].forEach((key) => (palette.style[key] = ''));
      return;
    }
    palette.style.animation = 'none';
    const zoom = palette.offsetHeight ? palette.getBoundingClientRect().height / palette.offsetHeight : 1;
    const width = palette.getBoundingClientRect().width;
    const at = add.getBoundingClientRect();
    const top = bar.getBoundingClientRect().bottom + 8;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, at.left));
    palette.classList.add('dropped');
    palette.style.left = `${left / zoom}px`;
    palette.style.top = `${top / zoom}px`;
    palette.style.bottom = 'auto';
    palette.style.transform = 'none';
    palette.style.transformOrigin = `${Math.max(20, at.left + at.width / 2 - left)}px 0`;
    palette.style.maxHeight = `${(window.innerHeight - top - 16) / zoom}px`;
    palette.style.animation = 'none';
    const real = palette.getBoundingClientRect();
    const scale = palette.offsetWidth ? real.width / palette.offsetWidth : 1;
    const over = real.right - (window.innerWidth - 8);
    if (over > 0) palette.style.left = `${parseFloat(palette.style.left) - over / scale}px`;
    const under = 8 - palette.getBoundingClientRect().left;
    if (under > 0) palette.style.left = `${parseFloat(palette.style.left) + under / scale}px`;
    palette.style.animation = '';
  };
  new MutationObserver(place).observe(palette, { attributes: true, attributeFilter: ['hidden'] });
  window.addEventListener('resize', place);
}

function shellRefit() {
  const again = () => {
    cancelAnimationFrame(FLOW.refitFrame);
    FLOW.refitFrame = requestAnimationFrame(() => FLOW.on && FLOW.pageInfo && flowFitPages());
  };
  document.addEventListener(
    'load',
    (event) => {
      if (event.target && event.target.tagName === 'IMG' && FLOW.root && FLOW.root.contains(event.target)) again();
    },
    true,
  );
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', again);
  const watch = new ResizeObserver(again);
  let watched = null;
  setInterval(() => {
    const dom = FLOW.editor && FLOW.editor.view && FLOW.editor.view.dom;
    if (dom && dom !== watched) {
      if (watched) watch.unobserve(watched);
      watch.observe(dom);
      watched = dom;
    }
  }, 1000);
}

function shellKeyboard() {
  const root = document.documentElement;
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') root.classList.add('kbd');
  }, true);
  window.addEventListener('mousedown', () => root.classList.remove('kbd'), true);
  window.addEventListener('keydown', (event) => {
    if (!root.classList.contains('kbd') || (event.key !== 'Enter' && event.key !== ' ')) return;
    const button = event.target.closest && event.target.closest('#fbar button, #designBtn, .fpick');
    if (!button || (typeof FLOW !== 'undefined' && FLOW.pop && FLOW.pop.contains(button))) return;
    event.preventDefault();
    event.stopPropagation();
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    requestAnimationFrame(() => {
      const pop = FLOW.pop;
      const rows = pop ? [...pop.querySelectorAll('.frow')] : [];
      if (rows.length && pop.menuMove) {
        pop.kbIndex = 0;
        pop.menuMove(rows[0]);
      }
    });
  }, true);
}

function shellPillWatch() {
  const watch = new MutationObserver(() => {
    if (FLOW.on && S.zoom === 'fit') requestAnimationFrame(() => layout());
    setTimeout(() => typeof raisePill === 'function' && raisePill(), 360);
  });
  ['panel', 'outline', 'checkSheet'].forEach((id) => {
    const node = document.getElementById(id);
    if (node) watch.observe(node, { attributes: true, attributeFilter: ['hidden'] });
  });
  setTimeout(() => {
    const sheet = document.getElementById('checkSheet');
    if (sheet) watch.observe(sheet, { attributes: true, attributeFilter: ['hidden'] });
  }, 3000);
}

function shellBetween() {
  const scroll = document.getElementById('scroll');
  if (!scroll) return;
  const plus = h('button', { type: 'button', class: 'flow-between', title: 'Add something here', tabindex: '-1', html: `<span class="flow-between-dot">${icon('plus', 15)}</span>` });
  let spot = null;
  let frame = 0;
  const hide = () => {
    spot = null;
    plus.classList.remove('on');
  };
  const blocks = () => {
    const dom = FLOW.editor && FLOW.editor.view.dom;
    return dom ? [...dom.children].filter((el) => !el.classList.contains('pg-gap') && el.offsetParent) : [];
  };
  const check = (x, y) => {
    if (!FLOW.on || !FLOW.editor || FLOW.pop || FLOW.slash || document.querySelector('#palette:not([hidden])')) return hide();
    const list = blocks();
    const sheet = FLOW.sheet && FLOW.sheet.getBoundingClientRect();
    if (!sheet || x < sheet.left || x > sheet.right) return hide();
    for (let i = 0; i < list.length - 1; i += 1) {
      const a = list[i].getBoundingClientRect();
      const b = list[i + 1].getBoundingClientRect();
      if (b.top - a.bottom > 140 || b.top < a.bottom - 2) continue;
      const mid = (a.bottom + b.top) / 2;
      if (Math.abs(y - mid) <= Math.max(7, (b.top - a.bottom) / 2 + 3)) {
        spot = list[i + 1];
        if (!plus.isConnected) document.body.append(plus);
        const zoom = parseFloat(getComputedStyle(plus).zoom) || 1;
        const left = Math.max(a.left, b.left);
        const width = Math.min(a.right, b.right) - left;
        plus.style.left = `${left / zoom}px`;
        plus.style.width = `${Math.max(40, width) / zoom}px`;
        plus.style.top = `${mid / zoom}px`;
        plus.classList.add('on');
        return;
      }
    }
    hide();
  };
  scroll.addEventListener('mousemove', (event) => {
    if (event.buttons) return hide();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => check(event.clientX, event.clientY));
  });
  scroll.addEventListener('mouseleave', (event) => {
    if (event.relatedTarget !== plus && !plus.contains(event.relatedTarget)) hide();
  });
  scroll.addEventListener('scroll', hide, { passive: true });
  window.addEventListener('keydown', hide, true);
  plus.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!spot || !FLOW.editor) return;
    const { view, state } = FLOW.editor;
    let at = null;
    state.doc.forEach((node, offset) => {
      if (at === null && view.nodeDOM(offset) === spot) at = offset;
    });
    if (at === null) return;
    const tr = state.tr.insert(at, state.schema.nodes.paragraph.create());
    view.dispatch(tr.setSelection(TT.TextSelection.create(tr.doc, at + 1)));
    view.dom.focus({ preventScroll: true });
    const anchor = plus.querySelector('.flow-between-dot');
    requestAnimationFrame(() => {
      flowAddMenu(anchor);
      hide();
    });
  });
}

const GLIDE_LISTS = [
  ['.menu-list', 'button', 'active'],
  ['.fpop-list', '.fpop-item', 'active'],
  ['.cmd-list', '.cmd-row', 'on'],
];

function glide(list, itemSelector, activeClass) {
  if (!list || list.glide) return;
  list.glide = true;
  if (getComputedStyle(list).position === 'static') list.style.position = 'relative';
  const hl = h('div', { class: 'glide-hl snap' });
  list.prepend(hl);
  list.classList.add('has-glide');
  const move = (item) => {
    if (!item || item.hidden || !item.offsetParent) {
      hl.classList.remove('on');
      return;
    }
    hl.style.width = `${item.offsetWidth}px`;
    hl.style.height = `${item.offsetHeight}px`;
    hl.style.transform = `translate(${item.offsetLeft}px, ${item.offsetTop}px)`;
    if (!hl.classList.contains('on')) {
      hl.classList.add('snap', 'on');
      requestAnimationFrame(() => requestAnimationFrame(() => hl.classList.remove('snap')));
    }
  };
  list.addEventListener('mouseover', (event) => {
    const item = event.target.closest(itemSelector);
    if (item && list.contains(item)) move(item);
  });
  list.addEventListener('mouseleave', () => move(list.querySelector(`${itemSelector}.${activeClass}`)));
  new MutationObserver(() => {
    const active = list.querySelector(`${itemSelector}.${activeClass}`);
    if (active && !list.matches(':hover')) move(active);
    if (!list.contains(hl)) list.prepend(hl);
  }).observe(list, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  requestAnimationFrame(() => move(list.querySelector(`${itemSelector}.${activeClass}`)));
}

function shellGlide() {
  const scan = (root) => {
    if (!root.querySelectorAll) return;
    GLIDE_LISTS.forEach(([listSelector, item, active]) => {
      if (root.matches && root.matches(listSelector)) glide(root, item, active);
      root.querySelectorAll(listSelector).forEach((list) => glide(list, item, active));
    });
  };
  new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => node.nodeType === 1 && scan(node)))).observe(document.body, { childList: true, subtree: true });
  scan(document.body);
}

function shellSizeKeys() {
  window.addEventListener(
    'keydown',
    (event) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey) return;
      if (event.code !== 'Period' && event.code !== 'Comma') return;
      if (typeof FLOW === 'undefined' || !FLOW.on || !FLOW.editor || !FLOW.editor.isFocused) return;
      event.preventDefault();
      event.stopPropagation();
      const sizes = FLOW_SIZES.map(Number);
      const set = (flowFmtAt().find((item) => item.key === 'size') || {}).value;
      const now = parseFloat(set) || parseFloat(S.settings && S.settings['font-size']) || 11;
      const next = event.code === 'Period' ? sizes.find((size) => size > now) : [...sizes].reverse().find((size) => size < now);
      if (!next) return;
      flowSetFmt('size', String(next));
    },
    true,
  );
}

function shellInit() {
  shellSizeKeys();
  shellGlide();
  shellBetween();
  shellPillWatch();
  shellKeyboard();
  shellRefit();
  shellPalette();
  shellDesign();
  shellDock();
  shellFitTween();
  shellPopToggle();
  shellMenus();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', shellInit);
else shellInit();
