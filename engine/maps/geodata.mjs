import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature, mesh } from 'topojson-client';
import { countryByName } from './places.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = process.env.ESSAY_BUILDER_CACHE || path.join(HERE, '..', 'cache');
const AGENT = 'EssayBuilder/2.0 (student essay tool; occasional lookups)';
const OFFLINE = Boolean(process.env.ESSAY_BUILDER_OFFLINE);

const worlds = new Map();

function readJson(file) {
  return JSON.parse(readFileSync(require.resolve(file), 'utf8'));
}

export function loadWorld(detail) {
  if (worlds.has(detail)) return worlds.get(detail);
  const topology = readJson(`world-atlas/countries-${detail}.json`);
  const collection = feature(topology, topology.objects.countries);
  const countries = collection.features.map((item) => {
    const entry = countryByName(item.properties.name);
    return Object.assign(item, { entry, name: entry ? entry.label : item.properties.name });
  });
  const borders = mesh(topology, topology.objects.countries, (a, b) => a !== b);
  const coast = mesh(topology, topology.objects.countries, (a, b) => a === b);
  const world = { countries, borders, coast };
  worlds.set(detail, world);
  return world;
}

export function loadUnitedStates(level) {
  const topology = readJson('us-atlas/states-10m.json');
  const states = feature(topology, topology.objects.states).features;
  const entry = { states };
  if (level === 'counties') {
    const counties = readJson('us-atlas/counties-10m.json');
    entry.counties = feature(counties, counties.objects.counties).features;
  }
  return entry;
}

function cachePath(...parts) {
  const file = path.join(CACHE, ...parts);
  mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

export function cachedJson(name, make) {
  const file = cachePath(name);
  if (existsSync(file)) return Promise.resolve(JSON.parse(readFileSync(file, 'utf8')));
  return make().then((value) => {
    writeFileSync(file, JSON.stringify(value));
    return value;
  });
}

export async function download(url, binary = false) {
  if (OFFLINE) throw new Error('offline mode is on (ESSAY_BUILDER_OFFLINE)');
  const response = await fetch(url, {
    headers: { 'User-Agent': AGENT },
    signal: AbortSignal.timeout(30000),
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
}

export async function loadSubdivisions(a3, level) {
  const name = `boundaries/${a3}-ADM${level}.json`;
  return cachedJson(name, async () => {
    const meta = await download(`https://www.geoboundaries.org/api/current/gbOpen/${a3}/ADM${level}/`);
    const data = await download(meta.simplifiedGeometryGeoJSON);
    return {
      features: data.features.map((item) => ({
        type: 'Feature',
        properties: { name: item.properties.shapeName, id: item.properties.shapeID },
        geometry: item.geometry,
      })),
      license: meta.boundaryLicense,
    };
  });
}

let lastLookup = 0;

export async function lookupOnline(query) {
  const key = query.trim().toLowerCase();
  const store = cachePath('geocode.json');
  const known = existsSync(store) ? JSON.parse(readFileSync(store, 'utf8')) : {};
  if (key in known) return known[key];
  const wait = lastLookup + 1100 - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastLookup = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const found = await download(url);
  const hit = found[0]
    ? { lat: Number(found[0].lat), lon: Number(found[0].lon), name: found[0].display_name }
    : null;
  known[key] = hit;
  writeFileSync(store, JSON.stringify(known));
  return hit;
}

export function tilePath(style, z, x, y) {
  return cachePath('tiles', style, String(z), String(x), `${y}.png`);
}
