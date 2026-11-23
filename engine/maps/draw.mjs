import { INK, MUTE, niceLength } from './color.mjs';

export const esc = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const r2 = (n) => Math.round(n * 100) / 100;

export const textWidth = (text, size) => String(text).length * size * 0.52;

export function marker(shape, x, y, radius, fill, stroke = '#fff', width = 1) {
  const s = radius;
  const paint = `fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"`;
  switch (shape) {
    case 'square':
      return `<rect x="${r2(x - s)}" y="${r2(y - s)}" width="${r2(2 * s)}" height="${r2(2 * s)}" ${paint}/>`;
    case 'triangle':
      return `<path d="M${r2(x)} ${r2(y - s * 1.25)}L${r2(x + s * 1.1)} ${r2(y + s * 0.9)}L${r2(x - s * 1.1)} ${r2(y + s * 0.9)}Z" ${paint}/>`;
    case 'diamond':
      return `<path d="M${r2(x)} ${r2(y - s * 1.35)}L${r2(x + s * 1.2)} ${r2(y)}L${r2(x)} ${r2(y + s * 1.35)}L${r2(x - s * 1.2)} ${r2(y)}Z" ${paint}/>`;
    case 'star': {
      const points = [];
      for (let i = 0; i < 10; i += 1) {
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const length = i % 2 === 0 ? s * 1.45 : s * 0.62;
        points.push(`${r2(x + length * Math.cos(angle))} ${r2(y + length * Math.sin(angle))}`);
      }
      return `<path d="M${points.join('L')}Z" ${paint}/>`;
    }
    case 'cross':
      return `<path d="M${r2(x - s)} ${r2(y)}H${r2(x + s)}M${r2(x)} ${r2(y - s)}V${r2(y + s)}" stroke="${fill}" stroke-width="${r2(Math.max(2, s * 0.55))}" fill="none"/>`;
    default:
      return `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(s)}" ${paint}/>`;
  }
}

export function haloText(text, x, y, options = {}) {
  const {
    size = 11, anchor = 'start', fill = INK, weight = 400, italic = false, halo = 3, spacing = 0, angle = 0,
  } = options;
  const style = `${italic ? 'font-style:italic;' : ''}${spacing ? `letter-spacing:${spacing}em;` : ''}`;
  const rotate = angle ? ` transform="rotate(${angle} ${r2(x)} ${r2(y)})"` : '';
  return `<text x="${r2(x)}" y="${r2(y)}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}" stroke="#fff" stroke-width="${halo}" stroke-linejoin="round" paint-order="stroke" style="${style}"${rotate}>${esc(text)}</text>`;
}

export class Placer {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.boxes = [];
  }

  reserve(x, y, w, h) {
    this.boxes.push([x, y, x + w, y + h]);
  }

  reserveCircle(x, y, radius) {
    this.reserve(x - radius, y - radius, radius * 2, radius * 2);
  }

  free(box) {
    const [a, b, c, d] = box;
    if (a < 2 || b < 2 || c > this.width - 2 || d > this.height - 2) return false;
    return !this.boxes.some(([e, f, g, h]) => a < g && c > e && b < h && d > f);
  }

  place(text, x, y, radius, size, force) {
    const w = textWidth(text, size) + 2;
    const h = size * 1.15;
    const gap = radius + 3;
    const options = [
      { box: [x + gap, y - h / 2, x + gap + w, y + h / 2], at: [x + gap, y + size * 0.34], anchor: 'start' },
      { box: [x - gap - w, y - h / 2, x - gap, y + h / 2], at: [x - gap, y + size * 0.34], anchor: 'end' },
      { box: [x - w / 2, y - gap - h, x + w / 2, y - gap], at: [x, y - gap - 2], anchor: 'middle' },
      { box: [x - w / 2, y + gap, x + w / 2, y + gap + h], at: [x, y + gap + size * 0.85], anchor: 'middle' },
      { box: [x + gap, y - gap - h, x + gap + w, y - gap], at: [x + gap, y - gap - 2], anchor: 'start' },
      { box: [x + gap, y + gap, x + gap + w, y + gap + h], at: [x + gap, y + gap + size * 0.85], anchor: 'start' },
      { box: [x - gap - w, y - gap - h, x - gap, y - gap], at: [x - gap, y - gap - 2], anchor: 'end' },
      { box: [x - gap - w, y + gap, x - gap, y + gap + h], at: [x - gap, y + gap + size * 0.85], anchor: 'end' },
    ];
    const hit = options.find((option) => this.free(option.box));
    if (!hit && !force) return null;
    const chosen = hit || options[0];
    this.boxes.push(chosen.box);
    return chosen;
  }

  placeCentered(text, x, y, size) {
    const w = textWidth(text, size) + 2;
    const box = [x - w / 2, y - size * 0.6, x + w / 2, y + size * 0.6];
    if (!this.free(box)) return false;
    this.boxes.push(box);
    return true;
  }
}

export function northArrow(x, y, size = 26) {
  const half = size * 0.2;
  return `<g><path d="M${r2(x)} ${r2(y)}L${r2(x + half)} ${r2(y + size)}L${r2(x)} ${r2(y + size * 0.78)}L${r2(x - half)} ${r2(y + size)}Z" fill="${INK}" stroke="#fff" stroke-width="1.2" paint-order="stroke"/>${haloText('N', x, y - 4, { size: 11, anchor: 'middle', weight: 700 })}</g>`;
}

export function scaleBar(projection, width, height, units, anchor = [16, 0]) {
  const row = height / 2;
  const left = projection.invert([width / 2 - 50, row]);
  const right = projection.invert([width / 2 + 50, row]);
  if (!left || !right) return null;
  const rad = (d) => (d * Math.PI) / 180;
  const a = [rad(left[0]), rad(left[1])];
  const b = [rad(right[0]), rad(right[1])];
  const arc = Math.acos(Math.min(1, Math.sin(a[1]) * Math.sin(b[1]) + Math.cos(a[1]) * Math.cos(b[1]) * Math.cos(a[0] - b[0])));
  const perPixel = (arc * (units === 'mi' ? 3958.8 : 6371)) / 100;
  if (!Number.isFinite(perPixel) || perPixel <= 0) return null;
  const length = niceLength(perPixel * width * 0.22);
  const pixels = length / perPixel;
  const x = anchor[0];
  const y = height - 22;
  const parts = [];
  const steps = 2;
  for (let i = 0; i < steps; i += 1) {
    parts.push(`<rect x="${r2(x + (pixels / steps) * i)}" y="${y}" width="${r2(pixels / steps)}" height="5" fill="${i % 2 ? '#fff' : INK}" stroke="${INK}" stroke-width="0.8"/>`);
  }
  const label = (value) => (value >= 1000 ? value.toLocaleString('en-US') : String(value));
  const text = (content, at, anchorName) => haloText(content, at, y - 4, { size: 10, anchor: anchorName, halo: 2.5 });
  return {
    svg: `<g>${parts.join('')}${text('0', x, 'middle')}${text(label(length / 2), x + pixels / 2, 'middle')}${text(`${label(length)} ${units}`, x + pixels, 'middle')}</g>`,
    width: pixels,
    reserved: [x - 8, y - 18, pixels + 40, 32],
    perPixel,
  };
}

export function legendLayout(groups, width) {
  const pad = 4;
  const rows = [];
  let row = { items: [], used: 0, height: 0 };
  const flush = () => {
    if (row.items.length) rows.push(row);
    row = { items: [], used: 0, height: 0 };
  };
  for (const group of groups) {
    if (row.used && row.used + group.width > width - pad * 2) flush();
    row.items.push({ group, x: row.used });
    row.used += group.width + 26;
    row.height = Math.max(row.height, group.height);
  }
  flush();
  let y = pad + 4;
  const parts = [];
  for (const line of rows) {
    for (const item of line.items) parts.push(`<g transform="translate(${r2(pad + item.x)} ${r2(y)})">${item.group.svg}</g>`);
    y += line.height + 12;
  }
  return { svg: parts.join(''), height: rows.length ? y - 4 : 0 };
}

export function legendTitle(text) {
  return `<text x="0" y="10" font-size="11" font-weight="700" fill="${INK}">${esc(text)}</text>`;
}

export const swatch = (x, y, fill, stroke = '#8d8b82') =>
  `<rect x="${r2(x)}" y="${r2(y)}" width="22" height="11" fill="${fill}" stroke="${stroke}" stroke-width="0.6"/>`;

export function mutedText(text, x, y, anchor = 'start', size = 10.5) {
  return `<text x="${r2(x)}" y="${r2(y)}" font-size="${size}" text-anchor="${anchor}" fill="${MUTE}">${esc(text)}</text>`;
}
