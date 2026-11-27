import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { geoMercator } from 'd3-geo';
import { download, tilePath } from './geodata.mjs';

const STYLES = {
  osm: {
    url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    credit: '© OpenStreetMap contributors',
    max: 19,
  },
  topo: {
    url: (z, x, y) => `https://tile.opentopomap.org/${z}/${x}/${y}.png`,
    credit: 'Map data © OpenStreetMap contributors, SRTM | Style © OpenTopoMap (CC-BY-SA)',
    max: 17,
  },
  light: {
    url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/${z}/${y}/${x}`,
    credit: 'Tiles © Esri, HERE, Garmin, © OpenStreetMap contributors',
    max: 16,
    cache: 'light-gray',
  },
};

const LIMIT = 64;
const SIZE = 256;

export const isTileStyle = (name) => name in STYLES;

export function tileStyles() {
  return Object.keys(STYLES);
}

const worldX = (lon) => ((lon + 180) / 360) * SIZE;
const worldY = (lat) => {
  const clamp = Math.max(-85.0511, Math.min(85.0511, lat));
  const sin = Math.sin((clamp * Math.PI) / 180);
  return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * SIZE;
};

export function fitZoom(box, width, height, pad) {
  const [west, south, east, north] = box;
  const dx = Math.max(worldX(east) - worldX(west), 1e-9);
  const dy = Math.max(worldY(south) - worldY(north), 1e-9);
  return Math.log2(Math.min((width - 2 * pad) / dx, (height - 2 * pad) / dy));
}

export function tileProjection(center, zoom, width, height) {
  return geoMercator()
    .scale((SIZE * 2 ** zoom) / (2 * Math.PI))
    .center([center.lon, center.lat])
    .translate([width / 2, height / 2])
    .precision(0.1);
}

async function fetchTile(style, z, x, y) {
  const file = tilePath(STYLES[style].cache || style, z, x, y);
  if (existsSync(file)) return readFileSync(file);
  const data = await download(STYLES[style].url(z, x, y), true);
  writeFileSync(file, data);
  return data;
}

async function pool(items, size, work) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function tileMosaic(style, projection, zoom, width, height, sharp) {
  const spec = STYLES[style];
  const rounded = Math.max(0, Math.min(spec.max, Math.round(zoom) + (sharp ? 1 : 0)));
  const scale = 2 ** (zoom - rounded);
  const size = SIZE * scale;
  const [left, top] = projection([-180, 85.0511]);
  const first = { x: Math.floor((0 - left) / size), y: Math.floor((0 - top) / size) };
  const last = { x: Math.floor((width - left) / size), y: Math.floor((height - top) / size) };
  const limit = 2 ** rounded;
  const wanted = [];
  for (let y = Math.max(first.y, 0); y <= Math.min(last.y, limit - 1); y += 1) {
    for (let x = first.x; x <= last.x; x += 1) wanted.push({ x, y, wrapped: ((x % limit) + limit) % limit });
  }
  if (wanted.length > LIMIT) {
    throw new Error(`this map needs ${wanted.length} tiles (the limit is ${LIMIT}); zoom in with a smaller 'span' or a higher 'zoom'`);
  }
  let images;
  try {
    images = await pool(wanted, 4, (tile) => fetchTile(style, rounded, tile.wrapped, tile.y));
  } catch (error) {
    throw new Error(`could not download map tiles (${error.message}); check the internet connection or use 'basemap: world'`);
  }
  const parts = wanted.map((tile, i) => {
    const x = left + tile.x * size;
    const y = top + tile.y * size;
    const data = images[i].toString('base64');
    return `<image x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(size + 0.6).toFixed(2)}" height="${(size + 0.6).toFixed(2)}" href="data:image/${images[i][0] === 0xff ? 'jpeg' : 'png'};base64,${data}"/>`;
  });
  return { svg: parts.join(''), credit: spec.credit, zoom: rounded, count: wanted.length };
}
