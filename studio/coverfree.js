const CV_FIELDS = [
  ['question', 'Question'],
  ['title', 'Title'],
  ['subject', 'Subject'],
  ['subtitle', 'Subtitle'],
  ['author', 'Author'],
  ['candidate', 'Candidate'],
  ['school', 'School'],
  ['supervisor', 'Supervisor'],
  ['session', 'Session'],
  ['course', 'Course'],
  ['date', 'Date'],
  ['words', 'Word count'],
];

CV_FIELDS.unshift(CV_FIELDS.pop());

const CV_NUMBERS = ['x', 'y', 'w', 'h', 'size', 'spacing', 'bw', 'radius', 'line', 'weight', 'opacity', 'rot'];
const CV_TEXTS = ['color', 'bg', 'border', 'font', 'align', 'valign', 'fit'];
const CV_FLAGS = ['bold', 'italic', 'underline', 'upper'];

const CV = { boxes: [], sel: -1, scale: 1, history: [], future: [], root: null, page: null, inspector: null, editing: null, guides: [] };

function cvParse(raw) {
  const first = raw.indexOf('|');
  if (first < 0) return null;
  const second = raw.indexOf('|', first + 1);
  const kind = raw.slice(0, first).trim().toLowerCase();
  const attrs = second < 0 ? raw.slice(first + 1) : raw.slice(first + 1, second);
  const text = second < 0 ? '' : raw.slice(second + 1).trim().replace(/\\n/g, '\n');
  const box = { kind, p: {}, text };
  for (const match of attrs.matchAll(/(\w+)=("[^"]*"|\S+)/g)) box.p[match[1].toLowerCase()] = match[2].replace(/^"|"$/g, '');
  const bare = attrs.replace(/(\w+)=("[^"]*"|\S+)/g, ' ');
  CV_FLAGS.forEach((flag) => {
    if (new RegExp(`(^|\\s)${flag}(\\s|$)`).test(bare)) box.p[flag] = '1';
  });
  return box;
}

function cvLine(box) {
  const parts = [];
  [...CV_NUMBERS, ...CV_TEXTS].forEach((key) => {
    const value = box.p[key];
    if (value === undefined || value === '') return;
    const shown = CV_NUMBERS.includes(key) ? String(Math.round(Number(value) * 100) / 100) : /\s/.test(value) ? `"${value}"` : value;
    parts.push(`${key}=${shown}`);
  });
  CV_FLAGS.forEach((flag) => {
    if (box.p[flag]) parts.push(flag);
  });
  const text = box.text.replace(/\n/g, '\\n').replace(/\|/g, '/');
  return `${box.kind} | ${parts.join(' ')} | ${text}`;
}

function cvLoad() {
  const all = lines();
  const found = [];
  if (S.front) {
    for (let i = S.front[0] - 1; i <= S.front[1] - 1 && i < all.length; i += 1) {
      const match = (all[i] || '').match(/^cover-box\s*:\s*(.*)$/i);
      if (match) found.push(match[1]);
    }
  }
  CV.boxes = found.map(cvParse).filter(Boolean);
}

function setHeaderLines(key, values) {
  const all = lines();
  const pattern = new RegExp(`^${key}\\s*:`, 'i');
  const make = values.map((value) => `${key}: ${value}`);
  let delta = 0;
  if (!S.front) {
    if (!make.length) return;
    all.unshift(...make, '---', '');
    delta = make.length + 2;
    S.front = [1, make.length + 1];
  } else {
    const [first, last] = S.front;
    let spot = null;
    for (let i = last - 1; i >= first - 1; i -= 1) {
      if (pattern.test(all[i])) {
        all.splice(i, 1);
        spot = i;
        delta -= 1;
      }
    }
    const ends = all[last - 1 + delta] !== undefined && all[last - 1 + delta].trim() === '---';
    const at = spot !== null ? spot : ends ? last - 1 + delta : last + delta;
    all.splice(at, 0, ...make);
    delta += make.length;
    S.front = [first, last + delta];
  }
  S.source = all.join('\n');
  if (delta) S.ranges.forEach((range) => {
    range.start += delta;
    range.end += delta;
  });
  lockHits();
  schedule(400);
}

function cvSave() {
  setHeaderLines('cover-box', CV.boxes.map(cvLine));
}

function cvSnapshot() {
  CV.history.push(JSON.stringify(CV.boxes));
  if (CV.history.length > 80) CV.history.shift();
  CV.future = [];
}

function cvRestore(from, to) {
  if (!from.length) return;
  to.push(JSON.stringify(CV.boxes));
  CV.boxes = JSON.parse(from.pop());
  CV.sel = Math.min(CV.sel, CV.boxes.length - 1);
  cvSave();
  cvDraw();
}

function cvPage() {
  const first = S.pages && S.pages[0];
  return first ? { w: first.w, h: first.h } : { w: 595.3, h: 841.9 };
}

function cvNum(box, key, fallback) {
  const value = Number(box.p[key]);
  return Number.isFinite(value) && box.p[key] !== undefined && box.p[key] !== '' ? value : fallback;
}

function cvFieldValue(key) {
  if (key === 'words') return String(S.words || 0);
  if (key === 'question') return headerValue('question') || headerValue('title');
  return headerValue(key);
}

function cvShow(box) {
  return box.text.replace(/\{(\w+)\}/g, (all, key) => {
    const field = CV_FIELDS.find((item) => item[0] === key);
    if (!field) return all;
    return cvFieldValue(key) || field[1];
  });
}

function cvStyle(el, box) {
  const page = cvPage();
  const px = CV.scale;
  const { p } = box;
  const style = el.style;
  style.left = `${cvNum(box, 'x', 10)}%`;
  style.top = `${cvNum(box, 'y', 10)}%`;
  style.width = p.w !== undefined && p.w !== '' ? `${cvNum(box, 'w', 30)}%` : '';
  style.height = p.h !== undefined && p.h !== '' ? `${cvNum(box, 'h', 10)}%` : box.kind === 'line' ? '0' : '';
  style.fontSize = `${cvNum(box, 'size', 12) * px}px`;
  style.letterSpacing = p.spacing ? `${cvNum(box, 'spacing', 0) * px}px` : '';
  style.lineHeight = p.line ? String(cvNum(box, 'line', 1.3)) : '';
  style.fontWeight = p.bold ? '700' : p.weight || '';
  style.fontStyle = p.italic ? 'italic' : '';
  style.textDecoration = p.underline ? 'underline' : '';
  style.textTransform = p.upper ? 'uppercase' : '';
  style.textAlign = p.align || '';
  style.justifyContent = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[p.valign] || '';
  style.color = box.kind === 'text' ? p.color || '' : '';
  style.opacity = p.opacity !== undefined && p.opacity !== '' ? p.opacity : '';
  style.transform = p.rot ? `rotate(${cvNum(box, 'rot', 0)}deg)` : '';
  style.fontFamily = p.font ? `"${p.font}", ${docFont()}` : '';
  if (box.kind === 'rect' || box.kind === 'ellipse') {
    style.background = p.bg || '';
    style.borderRadius = box.kind === 'ellipse' ? '50%' : p.radius ? `${cvNum(box, 'radius', 0) * px}px` : '';
  }
  if (box.kind === 'line') {
    style.borderTopColor = p.border || p.bg || '';
    style.borderTopWidth = `${cvNum(box, 'bw', 1.5) * px}px`;
  } else if (p.border || p.bw) {
    style.borderStyle = 'solid';
    style.borderColor = p.border || '';
    style.borderWidth = `${cvNum(box, 'bw', 1) * px}px`;
  } else {
    style.borderStyle = '';
  }
  return page;
}

function cvElement(box, index) {
  const el = h('div', { class: `cvb cvb-${box.kind}`, 'data-i': index });
  if (box.kind === 'text') {
    const shown = cvShow(box);
    el.textContent = shown;
    if (!shown) el.classList.add('empty');
  } else if (box.kind === 'image') {
    if (box.text) el.append(h('img', { src: fileUrl(box.text), draggable: 'false', style: `object-fit:${box.p.fit || 'cover'}` }));
    else el.classList.add('empty');
  }
  cvStyle(el, box);
  el.addEventListener('pointerdown', (event) => cvDown(event, index));
  el.addEventListener('dblclick', () => {
    if (box.kind === 'text') cvEditText(index);
  });
  return el;
}

function cvEditText(index) {
  const box = CV.boxes[index];
  const el = CV.page.querySelector(`.cvb[data-i="${index}"]`);
  if (!el) return;
  CV.editing = index;
  el.classList.add('typing');
  el.classList.remove('empty');
  el.contentEditable = 'plaintext-only';
  el.textContent = box.text;
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  el.onblur = () => {
    const value = el.innerText.replace(/\r/g, '').replace(/\n+$/, '');
    CV.editing = null;
    if (value !== box.text) {
      cvSnapshot();
      box.text = value;
      cvSave();
    }
    cvDraw();
  };
}

function cvDraw() {
  if (!CV.root) return;
  const page = cvPage();
  const stage = CV.root.querySelector('.cvs-stage');
  const room = { w: stage.clientWidth - 60, h: stage.clientHeight - 60 };
  const scale = Math.max(0.2, Math.min(room.h / page.h, room.w / page.w));
  CV.scale = scale;
  const canvas = CV.page;
  canvas.style.width = `${page.w * scale}px`;
  canvas.style.height = `${page.h * scale}px`;
  canvas.style.background = headerValue('cover-color') || '#ffffff';
  canvas.replaceChildren();
  CV.boxes.forEach((box, index) => canvas.append(cvElement(box, index)));
  cvSelection();
  cvInspect();
}

function cvBounds(index) {
  const el = CV.page.querySelector(`.cvb[data-i="${index}"]`);
  if (!el) return null;
  return { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight, rot: cvNum(CV.boxes[index], 'rot', 0) };
}

function cvSelection() {
  CV.page.querySelectorAll('.cvsel, .cvguide').forEach((node) => node.remove());
  if (CV.sel < 0 || !CV.boxes[CV.sel] || CV.editing !== null) return;
  const bounds = cvBounds(CV.sel);
  if (!bounds) return;
  const line = CV.boxes[CV.sel].kind === 'line';
  const frame = h('div', { class: `cvsel${line ? ' line' : ''}`, style: `left:${bounds.left}px;top:${bounds.top}px;width:${bounds.width}px;height:${bounds.height}px;transform:rotate(${bounds.rot}deg)` });
  (line ? ['w', 'e'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']).forEach((side) => {
    const dot = h('span', { class: `cvh cvh-${side}` });
    dot.addEventListener('pointerdown', (event) => cvResize(event, side));
    frame.append(dot);
  });
  const turn = h('span', { class: 'cvrot', title: 'Rotate (Shift: 15° steps, double-click: reset)' });
  turn.addEventListener('pointerdown', (event) => cvRotate(event));
  turn.addEventListener('dblclick', (event) => {
    event.stopPropagation();
    const box = CV.boxes[CV.sel];
    if (!box || !box.p.rot) return;
    cvSnapshot();
    delete box.p.rot;
    cvSave();
    cvDraw();
  });
  frame.append(turn);
  CV.page.append(frame);
}

function cvGuides(lines) {
  CV.page.querySelectorAll('.cvguide').forEach((node) => node.remove());
  lines.forEach((guide) => {
    const el = h('div', { class: `cvguide ${guide.axis} ${guide.kind || ''}`, style: guide.axis === 'v' ? `left:${guide.at}%` : `top:${guide.at}%` });
    CV.page.append(el);
  });
}

function cvBadge(text) {
  let badge = CV.page.querySelector('.cvbadge');
  if (!text) {
    if (badge) badge.remove();
    return;
  }
  const bounds = cvBounds(CV.sel);
  if (!bounds) return;
  if (!badge) {
    badge = h('div', { class: 'cvbadge' });
    CV.page.append(badge);
  }
  badge.textContent = text;
  badge.style.left = `${bounds.left + bounds.width / 2}px`;
  badge.style.top = `${bounds.top + bounds.height + 14}px`;
}

function cvMmOf(percent, axis) {
  const page = cvPage();
  return cvMm((percent / 100) * (axis === 'x' ? page.w : page.h));
}

function cvTargets(index) {
  const rect = CV.page.getBoundingClientRect();
  const page = cvPage();
  const mx = (marginPt() / page.w) * 100;
  const my = (marginPt() / page.h) * 100;
  const xs = [{ at: 0, kind: 'edge' }, { at: 50, kind: 'centre' }, { at: 100, kind: 'edge' }, { at: mx, kind: 'margin' }, { at: 100 - mx, kind: 'margin' }];
  const ys = [{ at: 0, kind: 'edge' }, { at: 50, kind: 'centre' }, { at: 100, kind: 'edge' }, { at: my, kind: 'margin' }, { at: 100 - my, kind: 'margin' }];
  CV.boxes.forEach((item, i) => {
    if (i === index) return;
    const bounds = cvBounds(i);
    if (!bounds) return;
    const l = (bounds.left / rect.width) * 100;
    const t = (bounds.top / rect.height) * 100;
    const w = (bounds.width / rect.width) * 100;
    const hh = (bounds.height / rect.height) * 100;
    xs.push({ at: l, kind: 'box' }, { at: l + w / 2, kind: 'box' }, { at: l + w, kind: 'box' });
    ys.push({ at: t, kind: 'box' }, { at: t + hh / 2, kind: 'box' }, { at: t + hh, kind: 'box' });
  });
  return { xs, ys };
}

function cvBest(edges, targets, limit) {
  let best = null;
  edges.forEach((edge, k) => {
    targets.forEach((target) => {
      const gap = Math.abs(target.at - edge);
      if (gap <= limit && (best === null || gap < best.gap)) best = { gap, k, at: target.at, kind: target.kind, shift: target.at - edge };
    });
  });
  return best;
}

function cvSnap(value, candidates, limit) {
  let best = null;
  candidates.forEach((candidate) => {
    const gap = Math.abs(candidate - value);
    if (gap <= limit && (best === null || gap < best.gap)) best = { gap, at: candidate };
  });
  return best;
}

function cvPoint(event) {
  const rect = CV.page.getBoundingClientRect();
  return { x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 };
}

function cvDown(event, index) {
  if (CV.editing !== null) {
    if (CV.editing === index) return;
    document.activeElement.blur();
  }
  event.preventDefault();
  event.stopPropagation();
  let snapshotted = false;
  if (event.altKey && CV.boxes[index]) {
    cvSnapshot();
    snapshotted = true;
    CV.boxes.push(JSON.parse(JSON.stringify(CV.boxes[index])));
    index = CV.boxes.length - 1;
    CV.sel = index;
    cvDraw();
  }
  CV.sel = index;
  const box = CV.boxes[index];
  const start = cvPoint(event);
  const origin = { x: cvNum(box, 'x', 10), y: cvNum(box, 'y', 10) };
  const size = cvBounds(index);
  const rect = CV.page.getBoundingClientRect();
  const width = (size.width / rect.width) * 100;
  const height = (size.height / rect.height) * 100;
  const targets = cvTargets(index);
  let moved = false;
  cvSelection();
  cvInspect();
  const move = (e) => {
    const now = cvPoint(e);
    let x = origin.x + now.x - start.x;
    let y = origin.y + now.y - start.y;
    if (!moved && Math.abs(now.x - start.x) + Math.abs(now.y - start.y) < 0.4) return;
    const lock = e.shiftKey || e.ctrlKey;
    const horizontal = Math.abs(now.x - start.x) * rect.width >= Math.abs(now.y - start.y) * rect.height;
    if (lock) {
      if (horizontal) y = origin.y;
      else x = origin.x;
    }
    moved = true;
    if (!snapshotted) {
      cvSnapshot();
      snapshotted = true;
    }
    const guides = [];
    if (!lock || horizontal) {
      const best = cvBest([x, x + width / 2, x + width], targets.xs, (6 / rect.width) * 100);
      if (best) {
        x += best.shift;
        guides.push({ axis: 'v', at: best.at, kind: best.kind });
      }
    }
    if (!lock || !horizontal) {
      const best = cvBest([y, y + height / 2, y + height], targets.ys, (6 / rect.height) * 100);
      if (best) {
        y += best.shift;
        guides.push({ axis: 'h', at: best.at, kind: best.kind });
      }
    }
    if (lock) guides.push(horizontal ? { axis: 'h', at: y + height / 2, kind: 'lock' } : { axis: 'v', at: x + width / 2, kind: 'lock' });
    box.p.x = String(Math.round(x * 100) / 100);
    box.p.y = String(Math.round(y * 100) / 100);
    const el = CV.page.querySelector(`.cvb[data-i="${index}"]`);
    el.style.left = `${box.p.x}%`;
    el.style.top = `${box.p.y}%`;
    cvSelection();
    cvGuides(guides);
    cvBadge(`X ${cvMmOf(x, 'x')}  Y ${cvMmOf(y, 'y')} mm`);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    CV.page.querySelectorAll('.cvguide').forEach((node) => node.remove());
    cvBadge(null);
    if (moved || snapshotted) {
      cvSave();
      cvInspect();
    }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function cvResize(event, side) {
  event.preventDefault();
  event.stopPropagation();
  const index = CV.sel;
  const box = CV.boxes[index];
  const bounds = cvBounds(index);
  const rect = CV.page.getBoundingClientRect();
  const W = rect.width;
  const H = rect.height;
  const start = { x: event.clientX, y: event.clientY };
  const o = { l: bounds.left, t: bounds.top, w: bounds.width, h: Math.max(bounds.height, 1) };
  const ratio = o.w / o.h;
  const size = cvNum(box, 'size', 12);
  const sized = box.p.h !== undefined && box.p.h !== '';
  const targets = cvTargets(index);
  const round = (value) => String(Math.round(value * 100) / 100);
  cvSnapshot();
  const move = (e) => {
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const centre = e.ctrlKey || e.metaKey;
    const square = e.shiftKey && box.kind !== 'line';
    const k = centre ? 2 : 1;
    let w = o.w;
    let hh = o.h;
    if (side.includes('e')) w = o.w + dx * k;
    if (side.includes('w')) w = o.w - dx * k;
    if (side.includes('s')) hh = o.h + dy * k;
    if (side.includes('n')) hh = o.h - dy * k;
    const guides = [];
    if (!centre && !square && !e.altKey) {
      if (side.includes('e') || side.includes('w')) {
        const edge = side.includes('e') ? ((o.l + w) / W) * 100 : ((o.l + o.w - w) / W) * 100;
        const best = cvBest([edge], targets.xs, (6 / W) * 100);
        if (best) {
          w += (side.includes('e') ? best.shift : -best.shift) * (W / 100);
          guides.push({ axis: 'v', at: best.at, kind: best.kind });
        }
      }
      if (side.includes('n') || side.includes('s')) {
        const edge = side.includes('s') ? ((o.t + hh) / H) * 100 : ((o.t + o.h - hh) / H) * 100;
        const best = cvBest([edge], targets.ys, (6 / H) * 100);
        if (best) {
          hh += (side.includes('s') ? best.shift : -best.shift) * (H / 100);
          guides.push({ axis: 'h', at: best.at, kind: best.kind });
        }
      }
    }
    if (square) {
      if (side.length === 2) {
        const scale = Math.max(w / o.w, hh / o.h);
        w = o.w * scale;
        hh = o.h * scale;
      } else if (side === 'e' || side === 'w') hh = w / ratio;
      else w = hh * ratio;
    }
    w = Math.max(6, w);
    hh = Math.max(4, hh);
    let l = o.l;
    let t = o.t;
    if (centre) {
      l = o.l + (o.w - w) / 2;
      t = o.t + (o.h - hh) / 2;
    } else {
      if (side.includes('w')) l = o.l + o.w - w;
      if (side.includes('n')) t = o.t + o.h - hh;
      if (square && (side === 'e' || side === 'w')) t = o.t + (o.h - hh) / 2;
      if (square && (side === 'n' || side === 's')) l = o.l + (o.w - w) / 2;
    }
    box.p.x = round((l / W) * 100);
    box.p.y = round((t / H) * 100);
    const text = box.kind === 'text';
    if (side.includes('e') || side.includes('w') || square || !text) box.p.w = round((w / W) * 100);
    if (text && square) {
      box.p.size = String(Math.max(4, Math.round(size * (w / o.w) * 10) / 10));
      if (sized) box.p.h = round((hh / H) * 100);
    } else if (side.includes('n') || side.includes('s') || !text) box.p.h = round((hh / H) * 100);
    if (box.kind === 'line') delete box.p.h;
    const el = CV.page.querySelector(`.cvb[data-i="${index}"]`);
    cvStyle(el, box);
    cvSelection();
    cvGuides(guides);
    const label = box.kind === 'line' ? `${cvMmOf((w / W) * 100, 'x')} mm` : `${cvMmOf((w / W) * 100, 'x')} × ${cvMmOf((el.offsetHeight / H) * 100, 'y')} mm`;
    cvBadge(text && square ? `${label} · ${box.p.size} pt` : label);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    CV.page.querySelectorAll('.cvguide').forEach((node) => node.remove());
    cvBadge(null);
    cvSave();
    cvInspect();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function cvRotate(event) {
  event.preventDefault();
  event.stopPropagation();
  const index = CV.sel;
  const box = CV.boxes[index];
  const el = CV.page.querySelector(`.cvb[data-i="${index}"]`);
  if (!box || !el) return;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  cvSnapshot();
  const move = (e) => {
    let angle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
    if (e.shiftKey) angle = Math.round(angle / 15) * 15;
    angle = (((Math.round(angle * 10) / 10) % 360) + 360) % 360;
    if (angle > 180) angle -= 360;
    if (Math.abs(angle) < 0.05) delete box.p.rot;
    else box.p.rot = String(angle);
    cvStyle(el, box);
    cvSelection();
    cvBadge(`${Math.round(angle)}°`);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    cvBadge(null);
    cvSave();
    cvInspect();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function cvOrderTo(front) {
  const index = CV.sel;
  if (index < 0) return;
  const target = front ? CV.boxes.length - 1 : 0;
  if (index === target) return;
  cvSnapshot();
  const [box] = CV.boxes.splice(index, 1);
  if (front) CV.boxes.push(box);
  else CV.boxes.unshift(box);
  CV.sel = target;
  cvSave();
  cvDraw();
}

function cvShortcut(event) {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  const box = CV.boxes[CV.sel];
  const stop = () => {
    event.preventDefault();
    event.stopPropagation();
  };
  if (mod && (key === 'c' || key === 'x') && box) {
    stop();
    CV.clip = JSON.stringify(box);
    CV.pasted = 0;
    if (key === 'x') cvDelete();
    return true;
  }
  if (mod && key === 'v' && CV.clip) {
    stop();
    cvSnapshot();
    CV.pasted = (CV.pasted || 0) + 1;
    const copy = JSON.parse(CV.clip);
    copy.p.x = String(cvNum(copy, 'x', 10) + 3 * CV.pasted);
    copy.p.y = String(cvNum(copy, 'y', 10) + 3 * CV.pasted);
    CV.boxes.push(copy);
    CV.sel = CV.boxes.length - 1;
    cvSave();
    cvDraw();
    return true;
  }
  if (event.key === 'Tab' && CV.boxes.length) {
    stop();
    const n = CV.boxes.length;
    CV.sel = CV.sel < 0 ? 0 : (CV.sel + (event.shiftKey ? -1 : 1) + n) % n;
    cvDraw();
    return true;
  }
  if (!box || !mod) return false;
  if (event.code === 'BracketRight' || event.code === 'BracketLeft') {
    stop();
    const forward = event.code === 'BracketRight';
    if (event.shiftKey) cvOrderTo(forward);
    else cvOrder(forward ? 1 : -1);
    return true;
  }
  if (box.kind !== 'text') return false;
  const flags = { b: 'bold', i: 'italic', u: 'underline' };
  const aligns = { l: '', e: 'center', r: 'right', j: 'justify' };
  if (!event.shiftKey && flags[key]) {
    stop();
    cvSnapshot();
    if (box.p[flags[key]]) delete box.p[flags[key]];
    else box.p[flags[key]] = '1';
    cvSave();
    cvDraw();
    return true;
  }
  if (!event.shiftKey && key in aligns) {
    stop();
    cvSnapshot();
    if (aligns[key]) box.p.align = aligns[key];
    else delete box.p.align;
    cvSave();
    cvDraw();
    return true;
  }
  if (event.shiftKey && (event.code === 'Period' || event.code === 'Comma')) {
    stop();
    cvSnapshot();
    const now = cvNum(box, 'size', 12);
    box.p.size = String(Math.max(4, Math.round((event.code === 'Period' ? now + 1 : now - 1) * 10) / 10));
    cvSave();
    cvDraw();
    return true;
  }
  return false;
}

function cvAdd(box, edit = false) {
  cvSnapshot();
  CV.boxes.push(box);
  CV.sel = CV.boxes.length - 1;
  cvSave();
  cvDraw();
  if (edit && box.kind === 'text') cvEditText(CV.sel);
}

function cvTextBox(text, extra = {}) {
  return { kind: 'text', p: { x: '15', y: '40', w: '70', size: '24', align: 'center', ...extra }, text };
}

function cvAddImage() {
  pickFile('image/*').then(async (file) => {
    if (!file) return;
    const path = await upload(file);
    if (path) cvAdd({ kind: 'image', p: { x: '25', y: '20', w: '50', h: '30', fit: 'cover' }, text: path });
  });
}

function cvDelete() {
  if (CV.sel < 0) return;
  cvSnapshot();
  CV.boxes.splice(CV.sel, 1);
  CV.sel = -1;
  cvSave();
  cvDraw();
}

function cvDuplicate() {
  if (CV.sel < 0) return;
  cvSnapshot();
  const copy = JSON.parse(JSON.stringify(CV.boxes[CV.sel]));
  copy.p.x = String(cvNum(copy, 'x', 10) + 3);
  copy.p.y = String(cvNum(copy, 'y', 10) + 3);
  CV.boxes.push(copy);
  CV.sel = CV.boxes.length - 1;
  cvSave();
  cvDraw();
}

function cvOrder(direction) {
  const index = CV.sel;
  const target = index + direction;
  if (index < 0 || target < 0 || target >= CV.boxes.length) return;
  cvSnapshot();
  [CV.boxes[index], CV.boxes[target]] = [CV.boxes[target], CV.boxes[index]];
  CV.sel = target;
  cvSave();
  cvDraw();
}

function cvSet(key, value) {
  const box = CV.boxes[CV.sel];
  if (!box) return;
  cvSnapshot();
  if (value === '' || value === null || value === false) delete box.p[key];
  else box.p[key] = value === true ? '1' : String(value);
  cvSave();
  const el = CV.page.querySelector(`.cvb[data-i="${CV.sel}"]`);
  if (el) cvStyle(el, box);
  cvSelection();
}

const CV_TEMPLATES = [
  {
    name: 'Question',
    boxes: () => [cvTextBox('{question}', { x: '12', y: '34', w: '76', size: '30', bold: '1', font: '' })],
  },
  {
    name: 'Classic',
    boxes: () => [
      cvTextBox('{subject}', { x: '10', y: '10', w: '80', size: '15', bold: '1', spacing: '0.5' }),
      cvTextBox('{question}', { x: '10', y: '38', w: '80', size: '26', bold: '1' }),
      cvTextBox('{author}\n{session}', { x: '10', y: '82', w: '80', size: '12', color: '#5d5d58' }),
    ],
  },
  {
    name: 'Banner',
    boxes: () => [
      { kind: 'rect', p: { x: '0', y: '0', w: '100', h: '46', bg: '#1f4e79' }, text: '' },
      cvTextBox('{subject}', { x: '9', y: '8', w: '82', size: '12', color: '#ffffff', align: 'left', upper: '1', spacing: '1.5' }),
      cvTextBox('{question}', { x: '9', y: '20', w: '82', h: '22', size: '28', bold: '1', color: '#ffffff', align: 'left', valign: 'bottom' }),
      cvTextBox('{author}\n{school}\n{session}', { x: '9', y: '78', w: '82', size: '12', align: 'left' }),
    ],
  },
  {
    name: 'Side bar',
    boxes: () => [
      { kind: 'rect', p: { x: '0', y: '0', w: '30', h: '100', bg: '#1f4e79' }, text: '' },
      cvTextBox('{subject}', { x: '4', y: '8', w: '22', size: '13', bold: '1', color: '#ffffff', align: 'left' }),
      cvTextBox('{question}', { x: '36', y: '30', w: '57', size: '26', bold: '1', align: 'left' }),
      cvTextBox('{author}\n{session}', { x: '4', y: '82', w: '22', size: '11', color: '#ffffff', align: 'left' }),
    ],
  },
  {
    name: 'Blank',
    boxes: () => [],
  },
];

function cvApplyTemplate(template) {
  cvSnapshot();
  CV.boxes = template.boxes();
  CV.sel = -1;
  cvSave();
  cvDraw();
}

function cvMm(points) {
  return Math.round((points * 25.4) / 72 * 10) / 10;
}

function cvMmField(label, key, axis) {
  const box = CV.boxes[CV.sel];
  const page = cvPage();
  const bounds = cvBounds(CV.sel);
  const whole = axis === 'x' ? page.w : page.h;
  const size = axis === 'x' ? 'w' : 'h';
  const current = key === 'x' || key === 'y' ? cvNum(box, key, 0) : cvNum(box, key, ((axis === 'x' ? bounds.width : bounds.height) / CV.scale / whole) * 100);
  const input = h('input', { type: 'number', step: '0.5', class: 'num' });
  input.value = String(cvMm((current / 100) * whole));
  input.addEventListener('change', () => {
    const percent = ((Number(input.value) * 72) / 25.4 / whole) * 100;
    if (Number.isFinite(percent)) cvSet(key, Math.round(percent * 100) / 100);
    cvInspect();
  });
  return h('label', { class: 'cvnum' }, h('span', { text: label }), input);
}

function cvInspect() {
  const root = CV.inspector;
  if (!root) return;
  root.replaceChildren();
  const box = CV.boxes[CV.sel];
  if (!box) {
    root.append(
      section(
        'Page',
        line('Colour', colourPicker(headerValue('cover-color'), (value) => {
          setHeader('cover-color', value);
          cvDraw();
        })),
      ),
      section('Layouts', h('div', { class: 'cv-templates' }, ...CV_TEMPLATES.map((template) => h('button', {
        type: 'button',
        class: 'pill ghost small',
        text: template.name,
        onclick: () => cvApplyTemplate(template),
      })))),
    );
    return;
  }
  const isText = box.kind === 'text';
  const isShape = box.kind === 'rect' || box.kind === 'ellipse';
  if (isText) {
    root.append(
      section(
        'Text',
        stackLine('Font', dropdown({
          choices: [{ value: '', label: 'Document font' }, ...FONT_LIST],
          value: box.p.font || '',
          label: 'Font',
          onPick: (value) => {
            cvSet('font', value);
            cvInspect();
          },
        })),
        line('Size', stepper({ value: cvNum(box, 'size', 12), min: 6, max: 140, step: 1, onChange: (value) => cvSet('size', value) })),
        h(
          'div',
          { class: 'cv-toggles' },
          ...[
            ['bold', 'B', 'Bold'],
            ['italic', 'I', 'Italic'],
            ['underline', 'U', 'Underline'],
            ['upper', 'AA', 'Capitals'],
          ].map(([flag, label, title]) => h('button', {
            type: 'button',
            class: `cvt ${box.p[flag] ? 'on' : ''} ${flag}`,
            text: label,
            title,
            onclick: () => {
              cvSet(flag, !box.p[flag]);
              cvInspect();
            },
          })),
        ),
        segmented([
          { value: 'left', icon: 'alignLeft', title: 'Left' },
          { value: 'center', icon: 'alignCenter', title: 'Centre' },
          { value: 'right', icon: 'alignRight', title: 'Right' },
          { value: 'justify', icon: 'alignJustify', title: 'Justify' },
        ], box.p.align || 'left', (value) => cvSet('align', value === 'left' ? '' : value)),
        segmented([
          { value: 'top', label: 'Top' },
          { value: 'middle', label: 'Middle' },
          { value: 'bottom', label: 'Bottom' },
        ], box.p.valign || 'top', (value) => cvSet('valign', value === 'top' ? '' : value)),
        line('Colour', colourPicker(box.p.color || '', (value) => cvSet('color', value))),
        line('Spacing', stepper({ value: cvNum(box, 'spacing', 0), min: -2, max: 20, step: 0.5, onChange: (value) => cvSet('spacing', value || '') })),
        line('Lines', stepper({ value: cvNum(box, 'line', 1.3), min: 0.8, max: 3, step: 0.1, onChange: (value) => cvSet('line', value) })),
      ),
      section('Field', dropdown({
        choices: [{ value: '', label: 'Insert field' }, ...CV_FIELDS.map(([value, label]) => ({ value, label }))],
        value: '',
        label: 'Insert field',
        keep: true,
        onPick: (value) => {
          if (!value) return;
          cvSnapshot();
          box.text = box.text ? `${box.text} {${value}}` : `{${value}}`;
          cvSave();
          cvDraw();
        },
      })),
    );
  }
  if (isShape || box.kind === 'line') {
    root.append(
      section(
        box.kind === 'line' ? 'Line' : 'Shape',
        line(box.kind === 'line' ? 'Colour' : 'Fill', colourPicker(box.kind === 'line' ? box.p.border || '' : box.p.bg || '', (value) => cvSet(box.kind === 'line' ? 'border' : 'bg', value))),
        box.kind === 'line'
          ? line('Thickness', stepper({ value: cvNum(box, 'bw', 1.5), min: 0.25, max: 30, step: 0.25, onChange: (value) => cvSet('bw', value) }))
          : null,
        isShape ? line('Border', colourPicker(box.p.border || '', (value) => cvSet('border', value))) : null,
        isShape ? line('Border size', stepper({ value: cvNum(box, 'bw', 0), min: 0, max: 30, step: 0.5, onChange: (value) => cvSet('bw', value || '') })) : null,
        box.kind === 'rect' ? line('Corners', stepper({ value: cvNum(box, 'radius', 0), min: 0, max: 200, step: 2, onChange: (value) => cvSet('radius', value || '') })) : null,
      ),
    );
  }
  if (box.kind === 'image') {
    root.append(section('Picture', segmented([
      { value: 'cover', label: 'Fill' },
      { value: 'contain', label: 'Fit' },
      { value: 'fill', label: 'Stretch' },
    ], box.p.fit || 'cover', (value) => cvSet('fit', value)), h('button', {
      type: 'button',
      class: 'pill ghost small',
      html: `${icon('upload', 15)}<span>Change</span>`,
      onclick: async () => {
        const file = await pickFile('image/*');
        if (!file) return;
        const path = await upload(file);
        if (path) {
          cvSnapshot();
          box.text = path;
          cvSave();
          cvDraw();
        }
      },
    })));
  }
  const opacity = h('input', { type: 'range', min: '0.05', max: '1', step: '0.05', class: 'cvrange' });
  opacity.value = String(cvNum(box, 'opacity', 1));
  opacity.addEventListener('change', () => cvSet('opacity', Number(opacity.value) >= 1 ? '' : opacity.value));
  root.append(
    section(
      'Place',
      h('div', { class: 'cvgrid' }, cvMmField('X', 'x', 'x'), cvMmField('Y', 'y', 'y'), cvMmField('W', 'w', 'x'), cvMmField('H', 'h', 'y')),
      line('Turn', stepper({ value: cvNum(box, 'rot', 0), min: -180, max: 180, step: 5, onChange: (value) => cvSet('rot', value || '') })),
      line('See-through', opacity),
      h(
        'div',
        { class: 'cv-actions' },
        h('button', { type: 'button', class: 'round', html: icon('up', 16), title: 'Bring forward', onclick: () => cvOrder(1) }),
        h('button', { type: 'button', class: 'round', html: icon('down', 16), title: 'Send back', onclick: () => cvOrder(-1) }),
        h('button', { type: 'button', class: 'round', html: icon('copy', 16), title: 'Duplicate', onclick: cvDuplicate }),
        h('button', { type: 'button', class: 'round danger', html: icon('trash', 16), title: 'Delete', onclick: cvDelete }),
      ),
    ),
  );
}

function cvKeys(event) {
  if (!CV.root) return;
  const typing = CV.editing !== null || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  const key = event.key;
  if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'z' && !typing) {
    event.preventDefault();
    cvRestore(CV.history, CV.future);
    return;
  }
  if ((event.ctrlKey || event.metaKey) && (key.toLowerCase() === 'y' || (event.shiftKey && key.toLowerCase() === 'z')) && !typing) {
    event.preventDefault();
    cvRestore(CV.future, CV.history);
    return;
  }
  if (typing) {
    if (key === 'Escape' && CV.editing !== null) {
      event.preventDefault();
      document.activeElement.blur();
    }
    return;
  }
  if (key === 'Escape') {
    if (CV.sel >= 0) {
      CV.sel = -1;
      cvDraw();
    } else cvClose();
    return;
  }
  if (CV.sel < 0) return;
  if (key === 'Delete' || key === 'Backspace') {
    event.preventDefault();
    cvDelete();
  } else if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'd') {
    event.preventDefault();
    cvDuplicate();
  } else if (key === 'Enter') {
    event.preventDefault();
    if (CV.boxes[CV.sel].kind === 'text') cvEditText(CV.sel);
  } else if (key.startsWith('Arrow')) {
    event.preventDefault();
    const step = event.shiftKey ? 2 : 0.25;
    const box = CV.boxes[CV.sel];
    cvSnapshot();
    if (key === 'ArrowLeft') box.p.x = String(cvNum(box, 'x', 10) - step);
    if (key === 'ArrowRight') box.p.x = String(cvNum(box, 'x', 10) + step);
    if (key === 'ArrowUp') box.p.y = String(cvNum(box, 'y', 10) - step);
    if (key === 'ArrowDown') box.p.y = String(cvNum(box, 'y', 10) + step);
    cvSave();
    cvDraw();
  }
}

function cvTool(iconName, title, onclick) {
  return h('button', { type: 'button', class: 'cvtool', html: icon(iconName, 20), title, onclick });
}

function cvShapeMenu(anchor) {
  showMenu(anchor, [
    { value: 'rect', label: 'Rectangle' },
    { value: 'ellipse', label: 'Circle' },
    { value: 'line', label: 'Line' },
  ], '', (value) => {
    if (value === 'line') cvAdd({ kind: 'line', p: { x: '15', y: '50', w: '30', bw: '2', border: '#1f4e79' }, text: '' });
    else cvAdd({ kind: value, p: { x: '30', y: '30', w: value === 'rect' ? '40' : '28', h: value === 'rect' ? '12' : '20', bg: '#1f4e79' }, text: '' });
  }, false);
}

function cvFieldMenu(anchor) {
  showMenu(anchor, CV_FIELDS.map(([value, label]) => ({ value, label })), '', (value) => {
    const big = value === 'question' || value === 'title';
    const text = value === 'words' ? 'Word count: {words}' : `{${value}}`;
    cvAdd(cvTextBox(text, { x: '15', y: value === 'words' ? '88' : '40', w: '70', size: big ? '28' : '14', bold: big ? '1' : '' }));
  }, false);
}

function openCoverFree() {
  if (CV.root) return;
  cvLoad();
  if (!CV.boxes.length && !headerValue('cover-box')) CV.boxes = CV_TEMPLATES[1].boxes();
  closeEditor(true);
  S.sel = null;
  CV.sel = -1;
  CV.history = [];
  CV.future = [];
  CV.editing = null;
  if (headerValue('cover-style') !== 'free') setHeader('cover-style', 'free');
  if (headerValue('cover') === 'no') setHeader('cover', 'yes');
  cvSave();
  const stage = h('div', { class: 'cvs-stage' });
  CV.page = h('div', { class: 'cvs-page' });
  CV.page.addEventListener('pointerdown', (event) => {
    if (event.target !== CV.page) return;
    if (CV.editing !== null) document.activeElement.blur();
    CV.sel = -1;
    cvDraw();
  });
  stage.append(CV.page);
  CV.inspector = h('div', { class: 'cvs-side' });
  const shape = cvTool('shapes', 'Shape', () => cvShapeMenu(shape));
  const field = cvTool('braces', 'Fields: title, author, word count', () => cvFieldMenu(field));
  const bar = h(
    'div',
    { class: 'cvs-bar' },
    h('span', { class: 'cvs-title', text: 'Cover' }),
    h('div', { class: 'cvs-spacer' }),
    h('button', { type: 'button', class: 'pill ghost small', text: 'Undo', onclick: () => cvRestore(CV.history, CV.future) }),
    h('button', { type: 'button', class: 'pill', text: 'Done', onclick: cvClose }),
  );
  const rail = h(
    'div',
    { class: 'cvs-rail' },
    cvTool('textIcon', 'Text', () => cvAdd(cvTextBox('Text', { x: '20', y: '40', w: '60', size: '20' }), true)),
    field,
    shape,
    cvTool('image', 'Picture', cvAddImage),
  );
  CV.root = h('div', { class: 'cvs' }, bar, h('div', { class: 'cvs-body' }, rail, stage, CV.inspector));
  document.body.append(CV.root);
  document.addEventListener('keydown', cvKeys, true);
  window.addEventListener('resize', cvDraw);
  cvDraw();
  requestAnimationFrame(cvDraw);
}

function cvClose() {
  if (!CV.root) return;
  if (CV.editing !== null && document.activeElement) document.activeElement.blur();
  document.removeEventListener('keydown', cvKeys, true);
  window.removeEventListener('resize', cvDraw);
  conceal(CV.root, true);
  CV.root = null;
  CV.page = null;
  CV.inspector = null;
  if (S.coverOpen) openCover();
}
