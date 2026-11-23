import { quantile, ticks } from 'd3-array';
import {
  schemeBlues, schemeBrBG, schemeGreens, schemeGreys, schemeOranges, schemePuOr, schemePurples,
  schemeRdBu, schemeRdYlGn, schemeReds, schemeYlGnBu, schemeYlOrRd,
} from 'd3-scale-chromatic';

export const INK = '#141414';
export const MUTE = '#5d5d58';
export const CATEGORY = ['#1f4e79', '#c0392b', '#2e7d32', '#d98200', '#6a3d9a', '#0e8a8a', '#8c564b', '#141414'];

const SCHEMES = {
  blues: schemeBlues,
  greens: schemeGreens,
  oranges: schemeOranges,
  reds: schemeReds,
  purples: schemePurples,
  greys: schemeGreys,
  grays: schemeGreys,
  'blue-green': schemeYlGnBu,
  heat: schemeYlOrRd,
  'red-blue': schemeRdBu,
  'red-green': schemeRdYlGn,
  'brown-teal': schemeBrBG,
  'orange-purple': schemePuOr,
};

const DIVERGING = new Set(['red-blue', 'red-green', 'brown-teal', 'orange-purple']);

function mix(a, b, t) {
  const read = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [read(a), read(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

export function paletteColors(name, count, accent) {
  const key = String(name || 'accent').toLowerCase();
  if (key === 'accent' || !SCHEMES[key]) {
    return Array.from({ length: count }, (_, i) => mix('#eef3f7', accent, 0.12 + (0.88 * i) / Math.max(count - 1, 1)));
  }
  const scheme = SCHEMES[key];
  const size = Math.min(Math.max(count, DIVERGING.has(key) ? 3 : 3), 9);
  const colors = scheme[Math.min(size, scheme.length - 1)] || scheme[scheme.length - 1];
  if (colors.length >= count) return colors.slice(0, count);
  return Array.from({ length: count }, (_, i) => colors[Math.round((i * (colors.length - 1)) / Math.max(count - 1, 1))]);
}

export function isPalette(name) {
  const key = String(name || '').toLowerCase();
  return key === 'accent' || key in SCHEMES;
}

export function paletteNames() {
  return ['accent', ...Object.keys(SCHEMES)];
}

function nice(value, digits = 2) {
  if (!Number.isFinite(value) || value === 0) return value;
  const power = 10 ** (Math.floor(Math.log10(Math.abs(value))) - digits + 1);
  return Math.round(value / power) * power;
}

function jenks(values, classes) {
  const data = values.slice().sort((a, b) => a - b);
  const n = data.length;
  const lower = Array.from({ length: n + 1 }, () => Array(classes + 1).fill(0));
  const variance = Array.from({ length: n + 1 }, () => Array(classes + 1).fill(Infinity));
  for (let i = 1; i <= classes; i += 1) {
    lower[1][i] = 1;
    variance[1][i] = 0;
  }
  for (let l = 2; l <= n; l += 1) {
    let sum = 0;
    let squares = 0;
    let weight = 0;
    for (let m = 1; m <= l; m += 1) {
      const index = l - m + 1;
      const value = data[index - 1];
      weight += 1;
      sum += value;
      squares += value * value;
      const spread = squares - (sum * sum) / weight;
      const previous = index - 1;
      if (previous !== 0) {
        for (let j = 2; j <= classes; j += 1) {
          if (variance[l][j] >= spread + variance[previous][j - 1]) {
            lower[l][j] = index;
            variance[l][j] = spread + variance[previous][j - 1];
          }
        }
      }
    }
    lower[l][1] = 1;
    variance[l][1] = squares - (sum * sum) / weight;
  }
  const breaks = Array(classes + 1).fill(0);
  breaks[classes] = data[n - 1];
  breaks[0] = data[0];
  let k = n;
  for (let j = classes; j >= 2; j -= 1) {
    const id = lower[k][j] - 2;
    breaks[j - 1] = data[Math.max(id, 0)];
    k = lower[k][j] - 1;
  }
  return breaks;
}

export function classify(values, options) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return { breaks: [], low: 0, high: 0 };
  const low = Math.min(...finite);
  const high = Math.max(...finite);
  const method = options.method || 'quantile';
  if (options.breaks && options.breaks.length) {
    const inner = options.breaks.slice().sort((a, b) => a - b);
    return { breaks: [Math.min(low, inner[0]), ...inner, Math.max(high, inner[inner.length - 1])], low, high };
  }
  const classes = Math.max(2, Math.min(9, options.classes || 5));
  if (low === high) return { breaks: [low, high], low, high };
  let raw;
  if (method === 'equal') {
    raw = Array.from({ length: classes + 1 }, (_, i) => low + ((high - low) * i) / classes);
  } else if (method === 'jenks' || method === 'natural') {
    raw = jenks(finite, Math.min(classes, new Set(finite).size));
  } else if (method === 'log') {
    const floor = Math.min(...finite.filter((v) => v > 0));
    raw = Array.from({ length: classes + 1 }, (_, i) => floor * (high / floor) ** (i / classes));
  } else {
    const sorted = finite.slice().sort((a, b) => a - b);
    raw = Array.from({ length: classes + 1 }, (_, i) => quantile(sorted, i / classes));
  }
  const inner = raw.slice(1, -1).map((v) => nice(v));
  const unique = [...new Set(inner)].filter((v) => v > low && v < high);
  const edges = [low, ...unique, high];
  return { breaks: edges, low, high };
}

export function classIndex(value, breaks) {
  if (!Number.isFinite(value) || breaks.length < 2) return -1;
  for (let i = breaks.length - 2; i >= 0; i -= 1) {
    if (value >= breaks[i]) return i;
  }
  return 0;
}

export function formatNumber(value, step = 0) {
  if (!Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${trim(value / 1e9)} billion`;
  if (abs >= 1e6) return `${trim(value / 1e6)} million`;
  if (abs >= 1e4) return Math.round(value).toLocaleString('en-US');
  if (abs >= 100) return trim(value, 0);
  if (abs >= 10) return trim(value, 1);
  return trim(value, step > 1 ? 1 : 2);
}

function trim(value, digits = 2) {
  return String(Number(value.toFixed(digits)));
}

export function niceLength(target) {
  const power = 10 ** Math.floor(Math.log10(target));
  const factor = target / power;
  const pick = factor >= 5 ? 5 : factor >= 2 ? 2 : 1;
  return pick * power;
}

export { ticks };
