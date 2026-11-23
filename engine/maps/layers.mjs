import { geoCircle } from 'd3-geo';
import { CATEGORY, classify, classIndex, niceLength, paletteColors } from './color.mjs';
import { lookupOnline } from './geodata.mjs';
import {
  centroidOf, findCity, findCountry, findRegion, parseCoordinates, similarity, suggestCity, suggestCountry,
} from './places.mjs';

const LAT = ['lat', 'latitude', 'y'];
const LON = ['lon', 'lng', 'long', 'longitude', 'x'];
const NAME = ['name', 'site', 'label', 'place', 'city', 'location', 'town'];
const FROM = ['from', 'origin', 'source', 'start'];
const TO = ['to', 'destination', 'target', 'end'];

export function toNumber(cell) {
  if (typeof cell === 'number') return cell;
  const text = String(cell ?? '').trim().replace(/[−–]/g, '-').replace(/\s/g, '');
  if (!text || /^(n\/?a|na|null|none|-+|\.\.)$/i.test(text)) return null;
  const clean = /^-?\d{1,3}(,\d{3})+(\.\d+)?%?$/.test(text) ? text.replace(/,/g, '') : text.replace(/%$/, '');
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
}

export function columnIndex(header, name, ctx, what) {
  const key = String(name).trim().toLowerCase();
  const names = header.map((h) => String(h).trim().toLowerCase());
  let index = names.indexOf(key);
  if (index < 0 && /^\d+$/.test(key) && Number(key) >= 1 && Number(key) <= header.length) index = Number(key) - 1;
  if (index < 0) {
    const near = names.filter((n) => similarity(key, n) > 0.6);
    const tip = near.length ? ` (did you mean '${header[names.indexOf(near[0])]}'?)` : '';
    throw new Error(`${what} column '${name}' not found${tip}; the columns are: ${header.join(', ')}`);
  }
  return index;
}

function detect(header, candidates) {
  const names = header.map((h) => String(h).trim().toLowerCase());
  for (const candidate of candidates) {
    const index = names.indexOf(candidate);
    if (index >= 0) return index;
  }
  return -1;
}

export function makeContext(spec) {
  return { spec, warnings: [], credits: new Set(), online: spec.online !== false };
}

export async function locate(ctx, text, what = 'place') {
  const raw = String(text).trim();
  const coords = parseCoordinates(raw);
  if (coords) return { ...coords, name: raw };
  const city = findCity(raw);
  if (city) return { lat: city.lat, lon: city.lon, name: city.name };
  const country = findCountry(raw);
  if (country && ctx.countryFeature) {
    const item = ctx.countryFeature(country);
    if (item) return { ...centroidOf(item), name: country.label };
  }
  if (ctx.online) {
    try {
      const hit = await lookupOnline(raw);
      if (hit) {
        ctx.warnings.push(`'${raw}' was looked up online (OpenStreetMap Nominatim): ${hit.lat.toFixed(4)}, ${hit.lon.toFixed(4)}. Write these coordinates in the essay to keep the map the same offline`);
        ctx.credits.add('Place lookup © OpenStreetMap contributors');
        return { lat: hit.lat, lon: hit.lon, name: raw };
      }
    } catch (error) {
      ctx.warnings.push(`could not look up '${raw}' online (${error.message})`);
    }
  }
  const near = [...suggestCity(raw), ...suggestCountry(raw)].slice(0, 3);
  const tip = near.length ? ` (did you mean ${near.map((n) => `'${n}'`).join(' or ')}?)` : '';
  throw new Error(`${what} '${raw}' was not found${tip}; write it as coordinates such as 30.04, 31.23`);
}

async function path(ctx, target, what) {
  const stops = target.split(/\s*(?:->|→|=>)\s*/).filter(Boolean);
  const out = [];
  for (const stop of stops) out.push(await locate(ctx, stop, what));
  return out;
}

async function sequence(ctx, target, what) {
  const parts = target.split(/\s*;\s*|\s*->\s*/).filter(Boolean);
  const out = [];
  for (const part of parts) out.push(await locate(ctx, part, what));
  return out;
}

function knownColor(value) {
  return typeof value === 'string' && /^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(value.trim());
}

function sizeLegend(values, low, high) {
  const top = niceLength(high);
  const steps = [top, niceLength(high * 0.4), niceLength(high * 0.1)];
  return [...new Set(steps)].filter((v) => v > 0 && v >= low * 0.5).sort((a, b) => b - a);
}

async function pointsLayer(ctx, layer) {
  const { rows } = layer;
  if (!rows || rows.length < 2) throw new Error('points needs a table with a header row and at least one row');
  const header = rows[0];
  const body = rows.slice(1);
  const style = layer.style;
  const col = (key, what) => columnIndex(header, style[key], ctx, what);
  let latCol = style.lat ? col('lat', 'latitude') : detect(header, LAT);
  let lonCol = style.lon ? col('lon', 'longitude') : detect(header, LON);
  const placeCol = style.place ? col('place', 'place') : latCol >= 0 && lonCol >= 0 ? -1 : detect(header, NAME);
  if (latCol < 0 || lonCol < 0) {
    latCol = -1;
    lonCol = -1;
    if (placeCol < 0) throw new Error(`points needs latitude and longitude columns (or a place column); the columns are: ${header.join(', ')}`);
  }
  const labelStyle = (style.label || '').toLowerCase();
  let labelCol = -1;
  if (labelStyle && !['none', 'no', 'off'].includes(labelStyle)) {
    labelCol = ['yes', 'on'].includes(labelStyle) ? (placeCol >= 0 ? placeCol : detect(header, NAME)) : col('label', 'label');
  } else if (!labelStyle) {
    const auto = placeCol >= 0 ? placeCol : detect(header, NAME);
    labelCol = body.length <= 15 ? auto : -1;
  }
  const sizeValue = style.size;
  let sizeCol = -1;
  let fixedSize = null;
  if (sizeValue) {
    if (toNumber(sizeValue) !== null && !header.some((h) => String(h).trim().toLowerCase() === sizeValue.toLowerCase())) fixedSize = toNumber(sizeValue);
    else sizeCol = col('size', 'size');
  }
  const colorValue = style.color;
  let colorCol = -1;
  let fixedColor = null;
  if (colorValue) {
    const hit = header.findIndex((h) => String(h).trim().toLowerCase() === colorValue.toLowerCase());
    if (hit >= 0) colorCol = hit;
    else if (knownColor(colorValue)) fixedColor = colorValue;
    else throw new Error(`color '${colorValue}' is neither a column (${header.join(', ')}) nor a colour`);
  }
  const markers = [];
  const failed = [];
  for (const row of body) {
    let spot = null;
    if (latCol >= 0) {
      const lat = toNumber(row[latCol]);
      const lon = toNumber(row[lonCol]);
      if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) spot = { lat, lon };
    } else if (String(row[placeCol] ?? '').trim()) {
      try {
        spot = await locate(ctx, row[placeCol]);
      } catch (error) {
        failed.push(String(row[placeCol]));
      }
    }
    if (!spot) continue;
    markers.push({
      lat: spot.lat,
      lon: spot.lon,
      label: labelCol >= 0 ? String(row[labelCol] ?? '').trim() : '',
      sizeValue: sizeCol >= 0 ? toNumber(row[sizeCol]) : null,
      colorRaw: colorCol >= 0 ? row[colorCol] : null,
    });
  }
  if (failed.length) ctx.warnings.push(`${failed.length} place(s) were not found and are not on the map: ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? ', ...' : ''}`);
  if (!markers.length) throw new Error('no row of the points table could be placed on the map');
  const result = {
    kind: 'points',
    shape: style.shape || 'circle',
    markers,
    fixedColor: fixedColor || null,
    legend: style.legend || '',
    stroke: style.stroke || '#fff',
  };
  if (sizeCol >= 0) {
    const values = markers.map((m) => m.sizeValue).filter((v) => v !== null && v >= 0);
    const high = Math.max(...values);
    const min = Number(style['min-size'] || 3);
    const max = Number(style['max-size'] || 16);
    for (const m of markers) m.radius = m.sizeValue === null ? min : min + (max - min) * Math.sqrt(m.sizeValue / high);
    result.sizing = { title: style['size-legend'] || String(header[sizeCol]), min, max, high, steps: sizeLegend(values, 0, high) };
  } else {
    for (const m of markers) m.radius = fixedSize ?? 4.6;
  }
  if (colorCol >= 0) {
    const raw = markers.map((m) => m.colorRaw);
    const numeric = raw.map(toNumber);
    const title = style['color-legend'] || String(header[colorCol]);
    if (numeric.every((v) => v !== null) && style.categories !== 'yes') {
      const classes = Number(style.classes || 5);
      const scale = classify(numeric, { classes, method: style.method, breaks: style.breaks ? style.breaks.split(/[\s,]+/).map(Number) : null });
      const colors = paletteColors(style.palette, scale.breaks.length - 1, ctx.spec.accent);
      markers.forEach((m, i) => {
        m.color = colors[Math.max(classIndex(numeric[i], scale.breaks), 0)];
      });
      result.colors = { title, kind: 'classes', breaks: scale.breaks, palette: colors };
    } else {
      const names = [...new Set(raw.map((v) => String(v ?? '').trim()))];
      markers.forEach((m, i) => {
        m.color = CATEGORY[names.indexOf(String(raw[i] ?? '').trim()) % CATEGORY.length];
      });
      result.colors = { title, kind: 'categories', entries: names.map((n, i) => ({ name: n, color: CATEGORY[i % CATEGORY.length] })) };
    }
  }
  return result;
}

async function singlePoint(ctx, layer) {
  const spot = await locate(ctx, layer.target);
  const style = layer.style;
  const name = layer.fields[0] || '';
  return {
    kind: 'point',
    marker: {
      lat: spot.lat,
      lon: spot.lon,
      label: style.label === 'none' ? '' : style.label && !['yes', 'left', 'right', 'top', 'bottom'].includes(style.label) ? style.label : name,
      labelSide: ['left', 'right', 'top', 'bottom'].includes(style.label) ? style.label : '',
      radius: Number(style.size || 5),
      color: style.color || '',
      shape: style.shape || 'circle',
    },
    name,
    legend: style.legend || '',
  };
}

async function routeLayer(ctx, layer) {
  const stops = await path(ctx, layer.target, 'route stop');
  if (stops.length < 2) throw new Error(`route needs two or more places joined with ->, e.g. Cairo -> Luxor (got '${layer.target}')`);
  const style = layer.style;
  return {
    kind: 'route',
    stops,
    name: layer.fields[0] || '',
    color: style.color || '',
    width: Number(style.width || 2),
    dash: style.dash || '',
    arrow: style.arrow !== 'no',
    straight: style.curve === 'straight',
    legend: style.legend || layer.fields[0] || '',
    stopsShown: style.stops === 'yes',
  };
}

async function lineLayer(ctx, layer) {
  const stops = await sequence(ctx, layer.target, 'line point');
  if (stops.length < 2) throw new Error(`line needs two or more points separated by ; (got '${layer.target}')`);
  const style = layer.style;
  return {
    kind: 'line',
    stops,
    name: layer.fields[0] || '',
    color: style.color || '',
    width: Number(style.width || 2),
    dash: style.dash || '',
    legend: style.legend || layer.fields[0] || '',
    straight: style.curve === 'straight',
  };
}

async function areaLayer(ctx, layer) {
  const stops = await sequence(ctx, layer.target, 'area corner');
  if (stops.length < 3) throw new Error(`area needs three or more corners separated by ; (got '${layer.target}')`);
  const style = layer.style;
  return {
    kind: 'area',
    stops,
    name: layer.fields[0] || '',
    color: style.color || '',
    opacity: Number(style.opacity || 0.22),
    dash: style.dash || '',
    legend: style.legend || '',
    label: style.label !== 'none',
  };
}

async function circleLayer(ctx, layer) {
  const spot = await locate(ctx, layer.target);
  const radiusText = layer.fields[0] || '';
  const match = radiusText.match(/^(\d+(?:\.\d+)?)\s*(km|mi|m)?$/i);
  if (!match) throw new Error(`circle needs a radius such as '50 km' after the place (got '${radiusText}')`);
  const unit = (match[2] || 'km').toLowerCase();
  const km = Number(match[1]) * (unit === 'mi' ? 1.609344 : unit === 'm' ? 0.001 : 1);
  const style = layer.style;
  const polygon = geoCircle().center([spot.lon, spot.lat]).radius((km / 6371) * (180 / Math.PI)).precision(2)();
  return {
    kind: 'circle',
    geometry: polygon,
    center: spot,
    km,
    name: layer.fields[1] || '',
    color: style.color || '',
    dash: style.dash || '4 3',
    fill: style.fill || '',
    legend: style.legend || '',
  };
}

async function flowsLayer(ctx, layer) {
  const { rows } = layer;
  if (!rows || rows.length < 2) throw new Error('flows needs a table with from, to and value columns');
  const header = rows[0];
  const style = layer.style;
  const from = style.from ? columnIndex(header, style.from, ctx, 'from') : detect(header, FROM);
  const to = style.to ? columnIndex(header, style.to, ctx, 'to') : detect(header, TO);
  if (from < 0 || to < 0) throw new Error(`flows needs 'from' and 'to' columns (or from=... to=...); the columns are: ${header.join(', ')}`);
  let valueCol = style.value ? columnIndex(header, style.value, ctx, 'value') : -1;
  if (valueCol < 0) valueCol = header.findIndex((_, i) => i !== from && i !== to && rows.slice(1).every((r) => toNumber(r[i]) !== null));
  const flows = [];
  for (const row of rows.slice(1)) {
    const a = await locate(ctx, row[from], 'flow origin');
    const b = await locate(ctx, row[to], 'flow destination');
    flows.push({ a, b, value: valueCol >= 0 ? toNumber(row[valueCol]) ?? 1 : 1 });
  }
  const high = Math.max(...flows.map((f) => f.value));
  const max = Number(style['max-width'] || 9);
  return {
    kind: 'flows',
    flows,
    high,
    max,
    color: style.color || '',
    arrow: style.arrow !== 'no',
    legend: style.legend || (valueCol >= 0 ? String(header[valueCol]) : ''),
    steps: valueCol >= 0 ? sizeLegend(flows.map((f) => f.value), 0, high) : [],
    hasValue: valueCol >= 0,
  };
}

function geojsonLayer(ctx, layer) {
  const data = layer.data;
  const features = data.type === 'FeatureCollection' ? data.features : data.type === 'Feature' ? [data] : [{ type: 'Feature', properties: {}, geometry: data }];
  const style = layer.style;
  const result = {
    kind: 'geojson',
    features: features.filter((f) => f && f.geometry),
    color: style.color || '',
    fill: style.fill || '',
    labels: style.label || '',
    value: style.value || '',
    width: Number(style.width || 1.4),
    dash: style.dash || '',
    legend: style.legend || '',
    palette: style.palette,
    classes: Number(style.classes || 5),
    method: style.method,
    name: layer.fields[0] || '',
  };
  if (result.value) {
    const values = result.features.map((f) => toNumber(f.properties?.[result.value]));
    if (values.every((v) => v === null)) throw new Error(`no feature has a numeric '${result.value}' property`);
    const scale = classify(values.filter((v) => v !== null), { classes: result.classes, method: result.method });
    result.scale = scale;
    result.palette = paletteColors(style.palette, scale.breaks.length - 1, ctx.spec.accent);
    result.values = values;
  }
  return result;
}

function highlightLayer(ctx, layer) {
  const list = layer.target.split(/\s*[,;]\s*/).filter(Boolean);
  const entries = [];
  for (const name of list) {
    const group = findRegion(name);
    if (group) {
      entries.push(...group);
      continue;
    }
    const country = findCountry(name);
    if (!country) throw new Error(`highlight: '${name}' is not a country${suggestCountry(name).length ? ` (did you mean '${suggestCountry(name)[0]}'?)` : ''}`);
    entries.push(country);
  }
  return { kind: 'highlight', entries, color: layer.style.color || '', legend: layer.style.legend || layer.fields[0] || '' };
}

export async function resolveLayers(ctx) {
  const out = [];
  for (const layer of ctx.spec.layers) {
    try {
      switch (layer.kind) {
        case 'point': out.push(await singlePoint(ctx, layer)); break;
        case 'points': out.push(await pointsLayer(ctx, layer)); break;
        case 'route': out.push(await routeLayer(ctx, layer)); break;
        case 'line': out.push(await lineLayer(ctx, layer)); break;
        case 'area': out.push(await areaLayer(ctx, layer)); break;
        case 'circle': out.push(await circleLayer(ctx, layer)); break;
        case 'flows': out.push(await flowsLayer(ctx, layer)); break;
        case 'geojson': out.push(geojsonLayer(ctx, layer)); break;
        case 'highlight': out.push(highlightLayer(ctx, layer)); break;
        case 'label': out.push({ kind: 'label', spot: await locate(ctx, layer.target, 'label position'), text: layer.fields[0] || '', style: layer.style }); break;
        case 'shade': out.push({ kind: 'shade', layer }); break;
        default: throw new Error(`unknown layer '${layer.kind}'`);
      }
    } catch (error) {
      throw new Error(`${layer.kind}: ${error.message}`);
    }
  }
  return out;
}
