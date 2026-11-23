import { readFileSync } from 'node:fs';
import { geoArea, geoCentroid, geoDistance } from 'd3-geo';

const DATA = new URL('../data/', import.meta.url);
const COUNTRIES = JSON.parse(readFileSync(new URL('countries.json', DATA), 'utf8'));
const CITY_ROWS = JSON.parse(readFileSync(new URL('cities.json', DATA), 'utf8'));

const EXTRA = {
  usa: 'USA', us: 'USA', 'u s a': 'USA', 'united states': 'USA', america: 'USA',
  uk: 'GBR', 'great britain': 'GBR', britain: 'GBR', england: 'GBR', scotland: 'GBR', wales: 'GBR',
  uae: 'ARE', 'russian federation': 'RUS', 'egypt arab rep': 'EGY', 'korea rep': 'KOR',
  'republic of korea': 'KOR', 'korea republic': 'KOR', 'korea dem peoples rep': 'PRK',
  'korea dem rep': 'PRK', 'dprk': 'PRK', 'iran islamic rep': 'IRN', 'venezuela rb': 'VEN',
  'yemen rep': 'YEM', turkiye: 'TUR', 'czech republic': 'CZE', 'viet nam': 'VNM',
  'lao pdr': 'LAO', 'syrian arab republic': 'SYR', 'slovak republic': 'SVK',
  'kyrgyz republic': 'KGZ', 'gambia the': 'GMB', 'bahamas the': 'BHS',
  'congo dem rep': 'COD', 'democratic republic of the congo': 'COD', drc: 'COD',
  'dr congo': 'COD', 'congo rep': 'COG', 'republic of the congo': 'COG',
  'cote d ivoire': 'CIV', 'ivory coast': 'CIV', 'cabo verde': 'CPV', 'cape verde': 'CPV',
  'brunei darussalam': 'BRN', 'micronesia fed sts': 'FSM', swaziland: 'SWZ', eswatini: 'SWZ',
  macedonia: 'MKD', 'north macedonia': 'MKD', burma: 'MMR', 'east timor': 'TLS',
  'timor leste': 'TLS', palestine: 'PSE', 'west bank and gaza': 'PSE',
  'palestinian territories': 'PSE', 'hong kong sar china': 'HKG', 'macao sar china': 'MAC',
  'taiwan province of china': 'TWN', 'bolivia plurinational state of': 'BOL',
  'tanzania united republic of': 'TZA', 'moldova republic of': 'MDA', 'holland': 'NLD',
  'the netherlands': 'NLD', 'the gambia': 'GMB', 'the bahamas': 'BHS', 'western sahara': 'ESH',
  'south sudan': 'SSD', 'bosnia': 'BIH', 'bosnia and herzegovina': 'BIH',
  'central african republic': 'CAF', 'dominican republic': 'DOM', 'equatorial guinea': 'GNQ',
  'solomon islands': 'SLB', 'falkland islands': 'FLK', 'saint lucia': 'LCA',
  'st lucia': 'LCA', 'trinidad and tobago': 'TTO', 'sao tome and principe': 'STP',
  'antigua and barbuda': 'ATG', 'saint kitts and nevis': 'KNA', 'st kitts and nevis': 'KNA',
  'saint vincent and the grenadines': 'VCT', 'marshall islands': 'MHL',
};

const SHORT = {
  'Dem. Rep. Congo': 'DR Congo', 'Bosnia and Herz.': 'Bosnia & Herz.', 'Central African Rep.': 'Central African Rep.',
  'Dominican Rep.': 'Dominican Rep.', 'Eq. Guinea': 'Eq. Guinea', 'S. Sudan': 'South Sudan', 'W. Sahara': 'W. Sahara',
  'United States of America': 'United States', 'eSwatini': 'Eswatini', 'Czechia': 'Czechia',
};

export const normalize = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|of)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const byKey = new Map();
const byA3 = new Map();
const byName = new Map();

for (const entry of COUNTRIES) {
  entry.label = SHORT[entry.name] || entry.name;
  byName.set(entry.name, entry);
  if (entry.a3 && !byA3.has(entry.a3)) byA3.set(entry.a3, entry);
  const keys = [entry.name, entry.label, entry.a2, entry.a3, ...entry.aliases];
  for (const key of keys) {
    const norm = normalize(key);
    if (norm && !byKey.has(norm)) byKey.set(norm, entry);
  }
}
for (const [alias, a3] of Object.entries(EXTRA)) {
  const entry = byA3.get(a3);
  if (entry) byKey.set(normalize(alias), entry);
}

const REGIONS = {
  africa: ['DZA', 'AGO', 'BEN', 'BWA', 'BFA', 'BDI', 'CMR', 'CPV', 'CAF', 'TCD', 'COM', 'COG', 'COD', 'CIV', 'DJI', 'EGY', 'GNQ', 'ERI', 'SWZ', 'ETH', 'GAB', 'GMB', 'GHA', 'GIN', 'GNB', 'KEN', 'LSO', 'LBR', 'LBY', 'MDG', 'MWI', 'MLI', 'MRT', 'MUS', 'MAR', 'MOZ', 'NAM', 'NER', 'NGA', 'RWA', 'STP', 'SEN', 'SYC', 'SLE', 'SOM', 'ZAF', 'SSD', 'SDN', 'TZA', 'TGO', 'TUN', 'UGA', 'ESH', 'ZMB', 'ZWE'],
  europe: ['ALB', 'AND', 'AUT', 'BLR', 'BEL', 'BIH', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST', 'FIN', 'FRA', 'DEU', 'GRC', 'HUN', 'ISL', 'IRL', 'ITA', 'LVA', 'LIE', 'LTU', 'LUX', 'MLT', 'MDA', 'MCO', 'MNE', 'NLD', 'MKD', 'NOR', 'POL', 'PRT', 'ROU', 'SMR', 'SRB', 'SVK', 'SVN', 'ESP', 'SWE', 'CHE', 'UKR', 'GBR', 'VAT'],
  asia: ['AFG', 'ARM', 'AZE', 'BHR', 'BGD', 'BTN', 'BRN', 'KHM', 'CHN', 'GEO', 'IND', 'IDN', 'IRN', 'IRQ', 'ISR', 'JPN', 'JOR', 'KAZ', 'KWT', 'KGZ', 'LAO', 'LBN', 'MYS', 'MDV', 'MNG', 'MMR', 'NPL', 'PRK', 'OMN', 'PAK', 'PSE', 'PHL', 'QAT', 'SAU', 'SGP', 'KOR', 'LKA', 'SYR', 'TWN', 'TJK', 'THA', 'TLS', 'TUR', 'TKM', 'ARE', 'UZB', 'VNM', 'YEM', 'RUS'],
  'middle east': ['BHR', 'EGY', 'IRN', 'IRQ', 'ISR', 'JOR', 'KWT', 'LBN', 'OMN', 'PSE', 'QAT', 'SAU', 'SYR', 'TUR', 'ARE', 'YEM'],
  'north america': ['CAN', 'USA', 'MEX', 'GTM', 'BLZ', 'SLV', 'HND', 'NIC', 'CRI', 'PAN', 'CUB', 'JAM', 'HTI', 'DOM', 'BHS', 'TTO', 'BRB'],
  'south america': ['ARG', 'BOL', 'BRA', 'CHL', 'COL', 'ECU', 'GUY', 'PRY', 'PER', 'SUR', 'URY', 'VEN'],
  oceania: ['AUS', 'FJI', 'KIR', 'MHL', 'FSM', 'NRU', 'NZL', 'PLW', 'PNG', 'WSM', 'SLB', 'TON', 'TUV', 'VUT'],
  'north africa': ['DZA', 'EGY', 'LBY', 'MAR', 'TUN', 'SDN', 'ESH', 'MRT'],
  'east africa': ['BDI', 'DJI', 'ERI', 'ETH', 'KEN', 'RWA', 'SOM', 'SSD', 'SDN', 'TZA', 'UGA'],
  'west africa': ['BEN', 'BFA', 'CPV', 'CIV', 'GMB', 'GHA', 'GIN', 'GNB', 'LBR', 'MLI', 'MRT', 'NER', 'NGA', 'SEN', 'SLE', 'TGO'],
  'southeast asia': ['BRN', 'KHM', 'IDN', 'LAO', 'MYS', 'MMR', 'PHL', 'SGP', 'THA', 'TLS', 'VNM'],
  'south asia': ['AFG', 'BGD', 'BTN', 'IND', 'MDV', 'NPL', 'PAK', 'LKA'],
  scandinavia: ['DNK', 'NOR', 'SWE', 'FIN', 'ISL'],
};

export const countryByName = (name) => byName.get(name);
export const countryList = () => COUNTRIES;

export function findCountry(text) {
  return byKey.get(normalize(text));
}

export function findRegion(text) {
  const list = REGIONS[normalize(text)];
  return list ? list.map((a3) => byA3.get(a3)).filter(Boolean) : null;
}

export function regionNames() {
  return Object.keys(REGIONS);
}

export function suggestCountry(text, limit = 3) {
  const target = normalize(text);
  const scored = [];
  for (const key of byKey.keys()) {
    if (key.length < 3) continue;
    const score = similarity(target, key);
    if (score > 0.55) scored.push([score, byKey.get(key).label]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return [...new Set(scored.map((item) => item[1]))].slice(0, limit);
}

export function similarity(a, b) {
  if (a === b) return 1;
  if (b.startsWith(a) || a.startsWith(b)) return 0.85;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const grid = Array.from({ length: rows }, (_, i) => [i, ...Array(cols - 1).fill(0)]);
  for (let j = 0; j < cols; j += 1) grid[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      grid[i][j] = Math.min(
        grid[i - 1][j] + 1,
        grid[i][j - 1] + 1,
        grid[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return 1 - grid[rows - 1][cols - 1] / Math.max(a.length, b.length);
}

const CITIES = CITY_ROWS.map(([name, alt, country, lat, lon, population, capital]) => ({
  name,
  alt,
  country,
  lat,
  lon,
  population,
  capital: Boolean(capital),
  key: normalize(name),
  altKey: alt ? normalize(alt) : '',
}));

const cityIndex = new Map();
for (const city of CITIES) {
  for (const key of [city.key, city.altKey]) {
    if (!key) continue;
    if (!cityIndex.has(key)) cityIndex.set(key, []);
    cityIndex.get(key).push(city);
  }
}

export function citiesIn(test, limit) {
  return CITIES.filter(test).slice(0, limit);
}

export function allCities() {
  return CITIES;
}

export function parseCoordinates(text) {
  const clean = String(text).trim();
  const dms = [...clean.matchAll(/(\d+(?:\.\d+)?)\s*[°d]\s*(?:(\d+(?:\.\d+)?)\s*['′m]\s*)?(?:(\d+(?:\.\d+)?)\s*["″s]\s*)?([NSEWnsew])/g)];
  if (dms.length === 2) {
    const values = dms.map((m) => {
      const value = Number(m[1]) + Number(m[2] || 0) / 60 + Number(m[3] || 0) / 3600;
      return { hemi: m[4].toUpperCase(), value: /[SW]/i.test(m[4]) ? -value : value };
    });
    const lat = values.find((v) => 'NS'.includes(v.hemi));
    const lon = values.find((v) => 'EW'.includes(v.hemi));
    if (lat && lon) return { lat: lat.value, lon: lon.value };
  }
  const suffixed = clean.match(/^(-?\d+(?:\.\d+)?)\s*°?\s*([NS])[\s,;]+(-?\d+(?:\.\d+)?)\s*°?\s*([EW])$/i);
  if (suffixed) {
    const lat = Number(suffixed[1]) * (/s/i.test(suffixed[2]) ? -1 : 1);
    const lon = Number(suffixed[3]) * (/w/i.test(suffixed[4]) ? -1 : 1);
    return { lat, lon };
  }
  const plain = clean.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (plain) {
    const lat = Number(plain[1]);
    const lon = Number(plain[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
  }
  return null;
}

const bestCity = (list) => list.slice().sort((a, b) => b.population - a.population)[0];

export function findCity(text) {
  const parts = String(text).split(',').map((part) => part.trim()).filter(Boolean);
  const name = normalize(parts[0]);
  const hits = cityIndex.get(name);
  if (!hits) return null;
  if (parts.length > 1) {
    const country = findCountry(parts[parts.length - 1]);
    if (country) {
      const scoped = hits.filter((city) => city.country === country.a2);
      if (scoped.length) return bestCity(scoped);
    }
  }
  const exact = hits.filter((city) => city.key === name);
  return bestCity(exact.length ? exact : hits);
}

export function suggestCity(text, limit = 3) {
  const target = normalize(String(text).split(',')[0]);
  const scored = [];
  for (const key of cityIndex.keys()) {
    if (Math.abs(key.length - target.length) > 3) continue;
    const score = similarity(target, key);
    if (score > 0.72) scored.push([score, bestCity(cityIndex.get(key)).name]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  return [...new Set(scored.map((item) => item[1]))].slice(0, limit);
}

export function mainland(feature) {
  const geometry = feature.geometry;
  if (!geometry || geometry.type !== 'MultiPolygon') return feature;
  const parts = geometry.coordinates.map((coordinates) => {
    const polygon = { type: 'Polygon', coordinates };
    return { coordinates, centroid: geoCentroid(polygon), area: geoArea(polygon) };
  });
  const main = parts.reduce((a, b) => (b.area > a.area ? b : a));
  const keep = parts.filter(
    (part) => part === main
      || geoDistance(part.centroid, main.centroid) * 6371 <= 1500
      || part.area >= main.area * 0.08,
  );
  if (keep.length === parts.length) return feature;
  return { ...feature, geometry: { type: 'MultiPolygon', coordinates: keep.map((part) => part.coordinates) } };
}

export function centroidOf(feature) {
  const [lon, lat] = geoCentroid(mainland(feature));
  return { lat, lon };
}
