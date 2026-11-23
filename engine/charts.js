// Renders chart specs (JSON on stdin) to SVG strings (JSON on stdout).
const fs = require('fs');

const INK = '#141414';
const MUTE = '#5d5d58';
const GRID = '#e3e3dc';
const PALETTE = ['#1f4e79', '#c0392b', '#2e7d32', '#d98200', '#6a3d9a', '#141414', '#0e8a8a', '#8c564b'];
const DASH = ['', '7 3.5', '2 3', '9 3 2 3', '', '7 3.5', '2 3', '9 3 2 3'];
const FS = 12;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const tw = (s, size = FS) => String(s).length * size * 0.54;
const r2 = (n) => Math.round(n * 100) / 100;

function fmt(v) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-3) {
    const [m, e] = v.toExponential(3).split('e');
    return `${parseFloat(m)}e${parseInt(e, 10)}`;
  }
  return String(parseFloat(v.toPrecision(10)));
}

function niceStep(range, target) {
  const raw = range / Math.max(target, 1);
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * pow;
}

function linearScale(lo, hi, size, fixedLo, fixedHi, target, flip) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const step = niceStep(hi - lo, target);
  const min = fixedLo !== undefined ? fixedLo : Math.floor(lo / step + 1e-9) * step;
  const max = fixedHi !== undefined ? fixedHi : Math.ceil(hi / step - 1e-9) * step;
  const ticks = [];
  for (let t = Math.ceil(min / step - 1e-9) * step; t <= max + step * 1e-6; t += step) ticks.push(parseFloat(t.toPrecision(12)));
  const map = (v) => (flip ? size - ((v - min) / (max - min)) * size : ((v - min) / (max - min)) * size);
  return { min, max, ticks, map };
}

function logScale(lo, hi, size, fixedLo, fixedHi, flip) {
  const min = fixedLo !== undefined ? fixedLo : Math.pow(10, Math.floor(Math.log10(lo)));
  const max = fixedHi !== undefined ? fixedHi : Math.pow(10, Math.ceil(Math.log10(hi)));
  const ticks = [];
  for (let e = Math.ceil(Math.log10(min) - 1e-9); e <= Math.floor(Math.log10(max) + 1e-9); e += 1) ticks.push(Math.pow(10, e));
  const span = Math.log10(max) - Math.log10(min);
  const map = (v) => {
    const f = (Math.log10(v) - Math.log10(min)) / span;
    return flip ? size - f * size : f * size;
  };
  return { min, max, ticks, map };
}

// ---- safe expression evaluator for function plots ------------------------------------
const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, ln: Math.log, log: Math.log10,
  log2: Math.log2, sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
};
const CONSTS = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };

function compile(source) {
  const tokens = source.replace(/\s+/g, '').replace(/π/g, 'pi').match(/\d*\.?\d+(?:[eE][-+]?\d+)?|[a-zA-Z_]\w*|[-+*/^()]/g) || [];
  if (tokens.join('') !== source.replace(/\s+/g, '').replace(/π/g, 'pi')) throw new Error(`cannot read the formula "${source}"`);
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const isStart = (t) => t !== undefined && (/^[\d.]/.test(t) || /^[a-zA-Z_]/.test(t) || t === '(');

  function expr() {
    let left = term();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const right = term();
      const l = left;
      left = op === '+' ? (x) => l(x) + right(x) : (x) => l(x) - right(x);
    }
    return left;
  }
  function term() {
    let left = unary();
    while (peek() === '*' || peek() === '/' || isStart(peek())) {
      const op = peek() === '*' || peek() === '/' ? next() : '*';
      const right = unary();
      const l = left;
      left = op === '*' ? (x) => l(x) * right(x) : (x) => l(x) / right(x);
    }
    return left;
  }
  function unary() {
    if (peek() === '-') { next(); const u = unary(); return (x) => -u(x); }
    if (peek() === '+') { next(); return unary(); }
    return power();
  }
  function power() {
    const base = atom();
    if (peek() === '^') { next(); const exp = unary(); return (x) => Math.pow(base(x), exp(x)); }
    return base;
  }
  function atom() {
    const t = next();
    if (t === undefined) throw new Error(`formula "${source}" ends too early`);
    if (/^[\d.]/.test(t)) { const n = parseFloat(t); return () => n; }
    if (t === '(') { const e = expr(); if (next() !== ')') throw new Error(`missing ) in "${source}"`); return e; }
    if (t === 'x') return (x) => x;
    if (t in CONSTS) return () => CONSTS[t];
    if (t in FUNCS) {
      const f = FUNCS[t];
      if (peek() !== '(') throw new Error(`write ${t}(...) with brackets in "${source}"`);
      next();
      const arg = expr();
      if (next() !== ')') throw new Error(`missing ) in "${source}"`);
      return (x) => f(arg(x));
    }
    throw new Error(`unknown name "${t}" in "${source}" (use x, pi, e and ${Object.keys(FUNCS).join(', ')})`);
  }
  const result = expr();
  if (pos < tokens.length) throw new Error(`cannot read "${source}" near "${tokens[pos]}"`);
  return result;
}

// ---- drawing helpers ----------------------------------------------------------------
function marker(kind, x, y, color, size = 3.6) {
  const s = size;
  if (kind === 1) return `<rect x="${r2(x - s)}" y="${r2(y - s)}" width="${2 * s}" height="${2 * s}" fill="${color}"/>`;
  if (kind === 2) return `<path d="M${r2(x)} ${r2(y - s * 1.2)}L${r2(x + s * 1.1)} ${r2(y + s)}L${r2(x - s * 1.1)} ${r2(y + s)}Z" fill="${color}"/>`;
  if (kind === 3) return `<path d="M${r2(x)} ${r2(y - s * 1.3)}L${r2(x + s * 1.3)} ${r2(y)}L${r2(x)} ${r2(y + s * 1.3)}L${r2(x - s * 1.3)} ${r2(y)}Z" fill="${color}"/>`;
  return `<circle cx="${r2(x)}" cy="${r2(y)}" r="${s}" fill="${color}"/>`;
}

function legend(items, width, y0, kinds) {
  const rows = [[]];
  let used = 0;
  const widths = items.map((it) => 30 + tw(it.name) + 18);
  items.forEach((it, i) => {
    if (used + widths[i] > width && rows[rows.length - 1].length) { rows.push([]); used = 0; }
    rows[rows.length - 1].push(i);
    used += widths[i];
  });
  let out = '';
  rows.forEach((row, r) => {
    const total = row.reduce((s, i) => s + widths[i], 0) - 18;
    let x = (width - total) / 2;
    const y = y0 + r * 20 + 10;
    row.forEach((i) => {
      const it = items[i];
      if (kinds === 'bar') out += `<rect x="${r2(x)}" y="${y - 5}" width="14" height="10" fill="${it.color}"/>`;
      else {
        if (it.line) out += `<line x1="${r2(x)}" y1="${y}" x2="${r2(x + 22)}" y2="${y}" stroke="${it.color}" stroke-width="2" ${it.dash ? `stroke-dasharray="${it.dash}"` : ''}/>`;
        if (it.mark !== undefined) out += marker(it.mark, x + 11, y, it.color, 3.4);
      }
      out += `<text x="${r2(x + 28)}" y="${y + 4}" fill="${INK}">${esc(it.name)}</text>`;
      x += widths[i];
    });
  });
  return { svg: out, height: rows.length * 20 + 6 };
}

function axes(ctx, xs, ys, spec) {
  const { left, top, pw, ph } = ctx;
  let out = '';
  const gridOn = spec.grid !== false;
  ys.ticks.forEach((t) => {
    const y = r2(top + ys.map(t));
    if (gridOn) out += `<line x1="${left}" y1="${y}" x2="${left + pw}" y2="${y}" stroke="${GRID}" stroke-width="0.8"/>`;
    out += `<line x1="${left - 4}" y1="${y}" x2="${left}" y2="${y}" stroke="${INK}" stroke-width="1"/>`;
    out += `<text x="${left - 8}" y="${y + 4}" text-anchor="end" fill="${INK}">${ctx.ylabels ? ctx.ylabels(t) : fmt(t)}</text>`;
  });
  xs.ticks.forEach((t) => {
    const x = r2(left + xs.map(t));
    if (gridOn && spec.xgrid !== false) out += `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + ph}" stroke="${GRID}" stroke-width="0.8"/>`;
    out += `<line x1="${x}" y1="${top + ph}" x2="${x}" y2="${top + ph + 4}" stroke="${INK}" stroke-width="1"/>`;
    out += `<text x="${x}" y="${top + ph + 18}" text-anchor="middle" fill="${INK}">${ctx.xlabels ? ctx.xlabels(t) : fmt(t)}</text>`;
  });
  out += `<line x1="${left}" y1="${top}" x2="${left}" y2="${top + ph}" stroke="${INK}" stroke-width="1.2"/>`;
  out += `<line x1="${left}" y1="${top + ph}" x2="${left + pw}" y2="${top + ph}" stroke="${INK}" stroke-width="1.2"/>`;
  return out;
}

function guides(ctx, xs, ys, spec) {
  const { left, top, pw, ph } = ctx;
  let out = '';
  (spec.hlines || []).forEach((g) => {
    if (g.v < ys.min || g.v > ys.max) return;
    const y = r2(top + ys.map(g.v));
    out += `<line x1="${left}" y1="${y}" x2="${left + pw}" y2="${y}" stroke="${MUTE}" stroke-width="1.2" stroke-dasharray="5 4"/>`;
    if (g.label) out += `<text x="${left + pw - 4}" y="${y - 5}" text-anchor="end" fill="${MUTE}" font-style="italic">${esc(g.label)}</text>`;
  });
  (spec.vlines || []).forEach((g) => {
    if (g.v < xs.min || g.v > xs.max) return;
    const x = r2(left + xs.map(g.v));
    out += `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + ph}" stroke="${MUTE}" stroke-width="1.2" stroke-dasharray="5 4"/>`;
    if (g.label) out += `<text x="${x + 5}" y="${top + 12}" fill="${MUTE}" font-style="italic">${esc(g.label)}</text>`;
  });
  return out;
}

function frame(spec, index) {
  const W = spec.width;
  const H = Math.round(W / (spec.ratio || 1.6));
  return { W, H, id: `ch${index}` };
}

function wrapSvg(W, H, body, title) {
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" style="width:100%;height:auto;display:block;font-size:${FS}px;font-family:inherit"><title>${esc(title || 'Chart')}</title>${body}</svg>`;
}

function seriesStyle(series) {
  return series.map((s, i) => ({ name: s.name, color: s.color || PALETTE[i % PALETTE.length], dash: DASH[i % DASH.length], mark: i % 4 }));
}

// ---- chart types --------------------------------------------------------------------
function xyChart(spec, index) {
  const { W, H, id } = frame(spec, index);
  const kind = spec.type;
  let series = spec.series;
  let categories = null;

  if (spec.functions) {
    const [a, b] = spec.domain;
    series = spec.functions.map((f) => {
      const fn = compile(f.expr);
      const x = [], y = [];
      for (let i = 0; i <= 600; i += 1) {
        const v = a + ((b - a) * i) / 600;
        x.push(v);
        y.push(fn(v));
      }
      return { name: f.name || `y = ${f.expr}`, x, y };
    });
  } else if (series.some((s) => s.x.some((v) => v === null))) {
    categories = series[0].xlabels;
    series.forEach((s) => { s.x = s.x.map((_, i) => i); });
  }

  const style = seriesStyle(series);
  const all = (k) => series.flatMap((s) => s[k]).filter((v) => Number.isFinite(v));
  let xlo = Math.min(...all('x')), xhi = Math.max(...all('x'));
  let ylo = Math.min(...all('y')), yhi = Math.max(...all('y'));

  if (spec.functions) {
    const ys = all('y').sort((p, q) => p - q);
    const q = (f) => ys[Math.min(ys.length - 1, Math.max(0, Math.floor(f * ys.length)))];
    if (yhi - ylo > 12 * (q(0.9) - q(0.1) || 1)) {
      const pad = (q(0.98) - q(0.02)) * 0.12;
      ylo = q(0.02) - pad;
      yhi = q(0.98) + pad;
    }
  }
  if (categories) { xlo = -0.5; xhi = categories.length - 0.5; }

  const showLegend = spec.legend !== 'none' && (series.length > 1 || spec.legend === 'show');
  const leg = showLegend
    ? legend(style.map((s) => ({ ...s, line: kind !== 'scatter' || spec.lines, mark: (spec.markers === false) ? undefined : (kind === 'scatter' || spec.markers || (kind === 'line' && series[0].x.length <= 30)) ? s.mark : undefined })), W - 20, 0, 'line')
    : { svg: '', height: 0 };

  const ylabels = (t) => fmt(t);
  const left = 14 + (spec.ylabel ? 18 : 0) + Math.max(...[spec.ymin, spec.ymax, ylo, yhi].filter((v) => v !== undefined).map((v) => tw(fmt(v)))) + 12;
  const top = 10;
  const bottom = 24 + (spec.xlabel ? 20 : 0) + (showLegend ? leg.height + 8 : 0);
  const pw = W - left - 14, ph = H - top - bottom;
  const xs = spec.xlog ? logScale(Math.max(xlo, 1e-12), xhi, pw, spec.xmin, spec.xmax, false)
    : categories ? { min: xlo, max: xhi, ticks: categories.map((_, i) => i), map: (v) => ((v - xlo) / (xhi - xlo)) * pw }
      : linearScale(xlo, xhi, pw, spec.xmin, spec.xmax, Math.max(3, Math.floor(pw / 70)), false);
  const ys = spec.ylog ? logScale(Math.max(ylo, 1e-12), yhi, ph, spec.ymin, spec.ymax, true)
    : linearScale(ylo, yhi, ph, spec.ymin, spec.ymax, Math.max(3, Math.floor(ph / 42)), true);
  const ctx = { left, top, pw, ph, ylabels, xlabels: categories ? (t) => esc(categories[t]) : null };

  let out = `<defs><clipPath id="${id}"><rect x="${left}" y="${top - 2}" width="${pw}" height="${ph + 4}"/></clipPath></defs>`;
  out += axes(ctx, xs, ys, spec) + guides(ctx, xs, ys, spec);
  out += `<g clip-path="url(#${id})">`;
  series.forEach((s, i) => {
    const st = style[i];
    const pts = s.x.map((x, k) => [left + xs.map(x), top + ys.map(s.y[k])]);
    const ok = (p, k) => Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(s.y[k]);
    const drawLine = kind === 'line' || spec.functions || spec.lines;
    if (drawLine) {
      let d = '', pen = false, last = null;
      pts.forEach((p, k) => {
        if (!ok(p, k) || (last && Math.abs(p[1] - last[1]) > ph * 1.5)) { pen = false; last = ok(p, k) ? p : null; if (!ok(p, k)) return; }
        d += `${pen ? 'L' : 'M'}${r2(p[0])} ${r2(p[1])}`;
        pen = true;
        last = p;
      });
      out += `<path d="${d}" fill="none" stroke="${st.color}" stroke-width="${spec.functions ? 2 : 1.8}" ${st.dash ? `stroke-dasharray="${st.dash}"` : ''} stroke-linejoin="round"/>`;
    }
    const markers = spec.markers === false ? false : spec.markers || kind === 'scatter' || (kind === 'line' && !spec.functions && pts.length <= 30);
    if (markers) pts.forEach((p, k) => { if (ok(p, k)) out += marker(st.mark, p[0], p[1], st.color, spec.markersize || 3.4); });
  });
  out += '</g>';
  if (spec.xlabel) out += `<text x="${left + pw / 2}" y="${top + ph + 40}" text-anchor="middle" fill="${INK}" font-size="${FS + 0.5}">${esc(spec.xlabel)}</text>`;
  if (spec.ylabel) out += `<text transform="translate(${12} ${top + ph / 2}) rotate(-90)" text-anchor="middle" fill="${INK}" font-size="${FS + 0.5}">${esc(spec.ylabel)}</text>`;
  if (showLegend) out += `<g transform="translate(10 ${H - leg.height - 2})">${leg.svg}</g>`;
  return wrapSvg(W, H, out, spec.alt);
}

function barChart(spec, index) {
  const { W, H, id } = frame(spec, index);
  const horizontal = spec.type === 'hbar';
  let series = spec.series;
  let cats = spec.categories || series[0].xlabels;

  if (spec.type === 'hist') {
    const values = series[0].y.filter(Number.isFinite);
    const lo = Math.min(...values), hi = Math.max(...values);
    const bins = spec.bins || Math.max(5, Math.ceil(Math.sqrt(values.length)));
    const step = (hi - lo) / bins || 1;
    const counts = new Array(bins).fill(0);
    values.forEach((v) => { counts[Math.min(bins - 1, Math.floor((v - lo) / step))] += 1; });
    const short = (v) => String(parseFloat(v.toPrecision(3)));
    cats = counts.map((_, i) => `${short(lo + i * step)}–${short(lo + (i + 1) * step)}`);
    series = [{ name: series[0].name, y: counts }];
    spec = { ...spec, ylabel: spec.ylabel || 'Frequency', legend: 'none', gap: 0.04 };
  }

  const style = seriesStyle(series);
  const n = cats.length, m = series.length;
  const ymax = Math.max(0, ...series.flatMap((s) => s.y.filter(Number.isFinite)));
  const ymin = Math.min(0, ...series.flatMap((s) => s.y.filter(Number.isFinite)));
  const showLegend = spec.legend !== 'none' && m > 1;
  const leg = showLegend ? legend(style.map((s) => ({ ...s })), W - 20, 0, 'bar') : { svg: '', height: 0 };

  const longest = Math.max(...cats.map((c) => tw(c)));
  const rotate = !horizontal && longest > (W / n) * 0.9;
  const labelBand = horizontal ? 0 : rotate ? Math.min(90, longest * 0.75 + 6) : 0;
  const left = horizontal ? 14 + (spec.ylabel ? 18 : 0) + Math.min(170, longest) + 10 : 14 + (spec.ylabel ? 18 : 0) + Math.max(tw(fmt(ymax)), tw(fmt(ymin))) + 12;
  const top = 12;
  const bottom = 26 + labelBand + (spec.xlabel ? 20 : 0) + (showLegend ? leg.height + 8 : 0);
  const pw = W - left - 16, ph = H - top - bottom;
  const valueAxis = spec.ylog
    ? logScale(Math.max(Math.min(...series.flatMap((s) => s.y.filter((v) => v > 0))), 1e-12), ymax, horizontal ? pw : ph, spec.ymin, spec.ymax, !horizontal)
    : linearScale(ymin, ymax, horizontal ? pw : ph, spec.ymin, spec.ymax, Math.max(3, Math.floor((horizontal ? pw : ph) / 60)), !horizontal);
  const band = (horizontal ? ph : pw) / n;
  const gap = spec.gap !== undefined ? spec.gap : 0.28;
  const barW = (band * (1 - gap)) / m;
  const zero = valueAxis.map(Math.max(valueAxis.min, 0) || valueAxis.min);

  let out = `<defs><clipPath id="${id}"><rect x="${left}" y="${top - 2}" width="${pw}" height="${ph + 4}"/></clipPath></defs>`;
  const ctx = { left, top, pw, ph };
  if (!horizontal) {
    out += axes({ ...ctx, xlabels: () => '' }, { ticks: [], map: () => 0 }, valueAxis, spec);
    cats.forEach((c, i) => {
      const cx = left + band * (i + 0.5);
      out += `<line x1="${r2(cx)}" y1="${top + ph}" x2="${r2(cx)}" y2="${top + ph + 4}" stroke="${INK}"/>`;
      const label = esc(c);
      out += rotate
        ? `<text transform="translate(${r2(cx + 4)} ${top + ph + 12}) rotate(-40)" text-anchor="end" fill="${INK}">${label}</text>`
        : `<text x="${r2(cx)}" y="${top + ph + 18}" text-anchor="middle" fill="${INK}">${label}</text>`;
    });
  } else {
    valueAxis.ticks.forEach((t) => {
      const x = r2(left + valueAxis.map(t));
      out += `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + ph}" stroke="${GRID}" stroke-width="0.8"/>`;
      out += `<line x1="${x}" y1="${top + ph}" x2="${x}" y2="${top + ph + 4}" stroke="${INK}"/>`;
      out += `<text x="${x}" y="${top + ph + 18}" text-anchor="middle" fill="${INK}">${fmt(t)}</text>`;
    });
    out += `<line x1="${left}" y1="${top}" x2="${left}" y2="${top + ph}" stroke="${INK}" stroke-width="1.2"/>`;
    out += `<line x1="${left}" y1="${top + ph}" x2="${left + pw}" y2="${top + ph}" stroke="${INK}" stroke-width="1.2"/>`;
    cats.forEach((c, i) => {
      const cy = top + band * (i + 0.5);
      out += `<text x="${left - 8}" y="${r2(cy + 4)}" text-anchor="end" fill="${INK}">${esc(c)}</text>`;
    });
  }

  out += '<g>';
  series.forEach((s, k) => {
    s.y.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      const start = (horizontal ? top : left) + band * i + (band * gap) / 2 + barW * k;
      const pos = valueAxis.map(v);
      if (!horizontal) {
        const y0 = Math.min(top + pos, top + zero), h = Math.abs(pos - zero);
        out += `<rect x="${r2(start)}" y="${r2(y0)}" width="${r2(barW)}" height="${r2(h)}" fill="${style[k].color}"/>`;
        if (spec.labels) out += `<text x="${r2(start + barW / 2)}" y="${r2(y0 - 4)}" text-anchor="middle" fill="${INK}" font-size="${FS - 1}">${fmt(v)}</text>`;
      } else {
        const x0 = Math.min(left + pos, left + valueAxis.map(Math.max(valueAxis.min, 0) || valueAxis.min)), w = Math.abs(pos - valueAxis.map(Math.max(valueAxis.min, 0) || valueAxis.min));
        out += `<rect x="${r2(x0)}" y="${r2(start)}" width="${r2(w)}" height="${r2(barW)}" fill="${style[k].color}"/>`;
        if (spec.labels) out += `<text x="${r2(x0 + w + 4)}" y="${r2(start + barW / 2 + 4)}" fill="${INK}" font-size="${FS - 1}">${fmt(v)}</text>`;
      }
    });
  });
  out += '</g>';
  out += guides(ctx, { min: 0, max: 1, map: () => 0 }, valueAxis, spec);
  if (spec.xlabel) out += `<text x="${left + pw / 2}" y="${top + ph + 40 + labelBand}" text-anchor="middle" fill="${INK}" font-size="${FS + 0.5}">${esc(spec.xlabel)}</text>`;
  if (spec.ylabel) out += `<text transform="translate(12 ${top + ph / 2}) rotate(-90)" text-anchor="middle" fill="${INK}" font-size="${FS + 0.5}">${esc(spec.ylabel)}</text>`;
  if (showLegend) out += `<g transform="translate(10 ${H - leg.height - 2})">${leg.svg}</g>`;
  return wrapSvg(W, H, out, spec.alt);
}

function pieChart(spec, index) {
  const W = spec.width;
  const H = Math.round(W / (spec.ratio || 1.9));
  const s = spec.series[0];
  const cats = spec.categories || s.xlabels;
  const total = s.y.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  const cx = H / 2 + 14, cy = H / 2, R = H / 2 - 14;
  const shades = cats.map((_, i) => PALETTE[i % PALETTE.length]);
  let angle = -Math.PI / 2;
  let out = '';
  s.y.forEach((v, i) => {
    const frac = v / total, a1 = angle + frac * Math.PI * 2;
    const large = a1 - angle > Math.PI ? 1 : 0;
    const p = (a, r) => `${r2(cx + r * Math.cos(a))} ${r2(cy + r * Math.sin(a))}`;
    const inner = spec.donut ? R * 0.52 : 0;
    const d = frac > 0.9999
      ? `M${p(angle, R)}A${R} ${R} 0 1 1 ${p(angle + Math.PI, R)}A${R} ${R} 0 1 1 ${p(angle, R)}Z`
      : inner
        ? `M${p(angle, R)}A${R} ${R} 0 ${large} 1 ${p(a1, R)}L${p(a1, inner)}A${inner} ${inner} 0 ${large} 0 ${p(angle, inner)}Z`
        : `M${cx} ${cy}L${p(angle, R)}A${R} ${R} 0 ${large} 1 ${p(a1, R)}Z`;
    out += `<path d="${d}" fill="${shades[i]}" stroke="#fff" stroke-width="2"/>`;
    if (frac > 0.04) {
      const mid = (angle + a1) / 2, r = spec.donut ? R * 0.76 : R * 0.64;
      const text = spec.labels === 'value' ? fmt(v) : `${Math.round(frac * 1000) / 10}%`;
      out += `<text x="${r2(cx + r * Math.cos(mid))}" y="${r2(cy + r * Math.sin(mid) + 4)}" text-anchor="middle" fill="#fff" font-weight="700" font-size="${FS}">${text}</text>`;
    }
    angle = a1;
  });
  const lx = cx + R + 26;
  cats.forEach((c, i) => {
    const y = cy - (cats.length * 22) / 2 + i * 22 + 11;
    out += `<rect x="${r2(lx)}" y="${r2(y - 6)}" width="13" height="13" fill="${shades[i]}"/><text x="${r2(lx + 20)}" y="${r2(y + 5)}" fill="${INK}">${esc(c)}</text>`;
  });
  return wrapSvg(W, H, out, spec.alt);
}

function render(spec, index) {
  try {
    if (spec.type === 'pie' || spec.type === 'donut') return { svg: pieChart({ ...spec, donut: spec.type === 'donut' }, index) };
    if (['bar', 'hbar', 'hist'].includes(spec.type)) return { svg: barChart(spec, index) };
    return { svg: xyChart(spec, index) };
  } catch (error) {
    return { error: error.message };
  }
}

const specs = JSON.parse(fs.readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify(specs.map(render)));
