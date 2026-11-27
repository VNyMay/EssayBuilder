const RAW_TYPE = { cls: 'raw', fields: [{ key: 'text', mono: true, grow: 1 }] };
const ROW_ARROW = /(?<=\s)(->|-[^\s>][^>]*?->|=>|\.\.>)(?=\s)/;
const ROW_BULLET = /^([-*•]\s+)/;
const ROW_OUTLINE_BULLET = /^([-*+]\s+)/;

const rowRaw = (text, depth = 0) => ({ type: 'raw', depth, text });
const rowComment = (line) => /^\s*(%%|\/\/)/.test(line);
const rowUsed = (lines) => lines.filter((line) => line.trim());
const rowIndent = (line) => line.replace(/\t/g, '    ').length - line.replace(/\t/g, '    ').trimStart().length;

function rowSplit(text, sep) {
  const at = text.indexOf(sep);
  if (at < 0) return null;
  return [text.slice(0, at).trim(), text.slice(at + sep.length).trim()];
}

function rowWriteRaw(item) {
  return item.text;
}

function pairKind({ left, right, sep = ':', join = ': ', add, sample, extraTypes = {}, readExtra, writeExtra, glue = false }) {
  return {
    types: {
      item: { fields: [{ key: 'a', grow: 2, ...left }, { key: 'b', grow: 3, ...right }] },
      ...extraTypes,
    },
    add,
    sample,
    blank: (type) => (extraTypes[type] && extraTypes[type].make ? extraTypes[type].make() : { type: 'item', a: '', b: '' }),
    read(lines) {
      const items = [];
      lines.forEach((line) => {
        if (!line.trim()) return;
        const extra = readExtra && readExtra(line);
        if (extra) {
          items.push(extra);
          return;
        }
        if (glue && /^\s/.test(line) && items.length && items[items.length - 1].type === 'item') {
          items[items.length - 1].b = `${items[items.length - 1].b} ${line.trim()}`.trim();
          return;
        }
        const parts = rowComment(line) || /^\s/.test(line) ? null : rowSplit(line, sep);
        if (!parts || !parts[0]) items.push(rowRaw(line));
        else items.push({ type: 'item', a: parts[0], b: parts[1] });
      });
      return items;
    },
    write(items) {
      return items.map((item) => {
        if (item.type === 'item') return `${item.a}${join}${item.b}`.trimEnd();
        if (writeExtra && item.type !== 'raw') return writeExtra(item);
        return rowWriteRaw(item);
      });
    },
  };
}

function listKind({ placeholder, add, sample, mono = false, numbered = false }) {
  return {
    types: { item: { fields: [{ key: 'text', placeholder, mono, grow: 1 }] } },
    add,
    sample,
    blank: () => ({ type: 'item', text: '' }),
    read(lines) {
      const items = [];
      let counted = 0;
      lines.forEach((line) => {
        if (!line.trim()) return;
        if (rowComment(line) || /^\s/.test(line)) {
          items.push(rowRaw(line));
          return;
        }
        let text = line.trim();
        if (numbered && /^\d+[.)]\s+/.test(text)) {
          text = text.replace(/^\d+[.)]\s+/, '');
          counted += 1;
        }
        items.push({ type: 'item', text });
      });
      items.meta = { numbered: numbered && counted > 0 && counted === items.filter((item) => item.type === 'item').length };
      return items;
    },
    write(items) {
      let n = 0;
      const counted = items.meta ? items.meta.numbered : numbered;
      return items.map((item) => {
        if (item.type !== 'item') return rowWriteRaw(item);
        n += 1;
        return counted ? `${n}. ${item.text}` : item.text;
      });
    },
  };
}

function outlineKind({ fields, parse, format, add, sample, unit = 2 }) {
  return {
    outline: true,
    types: { item: { fields } },
    add,
    sample,
    blank: () => {
      const item = { type: 'item', depth: 0 };
      fields.forEach((field) => {
        if (field.key) item[field.key] = field.kind === 'choice' ? field.choices[0][0] : '';
      });
      return item;
    },
    read(lines) {
      const items = [];
      const widths = [];
      const steps = [];
      lines.forEach((line) => {
        if (!line.trim()) return;
        const indent = rowIndent(line);
        while (widths.length && indent < widths[widths.length - 1]) widths.pop();
        if (!widths.length || indent > widths[widths.length - 1]) {
          if (widths.length) steps.push(indent - widths[widths.length - 1]);
          widths.push(indent);
        }
        const depth = widths.length - 1;
        const text = line.trim();
        if (rowComment(line)) {
          items.push(rowRaw(text, depth));
          return;
        }
        const mark = (text.match(ROW_OUTLINE_BULLET) || ['', ''])[1];
        const fieldsOf = parse(text.slice(mark.length));
        if (!fieldsOf) items.push(rowRaw(text, depth));
        else items.push({ type: 'item', depth, mark, ...fieldsOf });
      });
      items.meta = { unit: steps.length ? Math.max(1, Math.min(...steps)) : unit };
      return items;
    },
    write(items) {
      const pad = ' '.repeat((items.meta && items.meta.unit) || unit);
      return items.map((item) => {
        const lead = pad.repeat(Math.max(0, item.depth || 0));
        if (item.type !== 'item') return `${lead}${item.text.trim()}`;
        return `${lead}${item.mark || ''}${format(item)}`.trimEnd();
      });
    },
  };
}

function wordKind(words, placeholder) {
  return {
    fields: [
      { key: 'word', kind: 'choice', choices: words.map((word) => [word, ROW_WORDS[word] || word.charAt(0).toUpperCase() + word.slice(1)]), size: 'l' },
      { key: 'rest', placeholder, grow: 1, optional: true },
    ],
    parse(text) {
      const match = text.match(/^(\S+)\s*(.*)$/);
      if (!match || !words.includes(match[1].toLowerCase())) return null;
      return { word: match[1].toLowerCase(), rest: match[2] };
    },
    format: (item) => `${item.word}${item.rest ? ` ${item.rest}` : ''}`,
  };
}

function boxKind({ titles = null, inline = false, titlePlaceholder = 'Title', pointPlaceholder = 'Point', addBox = 'Box', sample, valuePoint = false }) {
  const pointFields = valuePoint
    ? [{ key: 'text', placeholder: 'Item', grow: 2 }, { key: 'value', placeholder: '100, 200, 300', grow: 3 }]
    : [{ key: 'text', placeholder: pointPlaceholder, grow: 1 }];
  const titleField = titles
    ? { key: 'title', kind: 'choice', choices: titles.map((title) => [title, title]), grow: 1, custom: true }
    : { key: 'title', placeholder: titlePlaceholder, grow: 1 };
  return {
    lead: 'box',
    types: {
      box: { cls: 'box', group: true, child: 'point', childLabel: valuePoint ? 'Item' : 'Point', enter: 'point', fields: [titleField] },
      point: { cls: 'point', depth: 1, fields: pointFields },
    },
    add: [{ type: 'box', label: addBox }],
    sample,
    blank(type, prev, items) {
      if (type === 'point') return { type: 'point', depth: 1, text: '', value: '', mark: prev && prev.type === 'point' ? prev.mark : '- ' };
      const used = new Set((items || []).filter((item) => item.type === 'box').map((item) => item.title.toLowerCase()));
      const free = titles ? titles.find((title) => !used.has(title.toLowerCase())) : '';
      return { type: 'box', title: free || '' };
    },
    read(lines) {
      const items = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        const text = line.trim();
        if (rowComment(line)) {
          items.push(rowRaw(line));
          continue;
        }
        const indented = /^\s/.test(line);
        const bullet = text.match(ROW_BULLET);
        if (valuePoint) {
          if (!indented && text.endsWith(':')) items.push({ type: 'box', title: text.slice(0, -1).trim() });
          else if (indented && items.some((item) => item.type === 'box')) {
            const parts = rowSplit(text, ':');
            if (parts) items.push({ type: 'point', depth: 1, text: parts[0], value: parts[1], mark: '' });
            else items.push(rowRaw(line));
          } else items.push(rowRaw(line));
          continue;
        }
        if (inline) {
          const parts = !indented && !bullet ? rowSplit(text, ':') : null;
          if (parts && parts[0]) {
            items.push({ type: 'box', title: parts[0] });
            parts[1].split(';').map((part) => part.trim()).filter(Boolean).forEach((part) => items.push({ type: 'point', depth: 1, text: part, mark: '- ' }));
          } else if (bullet && items.some((item) => item.type === 'box')) items.push({ type: 'point', depth: 1, text: text.slice(bullet[1].length), mark: bullet[1] });
          else items.push(rowRaw(line));
          continue;
        }
        if (!bullet && text.endsWith(':')) items.push({ type: 'box', title: text.slice(0, -1).trim() });
        else if (items.some((item) => item.type === 'box')) items.push({ type: 'point', depth: 1, text: bullet ? text.slice(bullet[1].length) : text, mark: bullet ? bullet[1] : '' });
        else items.push(rowRaw(line));
      }
      return items;
    },
    write(items) {
      const out = [];
      let open = null;
      items.forEach((item) => {
        if (item.type === 'box') {
          open = inline ? { title: item.title, points: [] } : null;
          if (open) out.push(open);
          else out.push(`${item.title}:`);
          return;
        }
        if (item.type === 'point') {
          if (valuePoint) out.push(`  ${item.text}: ${item.value}`.trimEnd());
          else if (open) {
            if (item.text.trim()) open.points.push(item.text.trim().replace(/;/g, ','));
          } else out.push(`${item.mark || ''}${item.text}`);
          return;
        }
        open = null;
        out.push(rowWriteRaw(item));
      });
      return out.map((entry) => (typeof entry === 'string' ? entry : `${entry.title}:${entry.points.length ? ` ${entry.points.join('; ')}` : ''}`));
    },
  };
}

function valuesKind({ arrow = false, placeholder = 'Value', sample }) {
  return {
    inline: true,
    types: { item: { fields: [{ key: 'v', placeholder, size: 'auto' }] } },
    add: [{ type: 'item', label: 'Value' }],
    sample,
    blank: () => ({ type: 'item', v: '' }),
    read(lines) {
      const used = rowUsed(lines);
      if (used.length > 1 || used.some(rowComment)) return null;
      const text = (used[0] || '').trim();
      const sep = arrow || /->/.test(text) ? ' -> ' : text.includes(',') ? ', ' : ' ';
      const parts = sep === ' -> ' ? text.split(/\s*->\s*|\s*,\s*/) : sep === ', ' ? text.split(/\s*,\s*/) : text.split(/\s+/);
      const items = parts.filter((part) => part !== '').map((v) => ({ type: 'item', v }));
      items.meta = { sep };
      return items;
    },
    write(items) {
      const values = items.map((item) => String(item.v).trim()).filter(Boolean);
      const sep = (items.meta && items.meta.sep) || (arrow ? ' -> ' : ' ');
      return values.length ? [values.join(sep === ' ' && values.some((value) => /\s/.test(value)) ? ', ' : sep)] : [];
    },
  };
}

function formKind({ form, rows = null }) {
  const keys = form.map((field) => field.key);
  const base = rows || { types: {}, add: [], blank: () => rowRaw(''), read: (lines) => lines.filter((line) => line.trim()).map((line) => rowRaw(line)), write: (items) => items.map(rowWriteRaw) };
  return {
    ...base,
    form,
    read(lines) {
      const values = {};
      const rest = [];
      lines.forEach((line) => {
        const parts = /^\s/.test(line) ? null : rowSplit(line, ':');
        const key = parts ? parts[0].toLowerCase() : '';
        const field = form.find((item) => item.key === key || (item.alias || []).includes(key));
        if (field && !(field.key in values)) values[field.key] = parts[1];
        else rest.push(line);
      });
      const items = base.read.call(base, rest);
      if (!items) return null;
      items.form = values;
      return items;
    },
    write(items) {
      const values = items.form || {};
      const head = keys.filter((key) => values[key] !== undefined && String(values[key]).trim() !== '').map((key) => `${key}: ${String(values[key]).trim()}`);
      return head.concat(base.write.call(base, items));
    },
  };
}

function flowKind() {
  return {
    types: {
      item: {
        fields: [
          { key: 'from', placeholder: 'Step', grow: 1 },
          { key: 'label', placeholder: 'label', size: 's', cls: 'arrow', optional: true },
          { sep: '→' },
          { key: 'to', placeholder: 'Next step', grow: 1, optional: true },
        ],
      },
    },
    add: [{ type: 'item', label: 'Arrow' }],
    sample: { type: 'item', from: 'End', label: '', style: '->', to: 'Review' },
    blank: (type, prev) => ({ type: 'item', from: prev && prev.type === 'item' ? prev.to || prev.from : '', label: '', style: '->', to: '', chain: Boolean(prev && prev.type === 'item' && prev.to) }),
    read(lines) {
      const items = [];
      lines.forEach((line) => {
        if (!line.trim()) return;
        if (rowComment(line)) {
          items.push(rowRaw(line));
          return;
        }
        const parts = ` ${line.trim()} `.split(ROW_ARROW).map((part) => part.trim());
        if (parts.length === 1) {
          items.push({ type: 'item', from: parts[0], label: '', style: '->', to: '' });
          return;
        }
        for (let i = 0; i + 2 < parts.length; i += 2) {
          const arrow = parts[i + 1];
          const plain = ['->', '=>', '..>'].includes(arrow);
          items.push({ type: 'item', from: parts[i], label: plain ? '' : arrow.slice(1, -2).trim(), style: plain ? arrow : '->', to: parts[i + 2], chain: i > 0 });
        }
      });
      return items;
    },
    write(items) {
      const out = [];
      let last = null;
      items.forEach((item) => {
        if (item.type !== 'item') {
          out.push(rowWriteRaw(item));
          last = null;
          return;
        }
        const from = item.from.trim();
        const to = item.to.trim();
        if (!from && !to) return;
        if (!to || !from) {
          out.push(from || to);
          last = from ? null : { to };
          return;
        }
        const arrow = item.label.trim() ? `-${item.label.trim()}->` : item.style || '->';
        if (item.chain && last && last.to === from && from) {
          out[out.length - 1] += ` ${arrow} ${to}`;
        } else out.push(`${from} ${arrow} ${to}`);
        last = { to };
      });
      return out;
    },
  };
}

function regexKind({ fields, pattern, build, add, sample, blank, extraTypes = {}, readExtra, writeExtra }) {
  return {
    types: { item: { fields }, ...extraTypes },
    add,
    sample,
    blank: blank || (() => {
      const item = { type: 'item' };
      fields.forEach((field) => {
        if (field.key) item[field.key] = field.kind === 'choice' ? field.choices[0][0] : field.kind === 'check' ? false : '';
      });
      return item;
    }),
    read(lines) {
      return rowUsed(lines).map((line) => {
        const extra = readExtra && readExtra(line);
        if (extra) return extra;
        if (rowComment(line) || /^\s/.test(line)) return rowRaw(line);
        const found = pattern(line.trim());
        return found ? { type: 'item', ...found } : rowRaw(line);
      });
    },
    write(items) {
      return items.map((item) => {
        if (item.type === 'item') return build(item).trimEnd();
        if (writeExtra && item.type !== 'raw') return writeExtra(item);
        return rowWriteRaw(item);
      });
    },
  };
}

const NUM = (placeholder, size = 's') => ({ placeholder, kind: 'number', size });

function vennRegions(model) {
  const given = (typeof rowGet === 'function' ? rowGet(model, 'sets') : '').split(',').map((name) => name.trim()).filter(Boolean);
  const sets = given.length >= 2 ? given.slice(0, 3) : ['A', 'B'];
  const out = sets.map((name) => `${name} only`);
  for (let i = 0; i < sets.length; i += 1) for (let j = i + 1; j < sets.length; j += 1) out.push(`${sets[i]} and ${sets[j]}`);
  if (sets.length === 3) out.push(`${sets[0]} and ${sets[1]} and ${sets[2]}`);
  out.push('neither');
  return out;
}

const ROW_WORDS = { pc: 'PC' };
const DEVICES = ['router', 'switch', 'server', 'pc', 'laptop', 'printer', 'cloud', 'firewall', 'hub', 'modem', 'desktop', 'internet'];
const WIDGETS = ['window', 'panel', 'row', 'header', 'label', 'text', 'button', 'input', 'select', 'checkbox', 'image', 'table', 'nav', 'link', 'divider'];
const FORCE_WAYS = ['up', 'down', 'left', 'right', 'at 30°', 'at 45°', 'at 60°'];

const ROW_KINDS = {
  timeline: pairKind({
    left: { placeholder: 'When', size: 'm', grow: 0 },
    right: { placeholder: 'What happened' },
    add: [{ type: 'item', label: 'Event' }, { type: 'section', label: 'Section' }],
    sample: { type: 'item', a: '2020', b: 'A new event' },
    extraTypes: { section: { cls: 'heading', fields: [{ key: 'name', placeholder: 'Section', grow: 1 }], make: () => ({ type: 'section', name: '' }) } },
    readExtra: (line) => (/^\s*#/.test(line) ? { type: 'section', name: line.trim().replace(/^#+\s*/, '') } : null),
    writeExtra: (item) => `# ${item.name}`,
  }),
  flow: flowKind(),
  mindmap: outlineKind({
    fields: [{ key: 'text', placeholder: 'Idea', grow: 1 }],
    parse: (text) => ({ text }),
    format: (item) => item.text,
    add: [{ type: 'item', label: 'Idea' }],
    sample: { type: 'item', depth: 1, text: 'New idea' },
  }),
  tree: outlineKind({
    fields: [{ key: 'text', placeholder: 'Name', grow: 1 }],
    parse: (text) => ({ text }),
    format: (item) => item.text,
    add: [{ type: 'item', label: 'Item' }],
    sample: { type: 'item', depth: 1, text: 'New branch' },
  }),
  grid: boxKind({ sample: [{ type: 'box', title: 'Extra' }, { type: 'point', depth: 1, text: 'More', mark: '- ' }] }),
  swot: boxKind({ titles: ['Strengths', 'Weaknesses', 'Opportunities', 'Threats'], sample: [{ type: 'point', depth: 1, text: 'Extra point', mark: '- ' }] }),
  pestle: boxKind({ titles: ['Political', 'Economic', 'Social', 'Technological', 'Legal', 'Environmental'], inline: true, addBox: 'Factor', sample: [{ type: 'point', depth: 1, text: 'Green policies', mark: '- ' }] }),
  steep: boxKind({ titles: ['Social', 'Technological', 'Economic', 'Environmental', 'Political'], inline: true, addBox: 'Factor', sample: [{ type: 'point', depth: 1, text: 'Green policies', mark: '- ' }] }),
  porter: boxKind({ titles: ['Rivalry', 'New entrants', 'Suppliers', 'Buyers', 'Substitutes'], inline: true, addBox: 'Force', sample: [{ type: 'point', depth: 1, text: 'Streaming', mark: '- ' }] }),
  ansoff: boxKind({ titles: ['Penetration', 'Product development', 'Market development', 'Diversification'], inline: true, addBox: 'Strategy', sample: [{ type: 'point', depth: 1, text: 'Discounts', mark: '- ' }] }),
  fishbone: boxKind({ titles: ['People', 'Methods', 'Materials', 'Machines', 'Measurement', 'Environment'], inline: true, addBox: 'Cause group', pointPlaceholder: 'Cause', sample: [{ type: 'point', depth: 1, text: 'Untrained staff', mark: '- ' }] }),
  cashflow: boxKind({ titles: ['Cash in', 'Cash out'], valuePoint: true, addBox: 'Heading', sample: [{ type: 'point', depth: 1, text: 'Rent', value: '1000, 1000, 1000', mark: '' }] }),
  gantt: regexKind({
    fields: [{ key: 'name', placeholder: 'Task', grow: 3 }, { key: 'when', placeholder: '1-3', grow: 2 }],
    pattern: (text) => {
      const parts = rowSplit(text, ':');
      return parts && parts[0] ? { name: parts[0], when: parts[1] } : null;
    },
    build: (item) => `${item.name}: ${item.when}`,
    add: [{ type: 'item', label: 'Task' }, { type: 'section', label: 'Section' }],
    sample: { type: 'item', name: 'Review', when: '10-11' },
    extraTypes: { section: { cls: 'heading', fields: [{ key: 'name', placeholder: 'Section', grow: 1 }] } },
    readExtra: (line) => (/^\s*section(\s|$)/i.test(line) ? { type: 'section', name: line.trim().replace(/^section\s*/i, '') } : null),
    writeExtra: (item) => `section ${item.name}`,
  }),
  glossary: pairKind({
    left: { placeholder: 'Term', grow: 2 },
    right: { placeholder: 'Definition', grow: 4, optional: true },
    add: [{ type: 'item', label: 'Term' }],
    sample: { type: 'item', a: 'Tariff', b: 'a tax on imports.' },
    glue: true,
  }),
  checklist: regexKind({
    fields: [{ key: 'done', kind: 'check' }, { key: 'text', placeholder: 'Item', grow: 1 }],
    pattern: (text) => {
      const match = text.match(/^[-*]\s*\[([ xX])\]\s*(.*)$/);
      return match ? { done: match[1] !== ' ', text: match[2] } : null;
    },
    build: (item) => `- [${item.done ? 'x' : ' '}] ${item.text}`,
    add: [{ type: 'item', label: 'Item' }],
    sample: { type: 'item', done: false, text: 'Proofread' },
  }),
  steps: listKind({ placeholder: 'Step', add: [{ type: 'item', label: 'Step' }], sample: { type: 'item', text: 'Check the answer' }, numbered: true }),
  venn: pairKind({
    left: { placeholder: 'Region', suggest: vennRegions },
    right: { placeholder: 'Number or items' },
    add: [{ type: 'item', label: 'Region' }],
    sample: { type: 'item', a: 'neither', b: '1' },
  }),
  pyramid: pairKind({
    left: { placeholder: 'Level', grow: 3 },
    right: { placeholder: 'Value', grow: 1, kind: 'number', size: 'm' },
    add: [{ type: 'item', label: 'Level' }],
    sample: { type: 'item', a: 'Quaternary consumers', b: '3' },
  }),
  foodweb: regexKind({
    fields: [{ key: 'from', placeholder: 'Food', grow: 2 }, { sep: '→' }, { key: 'to', placeholder: 'Eaten by', grow: 3 }],
    pattern: (text) => {
      const parts = rowSplit(text, '->');
      return parts && parts[0] && parts[1] ? { from: parts[0], to: parts[1] } : null;
    },
    build: (item) => `${item.from} -> ${item.to}`,
    add: [{ type: 'item', label: 'Link' }],
    sample: { type: 'item', from: 'Grass', to: 'Deer' },
  }),
  fsm: regexKind({
    fields: [{ key: 'from', placeholder: 'State', grow: 2 }, { sep: '→' }, { key: 'to', placeholder: 'Next state', grow: 2 }, { key: 'event', placeholder: 'event', grow: 2, optional: true }],
    pattern: (text) => {
      const match = text.match(/^(.+?)\s*->\s*(.+?)(?:\s*:\s*(.*))?$/);
      return match ? { from: match[1], to: match[2], event: match[3] || '' } : null;
    },
    build: (item) => `${item.from} -> ${item.to}${item.event.trim() ? ` : ${item.event.trim()}` : ''}`,
    add: [{ type: 'item', label: 'Transition' }],
    sample: { type: 'item', from: 'Red', to: 'Off', event: 'fault' },
  }),
  seq: regexKind({
    fields: [
      { key: 'from', placeholder: 'From', grow: 2 },
      { key: 'reply', kind: 'choice', choices: [['', '→'], ['yes', '⇢']], size: 'xs' },
      { key: 'to', placeholder: 'To', grow: 2 },
      { key: 'msg', placeholder: 'Message', grow: 3, line: true },
    ],
    pattern: (text) => {
      const match = text.match(/^([^:]+?)\s*(-->|->)\s*([^:]+?)\s*:\s*(.*)$/);
      return match ? { from: match[1], reply: match[2] === '-->' ? 'yes' : '', to: match[3], msg: match[4] } : null;
    },
    build: (item) => `${item.from} ${item.reply ? '-->' : '->'} ${item.to}: ${item.msg}`,
    add: [{ type: 'item', label: 'Message' }],
    sample: { type: 'item', from: 'User', reply: '', to: 'Website', msg: 'Log out' },
  }),
  graph: regexKind({
    fields: [
      { key: 'from', placeholder: 'A', grow: 2 },
      { key: 'way', kind: 'choice', choices: [['-', '─'], ['->', '→']], size: 'xs' },
      { key: 'to', placeholder: 'B', grow: 2, optional: true },
      { key: 'weight', placeholder: 'weight', grow: 1, optional: true },
    ],
    pattern: (text) => {
      const match = text.match(/^(.+?)\s+(->|-)\s+(.+?)(?:\s*:\s*(.*))?$/);
      if (match) return { from: match[1], way: match[2], to: match[3], weight: match[4] || '' };
      return /^[\w-]+$/.test(text) ? { from: text, way: '-', to: '', weight: '' } : null;
    },
    build: (item) => (item.to.trim() ? `${item.from} ${item.way} ${item.to}${item.weight.trim() ? ` : ${item.weight.trim()}` : ''}` : item.from),
    add: [{ type: 'item', label: 'Edge' }],
    sample: { type: 'item', from: 'D', way: '-', to: 'E', weight: '3' },
    blank: () => ({ type: 'item', from: '', way: '-', to: '', weight: '' }),
  }),
  fbd: regexKind({
    fields: [{ key: 'name', placeholder: 'Force', grow: 3 }, { key: 'size', placeholder: '20 N', grow: 2, optional: true }, { key: 'way', placeholder: 'Direction', grow: 2, suggest: FORCE_WAYS }],
    pattern: (text) => {
      const parts = rowSplit(text, ':');
      if (!parts || !parts[0]) return null;
      const match = parts[1].match(/^(.*?)\s*((?:up|down|left|right)|at\s+-?[\d.]+\s*°?)$/i);
      return match ? { name: parts[0], size: match[1], way: match[2] } : { name: parts[0], size: parts[1], way: '' };
    },
    build: (item) => `${item.name}: ${[item.size.trim(), item.way.trim()].filter(Boolean).join(' ')}`,
    add: [{ type: 'item', label: 'Force' }],
    sample: { type: 'item', name: 'Drag', size: '4 N', way: 'left' },
  }),
  bcg: regexKind({
    fields: [{ key: 'name', placeholder: 'Product', grow: 3 }, { key: 'share', ...NUM('Share') }, { key: 'growth', ...NUM('Growth %') }, { key: 'size', ...NUM('Size'), optional: true }],
    pattern: (text) => {
      const parts = rowSplit(text, ':');
      if (!parts || !parts[0]) return null;
      const found = { name: parts[0], share: '', growth: '', size: '' };
      const rest = parts[1].replace(/\b(share|growth|size)\s+(-?[\d.]+)/gi, (all, key, value) => {
        found[key.toLowerCase()] = value;
        return '';
      });
      return rest.replace(/[,\s]/g, '') ? null : found;
    },
    build: (item) => `${item.name}: ${['share', 'growth', 'size'].filter((key) => String(item[key]).trim() !== '').map((key) => `${key} ${item[key]}`).join(', ')}`,
    add: [{ type: 'item', label: 'Product' }],
    sample: { type: 'item', name: 'Juice', share: '0.5', growth: '8', size: '10' },
  }),
  stakeholder: regexKind({
    fields: [{ key: 'name', placeholder: 'Stakeholder', grow: 3 }, { key: 'power', ...NUM('Power') }, { key: 'interest', ...NUM('Interest') }],
    pattern: (text) => {
      const parts = rowSplit(text, ':');
      if (!parts || !parts[0]) return null;
      const long = parts[1].match(/^power\s+([\d.]+)\s*,\s*interest\s+([\d.]+)$/i);
      const short = parts[1].match(/^([\d.]+)\s*,\s*([\d.]+)$/);
      const hit = long || short;
      return hit ? { name: parts[0], power: hit[1], interest: hit[2] } : null;
    },
    build: (item) => `${item.name}: power ${item.power || 0}, interest ${item.interest || 0}`,
    add: [{ type: 'item', label: 'Stakeholder' }],
    sample: { type: 'item', name: 'Suppliers', power: '5', interest: '5' },
  }),
  ppc: regexKind({
    fields: [{ key: 'name', placeholder: 'Point', size: 's' }, { key: 'x', ...NUM('x', 'm') }, { key: 'y', ...NUM('y', 'm') }],
    pattern: (text) => {
      const match = text.match(/^(.+?)\s*:\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)$/);
      return match ? { name: match[1], x: match[2], y: match[3] } : null;
    },
    build: (item) => `${item.name}: ${item.x || 0}, ${item.y || 0}`,
    add: [{ type: 'item', label: 'Point' }],
    sample: { type: 'item', name: 'D', x: '20', y: '60' },
  }),
  lorenz: pairKind({ left: { placeholder: 'Name' }, right: { placeholder: '5, 9, 14, 22, 50' }, add: [{ type: 'item', label: 'Curve' }], sample: { type: 'item', a: 'Country C', b: '10, 15, 20, 25, 30' } }),
  boxplot: pairKind({ left: { placeholder: 'Group' }, right: { placeholder: '12, 15, 18, 21' }, add: [{ type: 'item', label: 'Group' }], sample: { type: 'item', a: 'Class C', b: '150, 152, 160, 164, 170' } }),
  stemleaf: regexKind({
    fields: [{ key: 'name', placeholder: 'Group', grow: 1, optional: true }, { key: 'values', placeholder: '12, 15, 21, 23', grow: 4 }],
    pattern: (text) => {
      const parts = /^[^\d\s,.-][^:]*:/.test(text) ? rowSplit(text, ':') : null;
      return parts ? { name: parts[0], values: parts[1] } : { name: '', values: text };
    },
    build: (item) => (item.name.trim() ? `${item.name.trim()}: ${item.values}` : item.values),
    add: [{ type: 'item', label: 'Numbers' }],
    sample: { type: 'item', name: '', values: '64, 68' },
  }),
  triangle: regexKind({
    fields: [{ key: 'part', placeholder: 'AB or A', size: 'm' }, { sep: '=' }, { key: 'value', placeholder: '5 cm or 40°', grow: 1 }],
    pattern: (text) => {
      const parts = rowSplit(text, '=');
      return parts && parts[0] ? { part: parts[0], value: parts[1] } : null;
    },
    build: (item) => `${item.part} = ${item.value}`,
    add: [{ type: 'item', label: 'Side or angle' }],
    sample: { type: 'item', part: 'B', value: '90°' },
  }),
  numberline: listKind({ placeholder: 'x > 2', mono: true, add: [{ type: 'item', label: 'Row' }], sample: { type: 'item', text: 'x < 0' } }),
  coordplane: listKind({ placeholder: 'A (1, 2) or y = 2x + 1', mono: true, add: [{ type: 'item', label: 'Line' }], sample: { type: 'item', text: 'C (2, 5)' } }),
  vectors: listKind({ placeholder: 'a = (3, 2) or a + b', mono: true, add: [{ type: 'item', label: 'Line' }], sample: { type: 'item', text: 'a - b' } }),
  logic: listKind({ placeholder: 'Q = A AND B', mono: true, add: [{ type: 'item', label: 'Expression' }], sample: { type: 'item', text: 'R = A XOR B' } }),
  truth: listKind({ placeholder: 'A AND B', mono: true, add: [{ type: 'item', label: 'Expression' }], sample: { type: 'item', text: 'A XOR B' } }),
  binary: listKind({ placeholder: '13 or 0xFF', mono: true, add: [{ type: 'item', label: 'Number' }], sample: { type: 'item', text: '42' } }),
  osi: pairKind({
    left: { kind: 'choice', choices: ['application', 'presentation', 'session', 'transport', 'network', 'data link', 'physical', 'internet', 'link'].map((name) => [name, name.charAt(0).toUpperCase() + name.slice(1)]), custom: true, grow: 2 },
    right: { placeholder: 'HTTP, DNS' },
    add: [{ type: 'item', label: 'Layer' }],
    sample: { type: 'item', a: 'application', b: 'HTTP, DNS' },
  }),
  circuit: pairKind({
    left: { kind: 'choice', choices: [['series', 'In series'], ['parallel', 'In parallel'], ['voltmeter', 'Voltmeter']], custom: true, grow: 2 },
    right: { placeholder: 'switch, bulb' , grow: 4 },
    add: [{ type: 'item', label: 'Part' }],
    sample: { type: 'item', a: 'series', b: 'ammeter' },
  }),
  erd: regexKind({
    fields: [{ key: 'name', placeholder: 'Entity', grow: 2 }, { key: 'attrs', placeholder: 'id PK, name', grow: 4 }],
    pattern: (text) => {
      const parts = rowSplit(text, ':');
      return parts && parts[0] && !/\s/.test(parts[0]) ? { name: parts[0], attrs: parts[1] } : null;
    },
    build: (item) => `${item.name}: ${item.attrs}`,
    add: [{ type: 'item', label: 'Entity' }, { type: 'link', label: 'Link' }],
    sample: [{ type: 'item', name: 'Product', attrs: 'id PK, title' }, { type: 'link', text: 'Order many -- many Product : lists' }],
    extraTypes: { link: { fields: [{ key: 'text', placeholder: 'Customer one -- many Order : places', grow: 1 }] } },
    readExtra: (line) => (/\s--\s/.test(line) && !/^\s/.test(line) ? { type: 'link', text: line.trim() } : null),
    writeExtra: (item) => item.text,
  }),
  probtree: outlineKind({
    fields: [{ key: 'event', placeholder: 'Event', grow: 3 }, { key: 'p', placeholder: '0.5', size: 's' }],
    parse: (text) => {
      const at = text.lastIndexOf(':');
      return at > 0 ? { event: text.slice(0, at).trim(), p: text.slice(at + 1).trim() } : null;
    },
    format: (item) => `${item.event}: ${item.p}`,
    add: [{ type: 'item', label: 'Branch' }],
    sample: { type: 'item', depth: 0, event: 'Snow', p: '0' },
  }),
  decisiontree: outlineKind({
    fields: [{ key: 'name', placeholder: 'Option or outcome', grow: 1 }, { key: 'note', placeholder: '0.6', size: 's', optional: true }, { key: 'value', placeholder: 'Payoff', size: 'm', optional: true }],
    parse: (text) => {
      const match = text.match(/^([^():]*?)\s*(?:\(([^()]*)\))?\s*(?::\s*(.*))?$/);
      return match && match[1] ? { name: match[1], note: match[2] || '', value: match[3] || '' } : null;
    },
    format: (item) => `${item.name}${item.note.trim() ? ` (${item.note.trim()})` : ''}${String(item.value).trim() ? `: ${String(item.value).trim()}` : ''}`,
    add: [{ type: 'item', label: 'Option' }],
    sample: { type: 'item', depth: 0, name: 'Rent a shop', note: 'cost 20000', value: '30000' },
  }),
  pedigree: outlineKind({
    fields: [{ key: 'text', placeholder: 'Ann (female, carrier) + Bob (male)', grow: 1 }],
    parse: (text) => ({ text }),
    format: (item) => item.text,
    add: [{ type: 'item', label: 'Person' }],
    sample: { type: 'item', depth: 1, text: 'Hal (male)' },
  }),
  wireframe: outlineKind({
    ...wordKind(WIDGETS, 'Label'),
    add: [{ type: 'item', label: 'Element' }],
    sample: { type: 'item', depth: 1, word: 'button', rest: 'Cancel' },
  }),
  network: outlineKind({
    ...wordKind(DEVICES, 'x3 or a name'),
    add: [{ type: 'item', label: 'Device' }],
    sample: { type: 'item', depth: 0, word: 'laptop', rest: 'x2' },
  }),
  uml: outlineKind({
    fields: [{ key: 'text', placeholder: 'class Name, + member, or A extends B', mono: true, grow: 1 }],
    parse: (text) => ({ text }),
    format: (item) => item.text,
    add: [{ type: 'item', label: 'Line' }],
    sample: { type: 'item', depth: 0, text: 'class Cat' },
  }),
  figures: regexKind({
    fields: [{ key: 'src', kind: 'file', accept: 'image/*', size: 'l' }, { key: 'caption', placeholder: 'Sub-caption', grow: 1, optional: true }],
    pattern: (text) => {
      const parts = text.split('|');
      return { src: parts[0].trim(), caption: parts.slice(1).join('|').trim() };
    },
    build: (item) => (item.caption.trim() ? `${item.src} | ${item.caption.trim()}` : item.src),
    add: [{ type: 'item', label: 'Image' }],
    sample: { type: 'item', src: 'images/a.png', caption: 'Again' },
  }),
  array: valuesKind({ sample: { type: 'item', v: '7' } }),
  linkedlist: valuesKind({ arrow: true, sample: { type: 'item', v: '9' } }),
  stack: valuesKind({ sample: { type: 'item', v: '5' } }),
  queue: valuesKind({ sample: { type: 'item', v: '3' } }),
  bintree: valuesKind({ sample: { type: 'item', v: '90' } }),
  sorting: valuesKind({ sample: { type: 'item', v: '4' } }),
  hashtable: valuesKind({ sample: { type: 'item', v: '29' } }),
  bigo: valuesKind({ placeholder: 'n^2', sample: { type: 'item', v: 'n^3' } }),
  breakeven: formKind({
    form: [
      { key: 'fixed costs', label: 'Fixed costs', kind: 'number' },
      { key: 'variable cost', label: 'Variable cost', kind: 'number' },
      { key: 'price', label: 'Price', kind: 'number' },
      { key: 'output', label: 'Output', kind: 'number' },
      { key: 'max', label: 'Axis up to', kind: 'number' },
    ],
  }),
  payback: formKind({
    form: [
      { key: 'investment', label: 'Investment', kind: 'number' },
      { key: 'rate', label: 'Discount rate %', kind: 'number' },
    ],
    rows: pairKind({
      left: { placeholder: 'Year 1', grow: 2 },
      right: { placeholder: 'Cash', kind: 'number', grow: 2 },
      add: [{ type: 'item', label: 'Year' }],
      sample: { type: 'item', a: 'Year 5', b: '10000' },
    }),
  }),
};

ROW_KINDS.trace = {
  grid: true,
  types: {},
  sample: [['4', '10', '10']],
  read(lines) {
    const used = rowUsed(lines);
    if (!used.length || used.some((line) => rowComment(line) || /^\s*\|/.test(line))) return null;
    return used.map((line) => line.split('|').map((cell) => cell.trim()));
  },
  write(rows) {
    return rows.filter((cells) => cells.some((cell) => cell.trim())).map((cells) => cells.map((cell) => cell.trim()).join(' | ').trimEnd());
  },
};

ROW_KINDS.payback.blank = (type, prev, items) => ({ type: 'item', a: `Year ${(items || []).filter((item) => item.type === 'item').length + 1}`, b: '' });

const ROW_TITLES = {
  timeline: 'Events', flow: 'Steps', mindmap: 'Ideas', tree: 'Outline', grid: 'Boxes', swot: 'Boxes', figures: 'Images',
};

const ROW_HEADS = {
  timeline: ['When', 'What'],
  gantt: ['Task', 'When'],
  glossary: ['Term', 'Definition'],
  venn: ['Region', 'Value'],
  pyramid: ['Level', 'Value'],
  foodweb: ['Food', 'Eaten by'],
  fsm: ['From', 'To', 'Event'],
  seq: ['From', '', 'To'],
  graph: ['From', '', 'To', 'Weight'],
  fbd: ['Force', 'Size', 'Direction'],
  bcg: ['Product', 'Share', 'Growth %', 'Size'],
  stakeholder: ['Stakeholder', 'Power', 'Interest'],
  ppc: ['Point', 'x', 'y'],
  lorenz: ['Name', 'Income shares, poorest first'],
  boxplot: ['Group', 'Values'],
  stemleaf: ['Group', 'Numbers'],
  triangle: ['Part', 'Value'],
  osi: ['Layer', 'Protocols'],
  circuit: ['Part', 'Components'],
  erd: ['Entity', 'Attributes'],
  probtree: ['Event', 'P'],
  decisiontree: ['Option', 'Chance', 'Payoff'],
  network: ['Device', 'Count or name'],
  wireframe: ['Element', 'Label'],
  payback: ['Year', 'Cash in'],
  figures: ['Image', 'Sub-caption'],
  flow: ['Step', 'Label', 'Next step'],
};

Object.entries(ROW_HEADS).forEach(([kind, heads]) => {
  const fields = ROW_KINDS[kind].types.item.fields.filter((field) => !field.sep);
  heads.forEach((head, index) => {
    if (fields[index]) fields[index].label = head;
  });
});

function rowBlank(spec, type, prev, items) {
  const made = spec.blank ? spec.blank(type, prev, items) : null;
  if (made && made.type === type) return made;
  const shape = spec.types[type] || RAW_TYPE;
  const item = { type, depth: shape.depth || 0 };
  shape.fields.forEach((field) => {
    if (field.key) item[field.key] = field.kind === 'check' ? false : field.kind === 'choice' ? field.choices[0][0] : '';
  });
  return item;
}

function rowSpec(kind) {
  return ROW_KINDS[kind] || null;
}

function rowItems(kind, lines) {
  const spec = rowSpec(kind);
  if (!spec) return null;
  const items = spec.read.call(spec, lines);
  if (!items) return null;
  return items;
}

function rowComplete(spec, item) {
  if (item.type === 'raw') return true;
  const shape = spec.types[item.type];
  if (!shape) return true;
  const filled = (field) => String(item[field.key] ?? '').trim() !== '';
  const keyed = shape.fields.filter((field) => field.key && field.kind !== 'check');
  if (!keyed.some(filled)) return false;
  return keyed.every((field) => field.optional || field.kind === 'choice' || filled(field));
}

function rowLines(kind, items) {
  const spec = rowSpec(kind);
  const kept = items.filter((item) => rowComplete(spec, item));
  kept.meta = items.meta;
  kept.form = items.form;
  return spec.write.call(spec, kept);
}
