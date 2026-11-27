const fs = require('fs');
const path = require('path');
const vm = require('vm');

const STUDIO = path.resolve(__dirname, '..');
const context = vm.createContext({ console, PANELS: {}, ICON_SET: undefined });
const files = ['blocks.js', 'kits.js', ...fs.readdirSync(STUDIO).filter((name) => /^kit-.*\.js$/.test(name)).sort(), 'rowkinds.js'];
files.forEach((name) => vm.runInContext(fs.readFileSync(path.join(STUDIO, name), 'utf8'), context, { filename: name }));
vm.runInContext('function rowGet(model, key, fallback = "") { const row = model.rows.find((item) => item.key === key); return row ? row.value : fallback; }', context);

const run = (code) => vm.runInContext(code, context);
const templates = run('TEMPLATES').filter((item) => item.lines);
const extra = [
  { kind: 'tree', lines: [':::tree', 'caption: Tree.', '---', 'CEO', '  Finance', '    Accounts', '  Operations', ':::'] },
  { kind: 'grid', lines: [':::grid', 'cols: 3', 'caption: Grid.', '---', 'One:', '- a', 'Two:', 'plain line', 'Three:', '* c', ':::'] },
  { kind: 'flow', lines: [':::flow', 'caption: Branches.', '---', 'Start -> Pick r -> Converged?', 'Converged? -yes-> Record value -> End', 'Converged? -no-> Pick r', 'Lonely', ':::'] },
  { kind: 'timeline', lines: [':::timeline', 'caption: Sections.', '---', '# Early', '1976: May publishes | Noticed', '# Late', '1978: Feigenbaum', ':::'] },
  { kind: 'glossary', lines: [':::glossary', 'Inflation: a general rise', '  in prices.', 'Barter: trade without money.', ':::'] },
  { kind: 'steps', lines: [':::steps', 'Mix', 'Bake', ':::'] },
  { kind: 'glossary', lines: [':::glossary', '---', 'Source: where a fact comes from.', 'Width: how wide it is.', ':::'] },
  { kind: 'pestle', lines: [':::pestle', 'caption: Indented.', '---', 'Political:', '  - New tax law', '  - Election year', 'Economic: Rising rates', ':::'] },
  { kind: 'stakeholder', lines: [':::stakeholder', 'caption: Short.', '---', 'Owners: 9, 8', ':::'] },
  { kind: 'figures', lines: [':::figures', 'cols: 2', 'caption: Two views.', '---', 'images/a.png | First view', 'images/a.png', ':::'] },
  { kind: 'mindmap', lines: [':::mindmap', 'caption: Tabs.', '---', 'Centre', '    - Idea', '        Detail', '    %% hidden', '    Idea two', ':::'] },
];

const normal = (lines) => lines.map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
const semantic = {
  glossary: (lines) => normal(lines).join(' '),
  pestle: (lines) => normal(lines).join('|').replace(/:\|-\s*/g, ': ').replace(/\|-\s*/g, '; '),
  stakeholder: (lines) => normal(lines).join('|').replace(/power |interest /g, ''),
};

const report = [];
[...templates, ...extra].forEach((template) => {
  const kind = template.kind;
  if (!run(`Boolean(rowSpec(${JSON.stringify(kind)}))`)) return;
  const result = run(`(() => {
    const kind = ${JSON.stringify(kind)};
    const spec = rowSpec(kind);
    const model = parseBlock(kind, ${JSON.stringify(template.lines)});
    const original = model.body.slice();
    const items = rowItems(kind, model.body);
    if (!items) return { kind, fallback: true };
    const first = rowLines(kind, items);
    model.body = first;
    const once = serializeBlock(model);
    const again = rowItems(kind, first);
    const samples = (spec.grid ? spec.sample : [].concat(spec.sample || [])).map((item) => JSON.parse(JSON.stringify(item)));
    samples.forEach((item) => again.push(item));
    if (spec.form && again.form) spec.form.forEach((field) => { if (!again.form[field.key]) again.form[field.key] = field.key === 'max' ? '8000' : '5'; });
    const moved = again.length > 1 && !spec.outline && !spec.lead ? [again[again.length - 1], ...again.slice(0, -1)] : again;
    if (moved !== again) { moved.meta = again.meta; moved.form = again.form; }
    (spec.add || []).forEach((entry) => moved.push(rowBlank(spec, entry.type, moved[moved.length - 1], moved)));
    model.body = rowLines(kind, moved);
    const edited = serializeBlock(model);
    return { kind, original, first, once, edited, raw: items.filter((item) => item.type === 'raw' && !rowComment(item.text)).map((item) => item.text) };
  })()`);
  const same = (semantic[kind] || ((lines) => normal(lines).join('|')))(result.original || []) === (semantic[kind] || ((lines) => normal(lines).join('|')))(result.first || []);
  report.push({ ...result, same, source: template.lines });
});
process.stdout.write(JSON.stringify(report));
