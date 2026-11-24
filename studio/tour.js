const ARROW_STYLES = [
  { loops: [0.45], bend: 0.22, head: 'open' },
  { wiggle: [7, 3.5], bend: 0.14, head: 'barb' },
  { loops: [0.3, 0.6], bend: 0.3, head: 'open', size: 0.75 },
  { bend: 0.4, head: 'fill', dash: true },
  { loops: [0.58], wiggle: [4, 2], bend: -0.24, head: 'barb' },
  { curl: true, bend: 0.26, head: 'open' },
  { loops: [0.5], bend: -0.32, head: 'fill', size: 1.25 },
];

const TOUR_STEPS = [
  {
    title: 'This is Essay Builder',
    text: 'Write your essay on real pages. What you see here is exactly the PDF you hand in, with the cover, contents and page numbers done for you.',
    centre: true,
  },
  {
    title: 'Write on the page',
    text: 'Click any paragraph and type. Ctrl+B, Ctrl+I and Ctrl+U style what you type next.',
    show: () => tourEdit(),
    hide: () => deselect(),
    points: [() => S.edit && S.edit.ta, () => $('.fmtbar .is-bold')],
  },
  {
    title: 'Add a block',
    text: 'Tables, charts, maps, equations and more. Press ? to see an example of each one first.',
    show: () => reveal($('#palette')),
    hide: () => conceal($('#palette')),
    points: [() => [...document.querySelectorAll('#palette .palette-grid button')].find((tile) => tile.title === 'Chart'), () => $('#palette .palette-help')],
  },
  {
    title: 'Or add it right here',
    text: 'Point between two blocks and press + to add something exactly there.',
    show: () => {
      const strip = [...document.querySelectorAll('#pages .ins')].find((item) => item.getBoundingClientRect().top > 120);
      if (strip) {
        strip.classList.add('tour-show');
        TOUR.shown = strip;
      }
    },
    hide: () => TOUR.shown && TOUR.shown.classList.remove('tour-show'),
    points: [() => TOUR.shown && TOUR.shown.querySelector('.ins-plus')],
  },
  {
    title: 'Move, copy or delete',
    text: 'Drag the handle to move a block, or use the arrows, copy and bin on its bar.',
    show: () => tourEdit(),
    hide: () => deselect(),
    points: [() => $('#pages .grip'), () => unionOf(['Move up', 'Move down', 'Duplicate', 'Delete'].map((title) => $(`.fmtbar [title="${title}"]`)))],
  },
  {
    title: 'Pages',
    text: 'Add a page, duplicate one, or drag it somewhere else. A chapter that runs over several pages moves together.',
    show: () => {
      const page = [...$('#pages').children].find((item) => item.querySelector('.page-move'));
      if (!page) return;
      page.classList.add('tour-tools');
      TOUR.page = page;
      const scroll = $('#scroll');
      scroll.scrollTop += page.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 120;
    },
    hide: () => TOUR.page && TOUR.page.classList.remove('tour-tools'),
    points: [() => TOUR.page && TOUR.page.querySelector('.page-dup'), () => TOUR.page && TOUR.page.querySelector('.page-move'), () => TOUR.page && TOUR.page.querySelector('.page-add')],
  },
  {
    title: 'Select many at once',
    text: 'Drag on an empty spot to box blocks, then style or delete them together.',
    show: () => demoMarquee(),
    hide: () => endMarqueeDemo(),
    points: [() => TOUR.demo],
  },
  { title: 'Get your PDF', text: 'It saves by itself as you go. Export when you are ready.', points: [() => $('#export')] },
];

function tourEdit() {
  const range = S.ranges.find((item) => item.kind === 'para') || S.ranges.find((item) => TEXT_KINDS.has(item.kind));
  if (!range) return;
  scrollToRange(range);
  select(range);
}

const TOUR = { index: 0, root: null, demo: null, arrows: 0 };

function unionOf(items) {
  const rects = items.filter(Boolean).map((item) => item.getBoundingClientRect());
  if (!rects.length) return null;
  const left = Math.min(...rects.map((r) => r.left));
  const top = Math.min(...rects.map((r) => r.top));
  const right = Math.max(...rects.map((r) => r.right));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return { getBoundingClientRect: () => ({ left, top, right, bottom, width: right - left, height: bottom - top }) };
}

function demoMarquee() {
  const first = document.querySelector('#pages .hit[data-id]');
  if (!first) return;
  const page = first.closest('.page');
  const scroll = $('#scroll');
  scroll.scrollTop += first.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 160;
  const hits = [...page.querySelectorAll('.hit[data-id]')].slice(0, 3);
  if (!hits.length) return;
  const rects = hits.map((hit) => hit.getBoundingClientRect());
  const left = Math.min(...rects.map((r) => r.left)) - 26;
  const top = Math.min(...rects.map((r) => r.top)) - 16;
  const right = Math.max(...rects.map((r) => r.right)) - 60;
  const bottom = Math.max(...rects.map((r) => r.bottom)) + 14;
  const rect = { left, top, right, bottom, width: right - left, height: bottom - top };
  TOUR.demo = { getBoundingClientRect: () => rect };
  TOUR.demoHits = hits;
  const box = h('div', { class: 'tour-demo-box', style: `left:${left}px;top:${top}px;width:${rect.width}px;height:${rect.height}px` });
  TOUR.demoBox = box;
  document.body.append(box);
  hits.forEach((hit, index) => {
    hit.style.setProperty('--demo-delay', `${0.5 + index * 0.25}s`);
    hit.classList.add('tour-demo-hit');
  });
}

function endMarqueeDemo() {
  if (TOUR.demoBox) TOUR.demoBox.remove();
  (TOUR.demoHits || []).forEach((hit) => hit.classList.remove('tour-demo-hit'));
  TOUR.demo = TOUR.demoBox = null;
  TOUR.demoHits = [];
}

function arrowPath(a, b, side, style) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = (-dy / length) * side;
  const ny = (dx / length) * side;
  const bend = Math.max(-120, Math.min(120, length * style.bend));
  const c = { x: (a.x + b.x) / 2 + nx * bend, y: (a.y + b.y) / 2 + ny * bend };
  const radius = Math.max(10, Math.min(30, length * 0.09)) * (style.size || 1);
  const points = [];
  const total = 180;
  for (let i = 0; i <= total; i += 1) {
    const t = i / total;
    let x = (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x;
    let y = (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y;
    let tx = 2 * (1 - t) * (c.x - a.x) + 2 * t * (b.x - c.x);
    let ty = 2 * (1 - t) * (c.y - a.y) + 2 * t * (b.y - c.y);
    const size = Math.hypot(tx, ty) || 1;
    tx /= size;
    ty /= size;
    let along = 0;
    let across = 0;
    (style.loops || []).forEach((at) => {
      const u = (t - at) / 0.16;
      if (u > 0 && u < 1) {
        along += radius * Math.sin(2 * Math.PI * u);
        across += radius * (1 - Math.cos(2 * Math.PI * u)) * side;
      }
    });
    if (style.wiggle) {
      const [amp, waves] = style.wiggle;
      across += amp * Math.sin(2 * Math.PI * waves * t) * Math.sin(Math.PI * t);
    }
    if (style.curl && t < 0.22) {
      const u = t / 0.22;
      const spin = (1 - u) * radius * 0.9;
      along += spin * Math.sin(4 * Math.PI * u);
      across += spin * (1 - Math.cos(4 * Math.PI * u)) * -side;
    }
    x += tx * along - ty * across;
    y += ty * along + tx * across;
    points.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  const [px, py] = points[total - 6].split(' ').map(Number);
  let hx = b.x - px;
  let hy = b.y - py;
  const size = Math.hypot(hx, hy) || 1;
  hx /= size;
  hy /= size;
  const wing = (angle, reach = 15) => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return `${(b.x - reach * (hx * cos - hy * sin)).toFixed(1)} ${(b.y - reach * (hx * sin + hy * cos)).toFixed(1)}`;
  };
  const tip = `${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
  let head = `M ${wing(0.48)} L ${tip} L ${wing(-0.48)}`;
  if (style.head === 'barb') head = `M ${wing(0.62, 17)} Q ${wing(0.25, 8)} ${tip} M ${tip} L ${wing(-0.4, 11)}`;
  if (style.head === 'fill') head = `M ${wing(0.42, 16)} L ${tip} L ${wing(-0.42, 16)} Q ${wing(0, 10)} ${wing(0.42, 16)} Z`;
  return { line: `M ${points.join(' L ')}`, head, fill: style.head === 'fill', dash: Boolean(style.dash) };
}

function rectOf(item) {
  if (!item || !item.getBoundingClientRect) return null;
  const r = item.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  if (r.bottom < 40 || r.top > window.innerHeight - 20 || r.right < 0 || r.left > window.innerWidth) return null;
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}

function placeNote(union, noteWidth, noteHeight, width, height) {
  const pad = 24;
  const gap = 110;
  const shift = Math.min(200, width * 0.14);
  const fits = (left, top) => left >= pad && top >= pad && left + noteWidth <= width - pad && top + noteHeight <= height - pad;
  const clear = (left, top) => left + noteWidth < union.left - 20 || left > union.right + 20 || top + noteHeight < union.top - 20 || top > union.bottom + 20;
  const centre = (union.left + union.right) / 2;
  const lean = centre > width / 2 ? -shift : shift;
  const options = [
    [centre - noteWidth / 2 + lean, union.bottom + gap],
    [centre - noteWidth / 2 + lean, union.top - gap - noteHeight],
    [union.right + gap, (union.top + union.bottom) / 2 - noteHeight / 2 + 60],
    [union.left - gap - noteWidth, (union.top + union.bottom) / 2 - noteHeight / 2 + 60],
    [union.right + 50, union.bottom + 40],
    [union.left - noteWidth - 50, union.bottom + 40],
  ];
  const good = options.find(([left, top]) => fits(left, top) && clear(left, top));
  if (good) return good;
  const [left, top] = options[0];
  return [Math.max(pad, Math.min(width - noteWidth - pad, left)), Math.max(pad, Math.min(height - noteHeight - pad, top))];
}

function anchor(from, rect, outward) {
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;
  const dx = from.x - cx;
  const dy = from.y - cy;
  if (Math.abs(dy) * rect.width > Math.abs(dx) * rect.height) {
    const x = Math.max(rect.left + 14, Math.min(rect.right - 14, cx + dx * 0.25));
    return { x, y: dy < 0 ? rect.top - outward : rect.bottom + outward };
  }
  const y = Math.max(rect.top + 10, Math.min(rect.bottom - 10, cy + dy * 0.25));
  return { x: dx < 0 ? rect.left - outward : rect.right + outward, y };
}

async function paintTour() {
  const step = TOUR_STEPS[TOUR.index];
  const root = TOUR.root;
  if (!root) return;
  root.replaceChildren();
  if (step.centre) return paintCentre(step);
  if (step.show) step.show();
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const measure = () => step.points.map((get) => rectOf(get())).filter(Boolean);
  let rects = measure();
  for (let tries = 0; tries < 24; tries += 1) {
    await wait(tries ? 70 : 260);
    if (!TOUR.root || TOUR_STEPS[TOUR.index] !== step) return;
    const next = measure();
    const same = next.length === rects.length && next.every((r, i) => Math.abs(r.top - rects[i].top) < 0.5 && Math.abs(r.left - rects[i].left) < 0.5);
    rects = next;
    if (same && tries) break;
  }
  if (!rects.length) return nextTour();
  const width = window.innerWidth;
  const height = window.innerHeight;
  const holes = rects.map((r) => ({ left: r.left - 8, top: r.top - 8, width: r.width + 16, height: Math.min(r.height, height * 0.6) + 16 }));
  const union = {
    left: Math.min(...holes.map((r) => r.left)),
    top: Math.min(...holes.map((r) => r.top)),
    right: Math.max(...holes.map((r) => r.left + r.width)),
    bottom: Math.max(...holes.map((r) => r.top + r.height)),
  };
  const note = tourNote(step);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'tour-arrow');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  const cut = holes.map((r) => `<rect x="${r.left}" y="${r.top}" width="${r.width}" height="${r.height}" rx="14" fill="#000"/>`).join('');
  const ring = holes.map((r) => `<rect class="tour-ring" x="${r.left}" y="${r.top}" width="${r.width}" height="${r.height}" rx="14"/>`).join('');
  svg.innerHTML = `<defs><mask id="tourMask"><rect width="100%" height="100%" fill="#fff"/>${cut}</mask></defs><rect class="tour-dim" width="100%" height="100%" mask="url(#tourMask)"/>${ring}`;
  root.append(svg, note);
  const noteWidth = note.offsetWidth;
  const noteHeight = note.offsetHeight;
  const [left, top] = placeNote(union, noteWidth, noteHeight, width, height);
  note.style.left = `${left}px`;
  note.style.top = `${top}px`;
  const noteBox = { left, top, right: left + noteWidth, bottom: top + noteHeight, width: noteWidth, height: noteHeight };
  const noteCentre = { x: left + noteWidth / 2, y: top + noteHeight / 2 };
  holes.forEach((hole, index) => {
    const rect = { left: hole.left, top: hole.top, right: hole.left + hole.width, bottom: hole.top + hole.height, width: hole.width, height: hole.height };
    const end = anchor(noteCentre, rect, 8);
    const start = anchor(end, noteBox, 10);
    const spread = (index - (holes.length - 1) / 2) * noteWidth * 0.32;
    if (Math.abs(start.y - noteBox.top) < 12 || Math.abs(start.y - noteBox.bottom) < 12) start.x = Math.max(noteBox.left + 20, Math.min(noteBox.right - 20, noteCentre.x + spread));
    const style = ARROW_STYLES[(TOUR.index * 2 + index) % ARROW_STYLES.length];
    const side = (start.x < end.x) === (start.y < end.y) ? 1 : -1;
    const path = arrowPath(start, end, index % 2 ? -side : side, style);
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('class', `tour-line${path.dash ? ' dash' : ''}`);
    const head = `<path class="${path.fill ? 'filled' : ''}" d="${path.head}"/>`;
    group.innerHTML = `<g class="halo"><path d="${path.line}"/>${head}</g><g class="ink"><path d="${path.line}"/>${head}</g>`;
    svg.append(group);
  });
}

function tourNote(step, extra) {
  const last = TOUR.index === TOUR_STEPS.length - 1;
  return h(
    'div',
    { class: `tour-note${extra ? ` ${extra}` : ''}`, style: `rotate:${TOUR.index % 2 ? 1.4 : -1.6}deg` },
    extra ? h('img', { class: 'tour-logo', src: 'logo.png', alt: '' }) : null,
    h('div', { class: 'tour-title', text: step.title }),
    h('div', { class: 'tour-text', text: step.text }),
    h(
      'div',
      { class: 'tour-foot' },
      h('div', { class: 'tour-dots' }, ...TOUR_STEPS.map((_, index) => h('span', { class: index === TOUR.index ? 'on' : '' }))),
      last ? null : h('button', { type: 'button', class: 'tour-skip', text: 'Skip', onclick: endTour }),
      h('button', { type: 'button', class: 'tour-next', text: last ? 'Got it' : TOUR.index ? 'Next' : 'Show me', onclick: nextTour }),
    ),
  );
}

function paintCentre(step) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'tour-arrow');
  svg.setAttribute('width', window.innerWidth);
  svg.setAttribute('height', window.innerHeight);
  svg.innerHTML = '<rect class="tour-dim" width="100%" height="100%"/>';
  const note = tourNote(step, 'welcome');
  TOUR.root.replaceChildren(svg, note);
  note.style.left = `${(window.innerWidth - note.offsetWidth) / 2}px`;
  note.style.top = `${(window.innerHeight - note.offsetHeight) / 2}px`;
}

function leaveStep() {
  const step = TOUR_STEPS[TOUR.index];
  if (step && step.hide) step.hide();
}

function nextTour() {
  if (TOUR.index >= TOUR_STEPS.length - 1) return endTour();
  leaveStep();
  TOUR.index += 1;
  paintTour();
}

function endTour() {
  leaveStep();
  localStorage.setItem('studio.toured', '1');
  if (TOUR.root) TOUR.root.remove();
  TOUR.root = null;
  window.removeEventListener('resize', paintTour);
  document.removeEventListener('keydown', tourKeys, true);
}

function tourKeys(event) {
  if (!TOUR.root) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Escape') endTour();
  else if (event.key === 'ArrowRight' || event.key === 'Enter') nextTour();
  else if (event.key === 'ArrowLeft' && TOUR.index > 0) {
    leaveStep();
    TOUR.index -= 1;
    paintTour();
  }
}

function startTour(again = false) {
  if (TOUR.root || TOUR.picker || (!again && localStorage.getItem('studio.toured')) || !S.pages.length) return;
  TOUR.index = 0;
  TOUR.root = h('div', { class: 'tour' });
  TOUR.root.addEventListener('mousedown', (event) => {
    if (!event.target.closest('.tour-note')) event.preventDefault();
  });
  document.body.append(TOUR.root);
  window.addEventListener('resize', paintTour);
  document.addEventListener('keydown', tourKeys, true);
  paintTour();
}

function pickTheme() {
  if (localStorage.getItem('studio.themed') || TOUR.picker) return;
  const tiles = THEMES.map((theme) => {
    const tile = h(
      'button',
      { type: 'button', class: `theme-tile${UI.theme === theme.id ? ' on' : ''}`, style: `--mat:${theme.mat};--paper:${theme.paper};--ink:${theme.ink}` },
      h('span', { class: 'theme-mock' }, h('span', { class: 'theme-sheet' }, h('i'), h('i'), h('i'))),
      h('span', { class: 'theme-name', text: theme.name }),
    );
    tile.addEventListener('click', () => {
      UI.theme = theme.id;
      applyAppearance();
      tiles.forEach((item) => item.classList.toggle('on', item === tile));
    });
    return tile;
  });
  const done = () => {
    localStorage.setItem('studio.themed', '1');
    TOUR.picker.remove();
    TOUR.picker = null;
    if (S.pages.length) startTour();
  };
  TOUR.picker = h(
    'div',
    { class: 'tour theme-pick' },
    h(
      'div',
      { class: 'theme-card' },
      h('div', { class: 'tour-title', text: 'Pick your look' }),
      h('div', { class: 'theme-grid' }, ...tiles),
      h('div', { class: 'tour-foot' }, h('span', { class: 'theme-later', text: 'You can change it any time in Theme.' }), h('button', { type: 'button', class: 'tour-next', text: 'Continue', onclick: done })),
    ),
  );
  document.body.append(TOUR.picker);
}
