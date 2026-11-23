import {
  geoAlbers, geoAlbersUsa, geoAzimuthalEqualArea, geoBounds, geoConicConformal, geoConicEqualArea,
  geoEqualEarth, geoEquirectangular, geoGraticule, geoMercator, geoNaturalEarth1, geoOrthographic, geoPath,
  geoStereographic, geoTransverseMercator,
} from 'd3-geo';
import { geoMollweide, geoRobinson, geoWinkel3 } from 'd3-geo-projection';
import { CATEGORY, INK, MUTE, classIndex, classify, formatNumber, paletteColors } from './color.mjs';
import {
  Placer, esc, haloText, legendLayout, legendTitle, marker, mutedText, northArrow, r2, scaleBar, swatch, textWidth,
} from './draw.mjs';
import { loadSubdivisions, loadUnitedStates, loadWorld } from './geodata.mjs';
import { columnIndex, locate, makeContext, resolveLayers, toNumber } from './layers.mjs';
import {
  allCities, findCountry, findRegion, mainland, normalize, regionNames, similarity, suggestCountry,
} from './places.mjs';
import { fitZoom, isTileStyle, tileMosaic, tileProjection, tileStyles } from './tiles.mjs';

const PROJECTIONS = {
  mercator: geoMercator,
  'natural-earth': geoNaturalEarth1,
  'equal-earth': geoEqualEarth,
  robinson: geoRobinson,
  'winkel-tripel': geoWinkel3,
  mollweide: geoMollweide,
  orthographic: geoOrthographic,
  globe: geoOrthographic,
  albers: geoAlbers,
  'albers-usa': geoAlbersUsa,
  conic: geoConicEqualArea,
  'conic-conformal': geoConicConformal,
  azimuthal: geoAzimuthalEqualArea,
  stereographic: geoStereographic,
  equirectangular: geoEquirectangular,
  'plate-carree': geoEquirectangular,
  'transverse-mercator': geoTransverseMercator,
};

const WORLDISH = new Set(['natural-earth', 'equal-earth', 'robinson', 'winkel-tripel', 'mollweide', 'equirectangular', 'plate-carree']);
const THEME = {
  ocean: '#e6eef3', land: '#f2f0e9', neighbour: '#e8e6de', focus: '#fbfaf6', border: '#b3b0a4', coast: '#8d8b82',
  frame: '#6f6d64', grid: '#c9d6de', nodata: '#dedbd0',
};

function mixColor(a, b, t) {
  const read = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [read(a), read(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

const wrap = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;

function bboxPolygon(box) {
  const [west, south, east, north] = box;
  return geoGraticule().extent([[west, south], [east, north]]).outline();
}

function boundsInfo(extent) {
  const [[west, south], [east, north]] = geoBounds(extent);
  const width = east >= west ? east - west : east - west + 360;
  return { west, south, east, north, width, height: north - south, lon: wrap(west + width / 2), lat: (south + north) / 2 };
}

function extentOfPoints(points) {
  const unique = new Map(points.map((p) => [`${p[0].toFixed(3)},${p[1].toFixed(3)}`, p]));
  const list = [...unique.values()];
  if (list.length < 2) {
    const [lon, lat] = list[0];
    return bboxPolygon([lon - 0.4, lat - 0.3, lon + 0.4, lat + 0.3]);
  }
  const lons = list.map((p) => p[0]);
  const lats = list.map((p) => p[1]);
  const flat = Math.max(...lats) - Math.min(...lats) < 1e-6;
  const thin = Math.max(...lons) - Math.min(...lons) < 1e-6;
  const pad = (v) => (flat || thin ? 0.2 : v);
  return bboxPolygon([Math.min(...lons) - pad(0), Math.min(...lats) - pad(0), Math.max(...lons) + pad(0), Math.max(...lats) + pad(0)]);
}

function chooseProjection(name, info, extent, hasShade, focusUSA) {
  if (name && name !== 'auto') {
    if (!PROJECTIONS[name]) {
      throw new Error(`unknown projection '${name}'; use one of: ${Object.keys(PROJECTIONS).join(', ')}`);
    }
    return name;
  }
  if (!extent) return 'natural-earth';
  if (focusUSA) return 'albers-usa';
  if (info.width > 140 || info.height > 80) return hasShade ? 'equal-earth' : 'natural-earth';
  if (Math.abs(info.lat) > 62 || info.north > 78) return 'azimuthal';
  if (info.width < 14 && info.height < 14) return 'mercator';
  return 'conic';
}

function buildProjection(name, info, spec) {
  const make = PROJECTIONS[name];
  const projection = make();
  const lon = info ? info.lon : 0;
  const lat = info ? info.lat : 0;
  if (['conic', 'albers', 'conic-conformal'].includes(name)) {
    const span = info ? info.height : 40;
    const south = info ? info.south : -30;
    const north = info ? info.north : 60;
    projection.rotate([-lon, 0]).center([0, lat]).parallels([south + span / 6, north - span / 6]);
  } else if (['azimuthal', 'stereographic', 'orthographic', 'globe'].includes(name)) {
    const turn = spec.rotate || [lon, name === 'orthographic' || name === 'globe' ? lat || 15 : lat];
    projection.rotate([-turn[0], -turn[1]]);
  } else if (name === 'transverse-mercator') {
    projection.rotate([-lon, 0]);
  } else if (WORLDISH.has(name) && info && info.width < 300) {
    projection.rotate([-lon, 0]);
  }
  return projection.precision(0.2);
}

function sphereRequested(name) {
  return name === 'orthographic' || name === 'globe';
}

function fit(projection, extent, width, height, pad) {
  const target = extent || { type: 'Sphere' };
  projection.fitExtent([[pad, pad], [width - pad, height - pad]], target);
}

function autoHeight(projection, extent, width, pad, name) {
  const target = extent || { type: 'Sphere' };
  projection.fitWidth(width - 2 * pad, target);
  const [[, y0], [, y1]] = geoPath(projection).bounds(target);
  const raw = y1 - y0 + 2 * pad;
  const sphere = name === 'orthographic' || name === 'globe';
  const limits = sphere ? [0.7 * width, 0.9 * width] : [0.42 * width, 1.18 * width];
  return Math.round(Math.max(limits[0], Math.min(limits[1], raw)));
}

async function focusEntries(ctx, names) {
  const entries = [];
  for (const name of names) {
    const group = findRegion(name);
    if (group) {
      entries.push(...group);
      continue;
    }
    if (['world', 'global', 'earth'].includes(normalize(name))) continue;
    const country = findCountry(name);
    if (!country) {
      const near = suggestCountry(name);
      const tip = near.length ? ` (did you mean '${near[0]}'?)` : ` (regions: ${regionNames().join(', ')})`;
      throw new Error(`focus '${name}' is not a country or region${tip}`);
    }
    entries.push(country);
  }
  return [...new Set(entries)];
}

function joinFeatures(ctx, layer, features, nameOf, isWorld) {
  const rows = layer.rows;
  if (!rows || rows.length < 2) throw new Error('shade needs a table with a header row and data rows');
  const header = rows[0];
  const body = rows.slice(1);
  const style = layer.style;
  const index = new Map();
  for (const feature of features) {
    const key = isWorld ? (feature.entry ? feature.entry.name : null) : normalize(nameOf(feature));
    if (key) index.set(key, feature);
  }
  const resolve = (cell) => {
    if (isWorld) {
      const entry = findCountry(cell);
      return entry ? index.get(entry.name) : null;
    }
    const key = normalize(cell);
    if (index.has(key)) return index.get(key);
    let best = null;
    let score = 0.8;
    for (const [other, feature] of index) {
      const s = similarity(key, other);
      if (s > score) {
        score = s;
        best = feature;
      }
    }
    return best;
  };
  let joinCol = style.join ? columnIndex(header, style.join, ctx, 'join') : -1;
  if (joinCol < 0) {
    let top = 0;
    header.forEach((_, c) => {
      const hits = body.filter((row) => resolve(row[c])).length;
      if (hits > top) {
        top = hits;
        joinCol = c;
      }
    });
    if (joinCol < 0 || top < Math.max(1, body.length * 0.3)) {
      const tip = isWorld ? 'country names or ISO codes' : 'the names of the areas';
      throw new Error(`could not find a column of ${tip} in the table (columns: ${header.join(', ')}); name it with join=...`);
    }
  }
  let valueCol = style.value ? columnIndex(header, style.value, ctx, 'value') : -1;
  if (valueCol < 0) {
    valueCol = header.findIndex((_, c) => c !== joinCol && body.filter((row) => toNumber(row[c]) !== null).length >= body.length * 0.8);
    if (valueCol < 0) throw new Error(`no numeric column found in the table (columns: ${header.join(', ')}); name it with value=...`);
  }
  const values = new Map();
  const unmatched = [];
  for (const row of body) {
    const feature = resolve(row[joinCol]);
    const value = toNumber(row[valueCol]);
    if (!feature) unmatched.push(String(row[joinCol]));
    else if (value !== null) values.set(feature, value);
  }
  if (unmatched.length) {
    const hint = isWorld && suggestCountry(unmatched[0]).length ? ` (did you mean '${suggestCountry(unmatched[0])[0]}'?)` : '';
    ctx.warnings.push(`${unmatched.length} row(s) did not match any ${isWorld ? 'country' : 'area'} and are not shaded: ${unmatched.slice(0, 6).join(', ')}${unmatched.length > 6 ? ', ...' : ''}${hint}`);
  }
  return { values, title: style.legend || String(header[valueCol]), valueName: String(header[valueCol]) };
}

function groupLegend(width, height, svg) {
  return { width, height, svg };
}

function legendShade(scale, colors, title, nodata) {
  const labels = scale.breaks.map((b) => formatNumber(b, scale.breaks[scale.breaks.length - 1] - scale.breaks[0] < 10 ? 2 : 0));
  const widest = Math.max(...labels.map((l) => textWidth(l, 10.5)));
  const box = Math.max(34, widest + 10);
  const lead = textWidth(labels[0], 10.5) / 2;
  const count = scale.breaks.length - 1;
  let inner = '';
  for (let i = 0; i < count; i += 1) inner += swatch(i * box, 16, colors[i]).replace('width="22"', `width="${box}"`);
  scale.breaks.forEach((b, i) => {
    inner += mutedText(labels[i], i * box, 41, 'middle');
  });
  let svg = legendTitle(title) + `<g transform="translate(${r2(lead)} 0)">${inner}</g>`;
  let width = Math.max(lead + count * box + textWidth(labels[count], 10.5) / 2, textWidth(title, 11));
  if (nodata) {
    const x = width + 18;
    svg += swatch(x, 16, THEME.nodata) + mutedText('No data', x + 28, 25);
    width = x + 28 + textWidth('No data', 10.5);
  }
  return groupLegend(width, 46, svg);
}

function legendCategories(title, entries, shape = 'circle') {
  let svg = title ? legendTitle(title) : '';
  let x = 0;
  const top = title ? 16 : 0;
  for (const entry of entries) {
    svg += marker(shape, x + 6, top + 6, 5, entry.color, '#fff', 0.8) + mutedText(entry.name, x + 16, top + 10);
    x += 24 + textWidth(entry.name, 10.5);
  }
  return groupLegend(Math.max(x, textWidth(title || '', 11)), title ? 26 : 14, svg);
}

function legendSizes(layer) {
  const { sizing } = layer;
  const radius = (v) => sizing.min + (sizing.max - sizing.min) * Math.sqrt(v / sizing.high);
  const steps = sizing.steps;
  const biggest = radius(steps[0]);
  let svg = legendTitle(sizing.title);
  let width = textWidth(sizing.title, 11);
  const base = 18 + biggest * 2;
  svg += steps.map((v) => `<circle cx="${r2(biggest + 1)}" cy="${r2(base - radius(v))}" r="${r2(radius(v))}" fill="none" stroke="${MUTE}" stroke-width="0.8"/>`).join('');
  let last = -Infinity;
  steps.forEach((v) => {
    const edge = base - radius(v) * 2;
    const y = Math.max(edge, last + 12);
    last = y;
    svg += `<path d="M${r2(biggest + 1)} ${r2(edge)}H${r2(biggest * 2 + 8)}L${r2(biggest * 2 + 10)} ${r2(y)}" fill="none" stroke="${MUTE}" stroke-width="0.5"/>` + mutedText(formatNumber(v), biggest * 2 + 13, y + 3.5);
    width = Math.max(width, biggest * 2 + 16 + textWidth(formatNumber(v), 10.5));
  });
  return groupLegend(width, Math.max(base, last) + 6, svg);
}

function arrowDef(defs, color, size) {
  const id = `arrow-${defs.size}`;
  const key = `${color}-${size}`;
  if (!defs.has(key)) {
    defs.set(key, { id, svg: `<marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="${size}" markerHeight="${size}" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 1L10 5L0 9Z" fill="${color}"/></marker>` });
  }
  return defs.get(key).id;
}

function polyline(points, projection, straight) {
  if (straight) {
    const screen = points.map((p) => projection([p.lon, p.lat]));
    if (screen.some((p) => !p)) return '';
    return `M${screen.map((p) => `${r2(p[0])} ${r2(p[1])}`).join('L')}`;
  }
  return geoPath(projection)({ type: 'LineString', coordinates: points.map((p) => [p.lon, p.lat]) }) || '';
}

function collectExtent(resolved, focusPoints) {
  const points = [...focusPoints];
  for (const layer of resolved) {
    if (layer.kind === 'point') points.push([layer.marker.lon, layer.marker.lat]);
    else if (layer.kind === 'points') layer.markers.forEach((m) => points.push([m.lon, m.lat]));
    else if (['route', 'line', 'area'].includes(layer.kind)) layer.stops.forEach((s) => points.push([s.lon, s.lat]));
    else if (layer.kind === 'flows') layer.flows.forEach((f) => points.push([f.a.lon, f.a.lat], [f.b.lon, f.b.lat]));
    else if (layer.kind === 'circle') {
      const box = geoBounds(layer.geometry);
      points.push(box[0], box[1], [box[0][0], box[1][1]], [box[1][0], box[0][1]]);
    } else if (layer.kind === 'geojson') {
      layer.features.forEach((f) => {
        const box = geoBounds(f);
        points.push(box[0], box[1], [box[0][0], box[1][1]], [box[1][0], box[0][1]]);
      });
    } else if (layer.kind === 'label') points.push([layer.spot.lon, layer.spot.lat]);
  }
  return points;
}

export async function renderMap(spec) {
  const ctx = makeContext(spec);
  const width = Math.max(320, Math.round(spec.width));
  const tile = isTileStyle(spec.basemap);
  if (!tile && !['world', 'none'].includes(spec.basemap)) {
    throw new Error(`basemap must be world, none, ${tileStyles().join(', ')} (not '${spec.basemap}')`);
  }
  const vector = spec.basemap === 'world';
  const focusNames = spec.focus || [];
  const entries = await focusEntries(ctx, focusNames);
  const globeRequested = ['orthographic', 'globe'].includes(spec.projection) && !spec.zoom;
  const detail = spec.detail || (entries.length && !globeRequested ? '50m' : '110m');
  let world = null;
  const getWorld = (level = detail) => {
    world = world || loadWorld(level);
    return world;
  };
  ctx.countryFeature = (entry) => loadWorld('110m').countries.find((f) => f.entry === entry);
  if (vector || entries.length) getWorld();

  const shadeLayers = spec.layers.filter((l) => l.kind === 'shade');
  if (shadeLayers.length > 1) throw new Error('only one shade layer is allowed per map');
  if (shadeLayers.length && tile) throw new Error("shade needs the vector basemap (basemap: world), not map tiles");

  const resolved = await resolveLayers(ctx);
  const focusFeatures = entries.map((entry) => {
    const item = getWorld().countries.find((f) => f.entry === entry);
    return item ? (spec.mainland === false ? item : mainland(item)) : null;
  }).filter(Boolean);
  const focusUSA = entries.length === 1 && entries[0].a3 === 'USA' && spec.mainland !== false;

  const level = String(spec.level || '0');
  let subs = [];
  let credits = [];
  if (level !== '0' && vector) {
    if (!entries.length) throw new Error("level needs a focus country, e.g. 'focus: Egypt'");
    for (const entry of entries) {
      if (entry.a3 === 'USA' && ['1', 'states', '2', 'counties'].includes(level)) {
        const us = loadUnitedStates(['2', 'counties'].includes(level) ? 'counties' : 'states');
        const list = ['2', 'counties'].includes(level) ? us.counties : us.states;
        list.forEach((f) => subs.push({ feature: f, name: f.properties.name, entry }));
      } else {
        try {
          const data = await loadSubdivisions(entry.a3, Number(level));
          data.features.forEach((f) => subs.push({ feature: f, name: f.properties.name, entry }));
          credits.push('Boundaries: geoBoundaries (CC BY / ODbL)');
        } catch (error) {
          throw new Error(`could not load level ${level} boundaries for ${entry.label} (${error.message})`);
        }
      }
    }
  }

  let extent = null;
  let box = null;
  let centerSpot = null;
  const ratio = spec.ratio || null;
  if (spec.bbox) {
    box = spec.bbox;
    extent = bboxPolygon(box);
  } else if (spec.center) {
    centerSpot = await locate(ctx, spec.center, 'center');
    const km = spec.span || 50;
    const aspect = ratio ? 1 / ratio : 0.75;
    const dLat = (km * aspect) / 2 / 111.2;
    const dLon = km / 2 / (111.2 * Math.max(Math.cos((centerSpot.lat * Math.PI) / 180), 0.05));
    box = [centerSpot.lon - dLon, centerSpot.lat - dLat, centerSpot.lon + dLon, centerSpot.lat + dLat];
    extent = bboxPolygon(box);
  } else if (focusFeatures.length) {
    extent = { type: 'FeatureCollection', features: focusFeatures };
  } else {
    const points = collectExtent(resolved, []);
    if (points.length && !resolved.some((l) => l.kind === 'highlight' || l.kind === 'shade')) extent = extentOfPoints(points);
  }
  if (!extent && tile) throw new Error("a tile basemap needs 'focus', 'center' with 'span', 'bbox' or some points to show");

  const info = extent ? boundsInfo(extent) : null;
  const hasShade = shadeLayers.length > 0;
  const pad = spec.pad ?? (focusFeatures.length || spec.bbox || spec.center ? 12 : 34);
  const accent = spec.accent;

  let projection;
  let projectionName;
  let height;
  let tileLayer = null;
  if (tile) {
    const bounds = info;
    const frame = box || [bounds.west, bounds.south, bounds.east, bounds.north];
    const h = ratio ? Math.round(width / ratio) : null;
    const trial = h || Math.round(width * 0.72);
    const zoom = spec.zoom ?? fitZoom(frame, width, trial, pad);
    const center = centerSpot || { lat: (frame[1] + frame[3]) / 2, lon: (frame[0] + frame[2]) / 2 };
    height = trial;
    projection = tileProjection(center, zoom, width, height);
    projectionName = 'mercator';
    tileLayer = await tileMosaic(spec.basemap, projection, zoom, width, height, spec.sharp);
    credits.push(tileLayer.credit);
  } else {
    const focusPoints = extent ? extent : null;
    projectionName = chooseProjection(spec.projection, info, extent, hasShade, focusUSA);
    let target = focusPoints;
    if (!target && !sphereRequested(projectionName)) target = bboxPolygon([-180, -57, 180, 84]);
    projection = buildProjection(projectionName, projectionName === 'albers-usa' ? null : info, spec);
    const globe = ['orthographic', 'globe'].includes(projectionName);
    if (globe) target = null;
    height = ratio ? Math.round(width / ratio) : autoHeight(projection, target, width, pad, projectionName);
    fit(projection, target, width, height, pad);
  }
  const sphereMode = ['orthographic', 'globe'].includes(projectionName);
  if (!tile && !sphereMode) projection.clipExtent([[0, 0], [width, height]]);
  const path = geoPath(projection).pointRadius(3);
  const placer = new Placer(width, height);
  const spherePath = sphereMode ? path({ type: 'Sphere' }) : null;

  const base = [];
  const over = [];
  const top = [];
  const defs = new Map();
  const legends = [];
  const inView = (feature) => {
    const bounds = path.bounds(feature);
    return Number.isFinite(bounds[0][0]) && bounds[1][0] > 0 && bounds[0][0] < width && bounds[1][1] > 0 && bounds[0][1] < height;
  };

  if (tile) {
    base.push(tileLayer.svg);
  } else {
    base.push(sphereMode ? `<path d="${spherePath}" fill="${spec.ocean || THEME.ocean}"/>` : `<rect width="${width}" height="${height}" fill="${vector ? spec.ocean || THEME.ocean : '#fff'}"/>`);
    if (vector && spec.graticule) {
      const step = spec.graticule === true ? (info && info.width < 40 ? 5 : info && info.width < 100 ? 10 : 30) : Number(spec.graticule);
      base.push(`<path d="${path(geoGraticule().step([step, step])())}" fill="none" stroke="${THEME.grid}" stroke-width="0.6"/>`);
    }
  }

  let shadeInfo = null;
  let shadeScale = null;
  let shadeColors = [];
  let nodataSeen = false;
  const focusIds = new Set(entries.map((e) => e.name));
  if (vector) {
    const { borders, coast } = getWorld();
    const countries = getWorld().countries.filter((f) => f.entry?.a3 !== 'ATA' || focusIds.has(f.entry.name) || (info && info.south < -60));
    const useSubs = subs.length > 0;
    const shadeTargets = useSubs ? subs.map((s) => s.feature) : countries;
    if (hasShade) {
      const layer = shadeLayers[0];
      const nameOf = (feature) => feature.properties?.name || '';
      shadeInfo = joinFeatures(ctx, layer, shadeTargets.map((f) => Object.assign(f, f.entry ? {} : { entry: null })), nameOf, !useSubs);
      const numbers = [...shadeInfo.values.values()];
      const style = layer.style;
      shadeScale = classify(numbers, {
        classes: Number(style.classes || 5),
        method: style.method,
        breaks: style.breaks ? style.breaks.split(/[\s,]+/).map(Number).filter(Number.isFinite) : null,
      });
      shadeColors = paletteColors(style.palette, shadeScale.breaks.length - 1, accent);
      if (style.reverse === 'yes') shadeColors = shadeColors.slice().reverse();
    }
    const fillFor = (feature) => {
      if (!hasShade) return null;
      const value = shadeInfo.values.get(feature);
      if (value === undefined) return THEME.nodata;
      return shadeColors[Math.max(classIndex(value, shadeScale.breaks), 0)];
    };
    const highlights = new Map();
    resolved.filter((l) => l.kind === 'highlight').forEach((l, i) => {
      l.entries.forEach((entry) => highlights.set(entry.name, l.color || CATEGORY[(i + 1) % CATEGORY.length]));
    });
    const accentTint = mixColor('#ffffff', accent, 0.55);
    const landFill = (feature) => {
      if (!feature.entry) return THEME.land;
      if (highlights.has(feature.entry.name)) return highlights.get(feature.entry.name);
      if (focusIds.size && sphereMode) return focusIds.has(feature.entry.name) ? accentTint : THEME.land;
      if (focusIds.size) return focusIds.has(feature.entry.name) ? THEME.focus : THEME.neighbour;
      return spec.land || THEME.land;
    };
    const land = [];
    for (const feature of countries) {
      const d = path(feature);
      if (!d) continue;
      const shaded = !useSubs ? fillFor(feature) : null;
      if (shaded === THEME.nodata && inView(feature)) nodataSeen = true;
      land.push(`<path d="${d}" fill="${shaded || landFill(feature)}"${highlights.has(feature.entry?.name) ? ' fill-opacity="0.75"' : ''}/>`);
    }
    base.push(`<g>${land.join('')}</g>`);
    if (useSubs) {
      const parts = subs.map((s) => {
        const d = path(s.feature);
        if (!d) return '';
        const fill = hasShade ? fillFor(s.feature) : 'none';
        if (hasShade && fill === THEME.nodata) nodataSeen = true;
        return `<path d="${d}" fill="${fill}" stroke="${hasShade ? '#fff' : THEME.coast}" stroke-width="${hasShade ? 0.8 : 0.6}" stroke-linejoin="round"/>`;
      });
      base.push(`<g>${parts.join('')}</g>`);
    }
    if (spec.borders !== false) base.push(`<path d="${path(borders)}" fill="none" stroke="${THEME.border}" stroke-width="0.6" stroke-linejoin="round"/>`);
    base.push(`<path d="${path(coast)}" fill="none" stroke="${THEME.coast}" stroke-width="0.6" stroke-linejoin="round"/>`);
    if (focusFeatures.length && !hasShade) {
      const outline = focusFeatures.map((f) => path(f)).filter(Boolean).join('');
      base.push(`<path d="${outline}" fill="none" stroke="${THEME.frame}" stroke-width="${useSubs ? 0.7 : 1.1}" stroke-linejoin="round"/>`);
    }

    const names = spec.names || 'auto';
    if (names !== 'none' && (names !== 'auto' || entries.length || hasShade === false && info && info.width < 60)) {
      const list = countries
        .map((feature) => ({ feature, size: feature.entry && focusIds.has(feature.entry.name) ? 12.5 : 10 }))
        .sort((a, b) => b.size - a.size);
      const chosen = [];
      for (const { feature, size } of list) {
        if (!feature.entry || !inView(feature)) continue;
        const part = mainland(feature);
        const bounds = path.bounds(part);
        const available = Math.min(bounds[1][0], width) - Math.max(bounds[0][0], 0);
        const text = feature.name;
        if (available < textWidth(text, size) * 0.85) continue;
        const [x, y] = path.centroid(part);
        if (!Number.isFinite(x) || x < 4 || x > width - 4 || y < 4 || y > height - 4) continue;
        chosen.push({ text, x, y, size, focus: focusIds.has(feature.entry.name) });
      }
      ctx.names = chosen;
    }
  }

  for (const layer of resolved.filter((l) => l.kind === 'geojson')) {
    const parts = [];
    const color = layer.color || accent;
    layer.features.forEach((feature, i) => {
      const kind = feature.geometry.type;
      const d = path(feature);
      if (!d) return;
      if (/Point$/.test(kind)) {
        const [x, y] = path.centroid(feature);
        parts.push(marker('circle', x, y, 4.2, layer.color || '#c0392b'));
        placer.reserveCircle(x, y, 5);
      } else if (/LineString$/.test(kind)) {
        parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${layer.width}"${layer.dash ? ` stroke-dasharray="${layer.dash}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`);
      } else {
        let fill = layer.fill || color;
        let opacity = layer.fill ? 1 : 0.18;
        if (layer.value) {
          const v = layer.values[i];
          fill = v === null ? THEME.nodata : layer.palette[Math.max(classIndex(v, layer.scale.breaks), 0)];
          opacity = 1;
        }
        parts.push(`<path d="${d}" fill="${fill}" fill-opacity="${opacity}" stroke="${layer.value ? '#fff' : color}" stroke-width="${layer.value ? 0.8 : layer.width}" stroke-linejoin="round"${layer.dash ? ` stroke-dasharray="${layer.dash}"` : ''}/>`);
      }
      if (layer.labels && feature.properties?.[layer.labels] !== undefined) {
        const [x, y] = path.centroid(feature);
        if (Number.isFinite(x)) layer.pending = (layer.pending || []).concat({ text: String(feature.properties[layer.labels]), x, y });
      }
    });
    over.push(`<g>${parts.join('')}</g>`);
    if (layer.value) legends.push(legendShade(layer.scale, layer.palette, layer.legend || layer.value, false));
    else if (layer.legend) legends.push(legendCategories('', [{ name: layer.legend, color }], 'square'));
  }

  let colorIndex = 0;
  const nextColor = (given) => given || [accent, '#c0392b', '#2e7d32', '#d98200', '#6a3d9a', '#0e8a8a'][colorIndex++ % 6];

  for (const layer of resolved.filter((l) => l.kind === 'highlight')) {
    if (layer.legend) legends.push(legendCategories('', [{ name: layer.legend, color: layer.color || CATEGORY[1] }], 'square'));
  }

  for (const layer of resolved.filter((l) => l.kind === 'area')) {
    const color = nextColor(layer.color || '#d98200');
    const ring = [...layer.stops, layer.stops[0]].map((p) => [p.lon, p.lat]);
    const d = path({ type: 'Polygon', coordinates: [ring] });
    if (d) over.push(`<path d="${d}" fill="${color}" fill-opacity="${layer.opacity}" stroke="${color}" stroke-width="1.6"${layer.dash ? ` stroke-dasharray="${layer.dash}"` : ''} stroke-linejoin="round"/>`);
    if (layer.name && layer.label) {
      const [x, y] = path.centroid({ type: 'Polygon', coordinates: [ring] });
      if (Number.isFinite(x)) layer.pending = [{ text: layer.name, x, y }];
    }
    if (layer.legend) legends.push(legendCategories('', [{ name: layer.legend, color }], 'square'));
  }

  for (const layer of resolved.filter((l) => l.kind === 'circle')) {
    const color = layer.color || INK;
    const d = path(layer.geometry);
    if (d) over.push(`<path d="${d}" fill="${layer.fill || 'none'}" fill-opacity="0.15" stroke="${color}" stroke-width="1.3" stroke-dasharray="${layer.dash}"/>`);
    if (layer.name) {
      const edge = projection([layer.center.lon, layer.center.lat]);
      if (edge) layer.pending = [{ text: layer.name, x: edge[0], y: edge[1] - 1 }];
    }
    if (layer.legend) legends.push(legendCategories('', [{ name: layer.legend, color }], 'square'));
  }

  const flowLegends = [];
  for (const layer of resolved.filter((l) => l.kind === 'flows')) {
    const color = nextColor(layer.color);
    const arrowId = layer.arrow ? arrowDef(defs, color, 8) : null;
    const sorted = layer.flows.slice().sort((a, b) => b.value - a.value);
    const widthOf = (v) => 1 + (layer.max - 1) * Math.sqrt(v / layer.high);
    for (const flow of sorted) {
      const a = projection([flow.a.lon, flow.a.lat]);
      const b = projection([flow.b.lon, flow.b.lat]);
      if (!a || !b) continue;
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const bend = 0.22;
      const control = [mid[0] - dy * bend, mid[1] + dx * bend];
      const w = layer.hasValue ? widthOf(flow.value) : 2;
      const end = layer.arrow ? shorten(control, b, 5 + w * 0.6) : b;
      over.push(`<path d="M${r2(a[0])} ${r2(a[1])}Q${r2(control[0])} ${r2(control[1])} ${r2(end[0])} ${r2(end[1])}" fill="none" stroke="${color}" stroke-width="${r2(w)}" stroke-opacity="0.6" stroke-linecap="round"${arrowId ? ` marker-end="url(#${arrowId})"` : ''}/>`);
    }
    if (layer.hasValue && layer.steps.length) {
      let svg = legendTitle(layer.legend || 'Flow');
      let x = 0;
      layer.steps.slice().reverse().forEach((v) => {
        const w = widthOf(v);
        svg += `<path d="M${x} ${r2(24)}H${x + 26}" stroke="${color}" stroke-opacity="0.6" stroke-width="${r2(w)}"/>` + mutedText(formatNumber(v), x + 30, 28);
        x += 34 + textWidth(formatNumber(v), 10.5);
      });
      flowLegends.push(groupLegend(Math.max(x, textWidth(layer.legend || 'Flow', 11)), 34, svg));
    } else if (layer.legend) {
      flowLegends.push(legendCategories('', [{ name: layer.legend, color }], 'square'));
    }
  }
  legends.push(...flowLegends);

  const routeLegend = [];
  for (const layer of resolved.filter((l) => l.kind === 'route' || l.kind === 'line')) {
    const color = nextColor(layer.color);
    const d = polyline(layer.stops, projection, layer.straight);
    if (!d) continue;
    const arrowId = layer.kind === 'route' && layer.arrow ? arrowDef(defs, color, 6 + layer.width * 2.4) : null;
    over.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${layer.width}"${layer.dash ? ` stroke-dasharray="${layer.dash}"` : ''} stroke-linecap="round" stroke-linejoin="round"${arrowId ? ` marker-end="url(#${arrowId})"` : ''}/>`);
    if (layer.kind === 'route' && layer.stopsShown) {
      layer.stops.forEach((s) => {
        const p = projection([s.lon, s.lat]);
        if (p) over.push(marker('circle', p[0], p[1], 3.2, '#fff', color, 1.6));
      });
    }
    if (layer.legend) routeLegend.push({ name: layer.legend, color, dash: layer.dash, width: layer.width });
  }
  if (routeLegend.length) {
    let svg = '';
    let x = 0;
    routeLegend.forEach((item) => {
      svg += `<path d="M${x} 6H${x + 24}" stroke="${item.color}" stroke-width="${item.width}"${item.dash ? ` stroke-dasharray="${item.dash}"` : ''}/>` + mutedText(item.name, x + 30, 10);
      x += 38 + textWidth(item.name, 10.5);
    });
    legends.push(groupLegend(x, 14, svg));
  }

  const markerQueue = [];
  const singles = resolved.filter((l) => l.kind === 'point');
  const numbered = spec.numbered && singles.length > 0;
  const key = [];
  singles.forEach((layer, i) => {
    const m = layer.marker;
    const p = projection([m.lon, m.lat]);
    if (!p || path({ type: 'Point', coordinates: [m.lon, m.lat] }) === null) {
      ctx.warnings.push(`'${layer.name || layer.legend || 'a point'}' is outside the map and is not drawn`);
      return;
    }
    const color = m.color || '#c0392b';
    if (numbered) {
      const radius = 8.5;
      top.push(`<g>${marker('circle', p[0], p[1], radius, color, '#fff', 1.4)}<text x="${r2(p[0])}" y="${r2(p[1] + 3.6)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff">${i + 1}</text></g>`);
      placer.reserveCircle(p[0], p[1], radius);
      key.push({ n: i + 1, name: layer.name || m.label || `Site ${i + 1}`, color });
      return;
    }
    top.push(marker(m.shape, p[0], p[1], m.radius, color));
    placer.reserveCircle(p[0], p[1], m.radius + 1);
    if (m.label) markerQueue.push({ text: m.label, x: p[0], y: p[1], radius: m.radius, size: 11.5, weight: 600, side: m.labelSide, force: true });
    if (layer.legend) legends.push(legendCategories('', [{ name: layer.legend, color }], m.shape));
  });

  for (const layer of resolved.filter((l) => l.kind === 'points')) {
    const baseColor = layer.fixedColor || '#c0392b';
    const drawn = [];
    for (const m of layer.markers) {
      const p = projection([m.lon, m.lat]);
      if (!p || path({ type: 'Point', coordinates: [m.lon, m.lat] }) === null) continue;
      drawn.push({ m, p });
    }
    drawn.sort((a, b) => b.m.radius - a.m.radius);
    for (const { m, p } of drawn) {
      top.push(marker(layer.shape, p[0], p[1], m.radius, m.color || baseColor, layer.stroke, 1));
      placer.reserveCircle(p[0], p[1], m.radius + 1);
    }
    for (const { m, p } of drawn.slice().sort((a, b) => b.m.radius - a.m.radius)) {
      if (m.label) markerQueue.push({ text: m.label, x: p[0], y: p[1], radius: m.radius, size: 10.5, weight: 400, force: false });
    }
    if (layer.sizing) legends.push(legendSizes(layer));
    if (layer.colors?.kind === 'classes') legends.push(legendShade({ breaks: layer.colors.breaks }, layer.colors.palette, layer.colors.title, false));
    else if (layer.colors?.kind === 'categories') legends.push(legendCategories(layer.colors.title, layer.colors.entries, layer.shape));
    else if (layer.legend && !layer.sizing) legends.push(legendCategories('', [{ name: layer.legend, color: baseColor }], layer.shape));
  }

  if (key.length) {
    const columns = Math.ceil(key.length / 6);
    const rows = Math.ceil(key.length / columns);
    let svg = '';
    const widest = Math.max(...key.map((k) => textWidth(k.name, 10.5))) + 30;
    key.forEach((item, i) => {
      const column = Math.floor(i / rows);
      const row = i % rows;
      const x = column * (widest + 10);
      const y = row * 16;
      svg += marker('circle', x + 7, y + 7, 7, item.color, '#fff', 1) + `<text x="${x + 7}" y="${y + 10.5}" text-anchor="middle" font-size="9" font-weight="700" fill="#fff">${item.n}</text>` + mutedText(item.name, x + 20, y + 11);
    });
    legends.push(groupLegend(columns * (widest + 10), rows * 16, svg));
  }

  const furniture = [];
  const showNorth = spec.north ?? (!WORLDISH.has(projectionName) && !sphereMode && !(info && info.width > 70));
  if (showNorth) {
    furniture.push(northArrow(width - 20, 22, 26));
    placer.reserve(width - 36, 4, 32, 48);
  }
  const scaleAllowed = spec.scale ?? !(WORLDISH.has(projectionName) || sphereMode);
  let scale = null;
  if (scaleAllowed) {
    scale = scaleBar(projection, width, height, spec.units || 'km');
    if (scale && scale.perPixel * width > 9000 && spec.scale === undefined) scale = null;
    if (scale) {
      furniture.push(scale.svg);
      placer.reserve(...scale.reserved);
    }
  }
  const attribution = [...new Set([...credits, ...ctx.credits])].filter((c) => !c.startsWith('Place lookup') || tile);
  if (attribution.length) {
    const text = attribution.join(' · ');
    const w = textWidth(text, 8.5) + 8;
    furniture.push(`<rect x="${r2(width - w)}" y="${height - 13}" width="${r2(w)}" height="13" fill="#fff" fill-opacity="0.8"/>` + `<text x="${width - 4}" y="${height - 3.5}" text-anchor="end" font-size="8.5" fill="${MUTE}">${esc(text)}</text>`);
    placer.reserve(width - w, height - 13, w, 13);
  }
  if (spec.inset && vector && !sphereMode) {
    const iw = 98;
    const ih = 56;
    const insetProjection = geoNaturalEarth1().fitExtent([[4, 4], [iw - 4, ih - 4]], { type: 'Sphere' });
    const insetPath = geoPath(insetProjection);
    const { countries } = loadWorld('110m');
    const lands = countries.map((f) => `<path d="${insetPath(f)}" fill="#e2dfd5" stroke="#fff" stroke-width="0.3"/>`).join('');
    const mark = info ? `<path d="${insetPath(extent)}" fill="#c0392b" fill-opacity="0.35" stroke="#c0392b" stroke-width="1.1"/>` : '';
    const [ix, iy] = [8, 8];
    furniture.push(`<g transform="translate(${ix} ${iy})"><rect width="${iw}" height="${ih}" fill="${THEME.ocean}" stroke="${THEME.frame}" stroke-width="0.8"/>${lands}${mark}</g>`);
    placer.reserve(ix, iy, iw, ih);
  }

  const labels = [];
  for (const queued of markerQueue) {
    const sizes = queued.side
      ? null
      : placer.place(queued.text, queued.x, queued.y, queued.radius, queued.size, queued.force);
    if (queued.side) {
      const gap = queued.radius + 4;
      const spot = {
        right: [queued.x + gap, queued.y + 4, 'start'],
        left: [queued.x - gap, queued.y + 4, 'end'],
        top: [queued.x, queued.y - gap, 'middle'],
        bottom: [queued.x, queued.y + gap + 9, 'middle'],
      }[queued.side];
      labels.push(haloText(queued.text, spot[0], spot[1], { size: queued.size, anchor: spot[2], weight: queued.weight }));
    } else if (sizes) {
      labels.push(haloText(queued.text, sizes.at[0], sizes.at[1], { size: queued.size, anchor: sizes.anchor, weight: queued.weight }));
    }
  }
  for (const layer of resolved.filter((l) => l.kind === 'label')) {
    const p = projection([layer.spot.lon, layer.spot.lat]);
    if (!p) continue;
    const style = layer.style;
    const size = Number(style.size || 11);
    labels.push(haloText(layer.text, p[0], p[1], {
      size,
      anchor: 'middle',
      italic: style.italic !== 'no',
      fill: style.color || '#2a6a9a',
      angle: Number(style.angle || 0),
      spacing: Number(style.spacing || 0.06),
      halo: 3,
    }));
    placer.reserve(p[0] - textWidth(layer.text, size) / 2, p[1] - size, textWidth(layer.text, size), size * 1.3);
  }
  for (const layer of resolved) {
    for (const item of layer.pending || []) {
      if (placer.placeCentered(item.text, item.x, item.y, 11)) labels.push(haloText(item.text, item.x, item.y + 4, { size: 11, anchor: 'middle', weight: 600 }));
    }
  }
  if (spec.cities || spec.capitals) {
    const limit = Number(spec.cities || 0);
    const countrySet = new Set(entries.map((e) => e.a2));
    const pool = allCities()
      .filter((c) => (spec.capitals ? c.capital : true) && (countrySet.size ? countrySet.has(c.country) : true))
      .map((c) => ({ c, p: projection([c.lon, c.lat]) }))
      .filter(({ c, p }) => p && p[0] > 6 && p[0] < width - 6 && p[1] > 6 && p[1] < height - 6 && path({ type: 'Point', coordinates: [c.lon, c.lat] }) !== null);
    const ranked = pool.sort((a, b) => (b.c.capital - a.c.capital) || b.c.population - a.c.population);
    let shown = 0;
    const taken = [];
    for (const { c, p } of ranked) {
      if (!spec.capitals && shown >= limit) break;
      if (taken.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 26)) continue;
      const spot = placer.place(c.name, p[0], p[1], 2.4, 10, false);
      if (!spot) continue;
      top.push(`<circle cx="${r2(p[0])}" cy="${r2(p[1])}" r="${c.capital ? 3 : 2.3}" fill="${INK}" stroke="#fff" stroke-width="0.8"/>`);
      labels.push(haloText(c.name, spot.at[0], spot.at[1], { size: 10, anchor: spot.anchor, italic: !c.capital }));
      shown += 1;
      taken.push(p);
    }
  }
  if (ctx.names) {
    for (const item of ctx.names) {
      if (!placer.placeCentered(item.text, item.x, item.y, item.size)) continue;
      labels.push(haloText(item.text, item.x, item.y + item.size * 0.35, {
        size: item.size,
        anchor: 'middle',
        fill: item.focus ? INK : '#7d7b72',
        italic: !item.focus,
        spacing: item.focus ? 0.08 : 0.03,
        halo: 2.5,
      }));
    }
  }

  if (shadeInfo && vector) {
    legends.unshift(legendShade(shadeScale, shadeColors, shadeInfo.title, nodataSeen));
  }
  const groups = legends.filter(Boolean);
  const layout = spec.legend === 'none' ? { svg: '', height: 0 } : legendLayout(groups, width);

  const clip = sphereMode ? `<clipPath id="mapclip"><path d="${spherePath}"/></clipPath>` : `<clipPath id="mapclip"><rect width="${width}" height="${height}"/></clipPath>`;
  const arrows = [...defs.values()].map((d) => d.svg).join('');
  const frame = sphereMode ? `<path d="${spherePath}" fill="none" stroke="${THEME.frame}" stroke-width="1"/>` : `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="none" stroke="${THEME.frame}" stroke-width="1"/>`;
  const total = height + (layout.height ? layout.height + 8 : 0);
  const svg = `<svg viewBox="0 0 ${width} ${r2(total)}" width="${width}" height="${r2(total)}" role="img" style="width:100%;height:auto;display:block;font-size:12px;font-family:inherit"><title>${esc(spec.alt || 'Map')}</title><defs>${clip}${arrows}</defs><g${sphereMode ? '' : ' clip-path="url(#mapclip)"'}>${base.join('')}${over.join('')}${top.join('')}${labels.join('')}${furniture.join('')}</g>${frame}<g transform="translate(0 ${height + 8})">${layout.svg}</g></svg>`;
  return { svg, warnings: ctx.warnings };
}

function shorten(from, to, amount) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy) || 1;
  return [to[0] - (dx / length) * amount, to[1] - (dy / length) * amount];
}

