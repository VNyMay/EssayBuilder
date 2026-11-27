const TEXT_KINDS = new Set(['para', 'heading', 'list', 'quote', 'blank']);

const PLACE = { align: ['', 'left', 'center', 'right'], wrap: ['', 'left', 'right', 'no'] };
const SHARED = { caption: 't', id: 't', source: 't', width: 't', ...PLACE };
const DIAGRAM = { direction: ['', 'TD', 'LR', 'TB', 'BT', 'RL'], title: 't', ...SHARED };
const GRID = { cols: 'n', ...SHARED };
const CALLOUT = { label: 'Text', args: 'Title', keys: {}, body: 'Text' };
const MERMAID = ['sequence', 'er', 'class', 'state', 'gantt', 'journey', 'quadrant', 'sankey', 'radar', 'requirement', 'packet', 'gitgraph'];

const PROJECTIONS = [
  '', 'mercator', 'natural-earth', 'equal-earth', 'robinson', 'winkel-tripel', 'mollweide', 'orthographic', 'globe',
  'albers', 'albers-usa', 'conic', 'conic-conformal', 'azimuthal', 'stereographic', 'equirectangular',
  'plate-carree', 'transverse-mercator',
];

const BLOCKS = {
  figure: {
    label: 'Figure',
    keys: {
      src: 'f', caption: 't', id: 't', width: 't', height: 't', align: ['', 'left', 'center', 'right'], source: 't',
      alt: 't', border: 'y', wrap: ['', 'left', 'right', 'no'],
    },
  },
  figures: { label: 'Figures', keys: GRID, body: 'Images' },
  table: {
    label: 'Table',
    keys: {
      src: 'f', sheet: 't', cols: 't', rows: 't', sort: 't', decimals: 't', thousands: 'y', sci: 't', 'group-digits': 'n',
      align: 't', place: ['', 'left', 'center', 'right'], wrap: ['', 'left', 'right', 'no'], group: 't', total: 'y', size: ['', 'normal', 'small', 'tiny'], width: 't', caption: 't', id: 't',
      source: 't', note: 't', header: 'y', split: 'y', style: ['', 'classic', 'grid', 'striped', 'minimal'],
      transpose: 'y',
    },
    body: 'Data',
  },
  pipetable: { label: 'Table', keys: { caption: 't', id: 't' }, body: 'Table' },
  chart: {
    label: 'Chart',
    keys: {
      type: ['', 'line', 'scatter', 'bar', 'hbar', 'hist', 'pie', 'donut', 'function'], src: 'f', sheet: 't', x: 't',
      y: 't', xlabel: 't', ylabel: 't', xlog: 'y', ylog: 'y', legend: 't', grid: 'y', lines: 'y', markers: 'y',
      labels: 't', bins: 'n', xmin: 'n', xmax: 'n', ymin: 'n', ymax: 'n', hline: 't', vline: 't', f: 't',
      domain: 't', yerr: 't', xerr: 't', trendline: 'y', width: 't', ratio: 't', caption: 't', id: 't', source: 't', ...PLACE,
    },
    repeat: ['hline', 'vline', 'f'],
    body: 'Data',
  },
  diagram: { label: 'Diagram', keys: DIAGRAM, body: 'Mermaid' },
  flow: { label: 'Flow', keys: DIAGRAM, body: 'Steps' },
  mindmap: { label: 'Mind map', keys: DIAGRAM, body: 'Outline' },
  tree: { label: 'Tree', keys: DIAGRAM, body: 'Outline' },
  timeline: { label: 'Timeline', keys: DIAGRAM, body: 'Events' },
  grid: { label: 'Grid', keys: GRID, body: 'Boxes' },
  swot: { label: 'SWOT', keys: GRID, body: 'Boxes' },
  molecule: { label: 'Molecule', keys: { smiles: 't', color: 't', stereo: 't', ...SHARED } },
  music: { label: 'Music', keys: { src: 'f', ...SHARED }, body: 'ABC' },
  code: {
    label: 'Code',
    args: 'Language',
    keys: { src: 'f', name: 't', lines: 't', highlight: 't', numbers: 'y', caption: 't', id: 't', start: 'n' },
    body: 'Code',
    optional: true,
  },
  fence: { label: 'Code', args: 'Language', keys: { name: 't', caption: 't', id: 't', highlight: 't' }, body: 'Code' },
  run: { label: 'Terminal', args: 'Title', keys: { src: 'f', caption: 't', id: 't' }, body: 'Output', optional: true },
  math: { label: 'Equation', keys: { id: 't', tag: 't' }, body: 'Equation' },
  'eq-pair': { label: 'Equations', keys: {}, body: 'Equations' },
  text: {
    label: 'Text',
    keys: { size: 't', align: ['', 'left', 'center', 'right', 'justify'], style: 't', indent: 't', font: 't' },
    body: 'Text',
  },
  references: { label: 'References', keys: { sort: 'y' }, body: 'Entries' },
  box: { ...CALLOUT, label: 'Box' },
  question: { ...CALLOUT, label: 'Question' },
  note: { ...CALLOUT, label: 'Note' },
  proof: { ...CALLOUT, label: 'Proof' },
  definition: { ...CALLOUT, label: 'Definition' },
  theorem: { ...CALLOUT, label: 'Theorem' },
  lemma: { ...CALLOUT, label: 'Lemma' },
  proposition: { ...CALLOUT, label: 'Proposition' },
  corollary: { ...CALLOUT, label: 'Corollary' },
  example: { ...CALLOUT, label: 'Example' },
  remark: { ...CALLOUT, label: 'Remark' },
  spacer: { label: 'Spacer', args: 'Size', keys: {} },
  pagebreak: { label: 'Page break', keys: {} },
  map: {
    label: 'Map',
    keys: {
      focus: 't', basemap: ['', 'world', 'none', 'osm', 'topo', 'light'], projection: PROJECTIONS, level: ['', '0', '1', '2', 'states', 'counties'],
      names: ['', 'auto', 'countries', 'none'], cities: 'n', capitals: 'y', center: 't', span: 't', zoom: 'n', bbox: 't',
      rotate: 't', detail: ['', '110m', '50m', 'high'], mainland: 'y', ocean: 't', land: 't', borders: 'y',
      graticule: 't', scale: 'y', north: 'y', inset: 'y', units: ['', 'km', 'mi'], legend: 't', numbered: 'y', online: 'y',
      width: 't', ratio: 't', caption: 't', id: 't', source: 't', alt: 't', ...PLACE,
      shade: 'f', points: 'f', flows: 'f', point: 't', route: 't', line: 't', area: 't', circle: 't', geojson: 'f',
      highlight: 't', label: 't',
    },
    repeat: ['shade', 'points', 'flows', 'point', 'route', 'line', 'area', 'circle', 'geojson', 'highlight', 'label'],
    layers: true,
  },
};

MERMAID.forEach((name) => {
  BLOCKS[name] = { label: name.charAt(0).toUpperCase() + name.slice(1), keys: DIAGRAM, body: 'Mermaid' };
});
BLOCKS.image = BLOCKS.figure;

const OPTION_LINE = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/;
const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)]+)\)\s*(\{.*\})?\s*$/;
const ATTR_TOKEN = /#([\w:-]+)|\.([\w-]+)|([\w-]+)=("[^"]*"|'[^']*'|[^\s{}"']+)|([\w-]+)/g;
const FLAG_KEYS = new Set(['border', 'n', 'numbered', 'nonumber']);

function schemaOf(kind) {
  return BLOCKS[kind] || null;
}

function prettyKey(key) {
  const text = key.replace(/-/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function parseRows(lines) {
  const rows = [];
  lines.forEach((line) => {
    if (!line.trim()) return;
    const match = line.trim().match(OPTION_LINE);
    if (/^\s*(%%|\/\/)/.test(line)) rows.push({ raw: line });
    else if (/^\s/.test(line) && rows.length && rows[rows.length - 1].key) rows[rows.length - 1].value += ` ${line.trim()}`;
    else if (match) rows.push({ key: match[1].toLowerCase().replace(/_/g, '-'), value: match[2].trim() });
    else rows.push({ raw: line });
  });
  return rows;
}

function trimBody(lines) {
  const body = lines.slice();
  while (body.length && !body[body.length - 1].trim()) body.pop();
  while (body.length && !body[0].trim()) body.shift();
  return body;
}

function parseAttrs(text) {
  const rows = [];
  let id = '';
  if (!text) return { rows, id };
  const inner = text.trim().replace(/^\{/, '').replace(/\}$/, '');
  for (const token of inner.matchAll(ATTR_TOKEN)) {
    const [, ident, , key, value, word] = token;
    if (ident) id = ident;
    else if (key) rows.push({ key: key.toLowerCase().replace(/_/g, '-'), value: value.replace(/^["']|["']$/g, '') });
    else if (word) rows.push({ key: word.toLowerCase(), value: 'yes' });
  }
  return { rows, id };
}

function attrText(id, rows) {
  const tokens = [];
  if (id) tokens.push(`#${id}`);
  rows.forEach((row) => {
    if (!row.key || row.value === '') return;
    if (FLAG_KEYS.has(row.key) && row.value === 'yes') tokens.push(row.key);
    else tokens.push(/\s/.test(row.value) ? `${row.key}="${row.value}"` : `${row.key}=${row.value}`);
  });
  return tokens.length ? `{${tokens.join(' ')}}` : '';
}

function splitDirective(name, inner) {
  const dash = inner.findIndex((line) => line.trim() === '---');
  if (dash >= 0) return { head: inner.slice(0, dash), body: inner.slice(dash + 1), dashes: true };
  const schema = schemaOf(name);
  const known = new Set(Object.keys(schema ? schema.keys : {}));
  const first = inner.find((line) => line.trim());
  if (schema && schema.optional && !(first && /^(src|file|path)\s*:/i.test(first.trim()))) return { head: [], body: inner, dashes: false };
  let index = 0;
  let seen = false;
  while (index < inner.length) {
    const line = inner[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const match = line.match(OPTION_LINE);
    const indented = /^\s/.test(line);
    if (indented && seen) index += 1;
    else if (!indented && match && known.has(match[1].toLowerCase().replace(/_/g, '-'))) {
      seen = true;
      index += 1;
    } else break;
  }
  return { head: inner.slice(0, index), body: inner.slice(index), dashes: false };
}

function parseBlock(kind, lines) {
  if (kind === 'image') {
    const match = lines.join(' ').trim().match(IMAGE_LINE);
    if (!match) return { kind: 'raw', rows: [], body: lines.slice() };
    const attrs = parseAttrs(match[3]);
    const rows = [{ key: 'src', value: match[2].trim() }, { key: 'caption', value: match[1] }];
    if (attrs.id) rows.push({ key: 'id', value: attrs.id });
    return { kind, rows: rows.concat(attrs.rows), body: [] };
  }
  if (kind === 'math') {
    const match = lines.join('\n').trim().match(/^\$\$([\s\S]*?)\$\$\s*(\{[^{}]*\})?$/);
    if (!match) return { kind: 'raw', rows: [], body: lines.slice() };
    const attrs = parseAttrs(match[2]);
    const rows = [];
    if (attrs.id) rows.push({ key: 'id', value: attrs.id });
    attrs.rows.forEach((row) => rows.push(row));
    return { kind, rows, body: trimBody(match[1].split('\n').map((line) => line.trim())) };
  }
  if (kind === 'fence') {
    const info = lines[0].trim().replace(/^```/, '');
    const attrMatch = info.match(/\s*(\{[^{}]*\})\s*$/);
    const attrs = parseAttrs(attrMatch ? attrMatch[1] : '');
    const closed = lines.length > 1 && lines[lines.length - 1].trim().startsWith('```');
    const rows = attrs.id ? [{ key: 'id', value: attrs.id }] : [];
    return {
      kind,
      args: (attrMatch ? info.slice(0, attrMatch.index) : info).trim(),
      rows: rows.concat(attrs.rows),
      body: lines.slice(1, closed ? -1 : undefined),
    };
  }
  if (kind === 'pipetable') {
    let caption = '';
    let id = '';
    const rest = lines.slice();
    if (rest.length && /^Table:/i.test(rest[0].trim())) {
      const text = rest.shift().trim().replace(/^Table:\s*/i, '');
      const attrMatch = text.match(/\s*(\{[^{}]*\})\s*$/);
      const attrs = parseAttrs(attrMatch ? attrMatch[1] : '');
      caption = attrMatch ? text.slice(0, attrMatch.index) : text;
      id = attrs.id;
    }
    const rows = [{ key: 'caption', value: caption }];
    if (id) rows.push({ key: 'id', value: id });
    return { kind, rows, body: trimBody(rest) };
  }
  const head = (lines[0] || '').trim().match(/^:::\s*([A-Za-z][\w-]*)\s*(.*?)\s*$/);
  if (!head) return { kind: 'raw', rows: [], body: lines.slice() };
  let inner = lines.slice(1);
  let closed = false;
  if (inner.length && inner[inner.length - 1].trim() === ':::') {
    inner = inner.slice(0, -1);
    closed = true;
  }
  const split = splitDirective(head[1].toLowerCase(), inner);
  return {
    kind,
    name: head[1].toLowerCase(),
    args: head[2],
    rows: parseRows(split.head),
    body: trimBody(split.body),
    closed,
  };
}

function serializeBlock(model) {
  const rows = model.rows.filter((row) => row.raw !== undefined || row.value !== '');
  const body = trimBody(model.body);
  if (model.kind === 'raw') return model.body;
  if (model.kind === 'image') {
    const get = (key) => (model.rows.find((row) => row.key === key) || { value: '' }).value;
    const rest = rows.filter((row) => !['src', 'caption', 'id'].includes(row.key));
    return [`![${get('caption')}](${get('src')})${attrText(get('id'), rest)}`];
  }
  if (model.kind === 'math') {
    const id = (rows.find((row) => row.key === 'id') || { value: '' }).value;
    const rest = rows.filter((row) => row.key !== 'id');
    const attrs = attrText(id, rest);
    if (body.length <= 1) return [`$$ ${body[0] || ''} $$${attrs ? ` ${attrs}` : ''}`];
    return ['$$', ...body, `$$${attrs ? ` ${attrs}` : ''}`];
  }
  if (model.kind === 'fence') {
    const id = (rows.find((row) => row.key === 'id') || { value: '' }).value;
    const attrs = attrText(id, rows.filter((row) => row.key !== 'id'));
    return [`\`\`\`${model.args || ''}${attrs ? ` ${attrs}` : ''}`, ...body, '```'];
  }
  if (model.kind === 'pipetable') {
    const get = (key) => (rows.find((row) => row.key === key) || { value: '' }).value;
    const out = [];
    if (get('caption')) out.push(`Table: ${get('caption')}${get('id') ? ` {#${get('id')}}` : ''}`, '');
    return out.concat(body);
  }
  const out = [`:::${model.name}${model.args ? ` ${model.args}` : ''}`];
  rows.forEach((row) => out.push(row.raw !== undefined ? row.raw : `${row.key}: ${row.value}`));
  if (body.length) {
    const lead = body[0].match(OPTION_LINE);
    const schema = schemaOf(model.name);
    const mistaken = lead && !/^\s/.test(body[0]) && schema && !schema.optional && lead[1].toLowerCase().replace(/_/g, '-') in schema.keys;
    if (rows.some((row) => row.raw === undefined) || mistaken) out.push('---');
    out.push(...body);
  }
  if (body.length || rows.length || model.closed) out.push(':::');
  return out;
}

const TEMPLATES = [
  { group: 'Text', id: 'heading', label: 'Section heading', icon: 'heading', kind: 'heading', lines: ['# New section'] },
  { group: 'Text', id: 'subheading', label: 'Sub-heading', icon: 'heading', kind: 'heading', lines: ['## New sub-heading'] },
  { group: 'Text', id: 'subsubheading', label: 'Sub-sub-heading', icon: 'heading', kind: 'heading', lines: ['### New minor heading'] },
  { group: 'Text', id: 'paragraph', label: 'Text', icon: 'paragraph', kind: 'para', lines: ['New paragraph.'] },
  { group: 'Text', id: 'list', label: 'List', icon: 'list', kind: 'list', lines: ['- First', '- Second', '- Third'] },
  { group: 'Media', id: 'image', label: 'Image', icon: 'image', kind: 'figure', upload: true },
  {
    group: 'Data', id: 'table', label: 'Table', icon: 'table', kind: 'table',
    lines: [':::table', 'caption: Table caption.', '---', '| Item | Value |', '|---|---|', '| A | 1 |', '| B | 2 |', ':::'],
  },
  {
    group: 'Data', id: 'chart', label: 'Chart', icon: 'chart', kind: 'chart',
    lines: [':::chart', 'type: line', 'x: x', 'caption: Chart caption.', '---', '| x | y |', '|---|---|', '| 1 | 2 |', '| 2 | 4 |', '| 3 | 3 |', ':::'],
  },
  { group: 'Data', id: 'map', label: 'Map', icon: 'map', kind: 'map', lines: [':::map', 'focus: Egypt', 'point: Cairo | Cairo', 'caption: Map caption.', ':::'] },
  { group: 'Science', id: 'equation', label: 'Equation', icon: 'equation', kind: 'math', lines: ['$$ E = mc^2 $$'] },
  { group: 'Science', id: 'chemistry', label: 'Chemical equation', icon: 'flask', kind: 'para', lines: ['Water forms as $\\ce{2H2 + O2 -> 2H2O}$.'] },
  { group: 'Science', id: 'molecule', label: 'Molecule', icon: 'molecule', kind: 'molecule', lines: [':::molecule', 'smiles: CC(=O)Oc1ccccc1C(=O)O', 'caption: Molecule caption.', ':::'] },
  {
    group: 'Science', id: 'music', label: 'Music', icon: 'music', kind: 'music',
    lines: [':::music', 'caption: Music caption.', '---', 'X:1', 'M:4/4', 'L:1/4', 'K:C', 'CDEF|GABc|', ':::'],
  },
  { group: 'Data', id: 'code', label: 'Code', icon: 'code', kind: 'code', lines: [':::code python', 'print("hello")', ':::'] },
  { group: 'Diagrams', id: 'flow', label: 'Diagram', icon: 'diagram', kind: 'flow', lines: [':::flow', 'caption: Diagram caption.', '---', 'Start -> Step -> End', ':::'] },
  {
    group: 'Diagrams', id: 'timeline', label: 'Timeline', icon: 'timeline', kind: 'timeline',
    lines: [':::timeline', 'caption: Timeline caption.', '---', '2000: First event', '2010: Second event', ':::'],
  },
  { group: 'Text', id: 'quote', label: 'Quote', icon: 'quote', kind: 'quote', lines: ['> Quotation text.'] },
  { group: 'Text', id: 'definition', label: 'Definition', icon: 'definition', kind: 'definition', lines: [':::definition Term', 'Meaning of the term.', ':::'] },
  { group: 'Text', id: 'box', label: 'Box', icon: 'box', kind: 'box', lines: [':::box', 'Key statement.', ':::'] },
  { group: 'Diagrams', id: 'mindmap', label: 'Mind map', icon: 'mindmap', kind: 'mindmap', lines: [':::mindmap', 'caption: Mind map caption.', '---', 'Centre', '  Idea', '  Idea', ':::'] },
  {
    group: 'Diagrams', id: 'swot', label: 'SWOT', icon: 'swot', kind: 'swot',
    lines: [':::swot', 'caption: SWOT caption.', '---', 'Strengths:', '- First', 'Weaknesses:', '- First', 'Opportunities:', '- First', 'Threats:', '- First', ':::'],
  },
  { group: 'Layout', id: 'spacer', label: 'Space', icon: 'spacer', kind: 'spacer', lines: [':::spacer 12mm'] },
  { group: 'Layout', id: 'pagebreak', label: 'Page break', icon: 'pagebreak', kind: 'pagebreak', lines: [':::pagebreak'] },
  { group: 'Layout', id: 'blank', label: 'Blank page', icon: 'newFile', kind: 'blank', lines: [':::blank'] },
  { group: 'Layout', id: 'design', label: 'Design page', icon: 'frame', kind: 'design', lines: [':::design', 'box: text | x=10 y=40 w=80 size=30 align=center bold | Your title', 'box: line | x=35 y=52 w=30 bw=2 | ', ':::'] },
];

const ICONS = {
  cloud: 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9M12 3c-2.5 2.7-3.8 5.7-3.8 9s1.3 6.3 3.8 9',
  laptop: 'M5 5h14a1 1 0 0 1 1 1v10H4V6a1 1 0 0 1 1-1ZM2 19h20',
  footnote: 'M4 8h10M4 12h10M4 16h6M18 4v5M16.5 5.5 18 4M4 20h16',
  heading: 'M6 4v16M18 4v16M6 12h12',
  paragraph: 'M4 6h16M4 10h16M4 14h16M4 18h10',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4',
  table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14M15 5v14',
  chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  equation: 'M6 7h12M6 17h12M8 12h8',
  flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3',
  molecule: 'M12 3l7 4v10l-7 4-7-4V7zM12 12l7-5M12 12v9M12 12L5 7',
  music: 'M9 18V6l10-2v12M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM19 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z',
  code: 'M8 8l-5 4 5 4M16 8l5 4-5 4M14 5l-4 14',
  diagram: 'M4 4h6v5H4zM14 4h6v5h-6zM9 15h6v5H9zM7 9v3h10V9M12 12v3',
  timeline: 'M4 12h16M7 8v8M12 8v8M17 8v8',
  quote: 'M5 8h5v5H7l-2 3zM14 8h5v5h-3l-2 3z',
  definition: 'M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM9 8h6M9 12h6',
  box: 'M4 6h16v12H4z',
  pagebreak: 'M4 12h4M10 12h4M16 12h4M7 4v5M7 15v5',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  copy: 'M9 9h10v10H9zM5 5h10v2M5 5v10h2',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6',
  close: 'M6 6l12 12M18 6L6 18',
  palette: 'M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.9s-.6-1.5-.6-2.4.7-1.7 2.1-1.7H18a3 3 0 0 0 3-3 9 9 0 0 0-9-9zM7.5 11h.01M10 7.5h.01M14 7.5h.01',
  chevron: 'M6 9l6 6 6-6',
  check: 'M5 12l5 5L20 7',
  page: 'M7 3h8l4 4v14H7zM15 3v4h4',
  highlight: 'M4 20h16M7 16l8-8 3 3-8 8H7zM15 8l2-2 3 3-2 2',
  alignLeft: 'M4 6h16M4 10h10M4 14h16M4 18h10',
  alignCenter: 'M4 6h16M7 10h10M4 14h16M7 18h10',
  alignRight: 'M4 6h16M10 10h10M4 14h16M10 18h10',
  alignJustify: 'M4 6h16M4 10h16M4 14h16M4 18h16',
  grip: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  warn: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  export: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  folder: 'M3 6h6l2 2h10v11H3z',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  upload: 'M12 16V5M7 10l5-5 5 5M5 20h14',
  cover: 'M6 3h12v18H6zM9 8h6M9 12h6M9 17h3',
  alignLeft: 'M4 6h16M4 10h9M4 14h16M4 18h9',
  alignCenter: 'M4 6h16M7.5 10h9M4 14h16M7.5 18h9',
  alignRight: 'M4 6h16M11 10h9M4 14h16M11 18h9',
  wrapOff: 'M4 5h16M4 19h16M7 9h10v6H7z',
  wrapLeft: 'M4 5h7v6H4zM14 6h6M14 10h6M4 15h16M4 19h16',
  wrapRight: 'M13 5h7v6h-7zM4 6h6M4 10h6M4 15h16M4 19h16',
  pin: 'M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11zM12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  route: 'M5 19c0-6 14-2 14-10M5 19h.01M19 9h.01',
  area: 'M5 7l9-3 5 8-6 7-8-3z',
  circleIcon: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
  textIcon: 'M5 6h14M12 6v13M9 19h6',
  flows: 'M5 17c4-9 9-9 14-9M15 5l4 3-4 3',
  shade: 'M4 5h16v14H4zM4 9h16M4 14h16',
  shapes: 'M4 6l7-2 9 4-3 11-9 1z',
  highlight: 'M5 5h14v14H5z',
  shapeCircle: 'M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z',
  shapeSquare: 'M6 6h12v12H6z',
  shapeTriangle: 'M12 5l7 13H5z',
  shapeDiamond: 'M12 4l8 8-8 8-8-8z',
  shapeStar: 'M12 4l2.4 5 5.6.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.6-.8z',
  shapeCross: 'M6 12h12M12 6v12',
  mindmap: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 9V4M12 15v5M9 12H4M15 12h5',
  swot: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  spacer: 'M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4',
};

function icon(name, size = 18) {
  const rich = typeof ICON_SET !== 'undefined' && ICON_SET[name];
  const weight = size <= 16 ? 2 : size >= 22 ? 1.6 : 1.8;
  const inner = rich || `<path d="${ICONS[name] || ''}"/>`;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round" shape-rendering="geometricPrecision">${inner}</svg>`;
}
