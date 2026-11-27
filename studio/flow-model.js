const FLOW = {
  on: false,
  editor: null,
  root: null,
  sheet: null,
  marks: null,
  front: null,
  bar: null,
  header: [],
  lastSource: null,
  map: [],
  crops: new Map(),
  uid: 0,
  pulling: false,
  find: null,
  slash: null,
  pop: null,
  frontPages: [],
};

Object.assign(ICON_SET, {
  listOrdered: '<path d="M10 12h11" /> <path d="M10 18h11" /> <path d="M10 6h11" /> <path d="M4 10h2" /> <path d="M4 6h1v4" /> <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />',
  textColor: '<path d="M4 21h16" /> <path d="m6 16 6-13 6 13" /> <path d="M8.2 11.5h7.6" />',
  eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /> <path d="M22 21H7" /> <path d="m5 11 9 9" />',
  footnote: '<path d="M12 6v12" /> <path d="M17.196 9 6.804 15" /> <path d="m6.804 9 10.392 6" />',
  note: '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" /> <path d="M12 8v6" /> <path d="M9 11h6" />',
});

const FLOW_NO_BODY =new Set(['pagebreak', 'blank', 'numbering', 'spacer', 'wc-start', 'wc-end', 'list-of-figures', 'list-of-tables', 'contents']);
const FLOW_DIRECTIVE = /^:::\s*([A-Za-z][\w-]*)\s*(.*?)\s*$/;
const FLOW_HEADING = /^(#{1,3})\s+(.+?)\s*$/;
const FLOW_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const FLOW_NOTE = /^\[\^([\w-]+)\]:\s*(.*)$/;
const FLOW_IMAGE = /^!\[([^\]]*)\]\(([^)]+)\)\s*(\{.*\})?\s*$/;
const FLOW_COMMENT = /^\s*(%%|\/\/(\s|$))/;
const FLOW_TEXT_KEYS = new Set(['page', 'size', 'align', 'style', 'indent', 'font', 'color', 'bg', 'spacing', 'line', 'weight']);
const FLOW_END = ['references', 'bibliography', 'works cited', 'sources', 'appendix', 'appendices', 'bibliographie', 'références', 'annexe', 'annexes', 'المراجع', 'المصادر', 'قائمة المراجع', 'الملاحق', 'ملحق'];
const FLOW_FRONT = new Set(['abstract', 'acknowledgements', 'acknowledgments', 'preface', 'declaration', 'foreword', 'contents']);
const FLOW_COLORS = ['#141414', '#5d5d58', '#b3261e', '#c2410c', '#a16207', '#15803d', '#0f766e', '#1d4ed8', '#1f4e79', '#7e22ce', '#be185d'];
const FLOW_MARKS = ['#fff3a3', '#d9f99d', '#bae6fd', '#fbcfe8', '#fed7aa'];
const FLOW_SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36'];

function flowLines(text) {
  return text.split('\n');
}

function flowHeaderCut(all) {
  let i = 0;
  while (i < all.length && (!all[i].trim() || FLOW_COMMENT.test(all[i]))) i += 1;
  if (i >= all.length || !/^[A-Za-z][\w-]*\s*:/.test(all[i])) return -1;
  for (let j = i; j < all.length; j += 1) {
    if (all[j].trim() === '---') return j;
    if (all[j].trim() && !/^([A-Za-z][\w-]*\s*:|\s+\S)/.test(all[j]) && !FLOW_COMMENT.test(all[j])) return -1;
  }
  return -1;
}

function flowSplit(source) {
  const all = flowLines(source);
  const cut = flowHeaderCut(all);
  const header = cut >= 0 ? all.slice(0, cut + 1) : [];
  const body = cut >= 0 ? all.slice(cut + 1) : all;
  return { header, blocks: flowBlocks(body, header.length) };
}

function flowStarts(text) {
  const s = text.trim();
  if (!s) return true;
  return (
    FLOW_DIRECTIVE.test(s) || s === ':::' || s.startsWith('```') || s.startsWith('$$') || FLOW_HEADING.test(s) || FLOW_IMAGE.test(s)
    || s.startsWith('|') || s.startsWith('>') || FLOW_ITEM.test(text.replace(/\t/g, '    ')) || FLOW_COMMENT.test(text) || FLOW_NOTE.test(s)
  );
}

function flowBlocks(lines, offset) {
  const out = [];
  const push = (kind, from, to) => out.push({ kind, lines: lines.slice(from, to), start: offset + from + 1, end: offset + to });
  let i = 0;
  while (i < lines.length) {
    const text = lines[i];
    const s = text.trim();
    if (!s) {
      i += 1;
      continue;
    }
    if (FLOW_COMMENT.test(text) || s === ':::') {
      push('raw', i, i + 1);
      i += 1;
      continue;
    }
    if (FLOW_NOTE.test(s)) {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() && /^\s/.test(lines[j])) j += 1;
      push('notedef', i, j);
      i = j;
      continue;
    }
    const directive = s.match(FLOW_DIRECTIVE);
    if (directive) {
      const name = directive[1].toLowerCase();
      if (FLOW_NO_BODY.has(name)) {
        let j = i + 1;
        if (j < lines.length && lines[j].trim() === ':::') j += 1;
        push(name, i, j);
        i = j;
        continue;
      }
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== ':::') j += 1;
      push(name, i, Math.min(j + 1, lines.length));
      i = j + 1;
      continue;
    }
    if (s.startsWith('```')) {
      let j = i + 1;
      while (j < lines.length && !lines[j].trim().startsWith('```')) j += 1;
      push('fence', i, Math.min(j + 1, lines.length));
      i = j + 1;
      continue;
    }
    if (s.startsWith('$$')) {
      if (/^\$\$(.+?)\$\$\s*(\{[^{}]*\})?$/.test(s)) {
        push('math', i, i + 1);
        i += 1;
        continue;
      }
      if (s === '$$' || !/\$\$/.test(s.slice(2))) {
        let j = i + 1;
        while (j < lines.length && lines[j].trim() && !/\$\$\s*(\{[^{}]*\})?$/.test(lines[j].trim())) j += 1;
        push('math', i, Math.min(j + 1, lines.length));
        i = j + 1;
        continue;
      }
    }
    if (FLOW_HEADING.test(s)) {
      push('heading', i, i + 1);
      i += 1;
      continue;
    }
    if (FLOW_IMAGE.test(s)) {
      push('image', i, i + 1);
      i += 1;
      continue;
    }
    let ahead = i + 1;
    while (ahead < lines.length && !lines[ahead].trim()) ahead += 1;
    const caption = /^Table:\s*\S/.test(s) && ahead < lines.length && lines[ahead].trim().startsWith('|');
    if (s.startsWith('|') || caption) {
      let j = caption ? ahead : i;
      while (j < lines.length && lines[j].trim().startsWith('|')) j += 1;
      push('pipetable', i, j);
      i = j;
      continue;
    }
    if (s.startsWith('>')) {
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith('>')) j += 1;
      push('quote', i, j);
      i = j;
      continue;
    }
    if (FLOW_ITEM.test(text.replace(/\t/g, '    '))) {
      let j = i + 1;
      while (j < lines.length) {
        const raw = lines[j].replace(/\t/g, '    ');
        if (FLOW_ITEM.test(raw) || (raw.trim() && /^\s/.test(raw))) j += 1;
        else break;
      }
      push('list', i, j);
      i = j;
      continue;
    }
    let j = i + 1;
    while (j < lines.length && !flowStarts(lines[j])) j += 1;
    push('para', i, j);
    i = j;
  }
  return out;
}

function flowJoin(lines) {
  let text = '';
  lines.forEach((line) => {
    const piece = line.trim();
    if (piece.endsWith('\\\\')) text += piece.slice(0, -2).trimEnd() + BREAK;
    else text += `${piece} `;
  });
  return text.trim();
}

function flowTextOptions(lines) {
  const body = lines.slice(1, -1);
  const opts = [];
  let i = 0;
  while (i < body.length) {
    const match = body[i].match(/^\s*([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (!match || !FLOW_TEXT_KEYS.has(match[1].toLowerCase())) break;
    opts.push(`${match[1].toLowerCase()}: ${match[2].trim()}`);
    i += 1;
  }
  if (i < body.length && body[i].trim() === '---') i += 1;
  const rest = body.slice(i);
  if (rest.some((line) => !line.trim()) || rest.some((line, index) => index > 0 && flowStarts(line)) || (rest[0] && flowStarts(rest[0]))) return null;
  if (/\S/.test(lines[0].replace(/^:::\s*text/i, ''))) return null;
  return { opts, text: flowJoin(rest) };
}

const FLOW_CALLOUTS = {
  box: '',
  question: '',
  note: 'Note.',
  proof: 'Proof.',
  definition: 'Definition',
  theorem: 'Theorem',
  lemma: 'Lemma',
  proposition: 'Proposition',
  corollary: 'Corollary',
  example: 'Example',
  remark: 'Remark',
  tip: 'Tip',
  warning: 'Warning',
  info: 'Info',
  important: 'Important',
};

function flowCalloutParts(block) {
  if (!(block.kind in FLOW_CALLOUTS)) return null;
  const head = block.lines[0].trim().match(FLOW_DIRECTIVE);
  if (!head || block.lines[block.lines.length - 1].trim() !== ':::') return null;
  const body = block.lines.slice(1, -1);
  if (body.some((line) => line.trim() && flowStarts(line))) return null;
  const paragraphs = [];
  let current = [];
  body.forEach((line) => {
    if (line.trim()) current.push(line);
    else if (current.length) {
      paragraphs.push(flowJoin(current));
      current = [];
    }
  });
  if (current.length) paragraphs.push(flowJoin(current));
  return { kind: block.kind, args: head[2] || '', paragraphs: paragraphs.length ? paragraphs : [''] };
}

function flowItems(lines) {
  const items = [];
  const widths = [];
  lines.forEach((line) => {
    const raw = line.replace(/\t/g, '    ');
    const match = raw.match(FLOW_ITEM);
    if (match) {
      const indent = match[1].length;
      while (widths.length && indent < widths[widths.length - 1]) widths.pop();
      if (!widths.length || indent > widths[widths.length - 1]) widths.push(indent);
      const marker = match[2];
      items.push({ depth: widths.length - 1, ordered: /\d/.test(marker[0]), number: /\d/.test(marker[0]) ? parseInt(marker, 10) : 1, text: match[3].trim() });
    } else if (raw.trim() && items.length) items[items.length - 1].text += ` ${raw.trim()}`;
  });
  return items;
}

function flowListDom(items) {
  const root = document.createDocumentFragment();
  const stack = [];
  items.forEach((item) => {
    const tag = item.ordered ? 'OL' : 'UL';
    while (stack.length && stack[stack.length - 1].depth > item.depth) stack.pop();
    let top = stack[stack.length - 1];
    if (top && top.depth === item.depth && top.list.tagName !== tag) {
      stack.pop();
      top = stack[stack.length - 1];
    }
    if (!top || top.depth < item.depth) {
      const list = document.createElement(tag);
      if (tag === 'OL' && item.number !== 1) list.setAttribute('start', item.number);
      const parentItem = top && top.list.lastElementChild;
      if (parentItem) parentItem.append(list);
      else root.append(list);
      stack.push({ depth: item.depth, list });
      top = stack[stack.length - 1];
    }
    const li = document.createElement('li');
    const p = document.createElement('p');
    p.append(inlineNodes(item.text));
    li.append(p);
    top.list.append(li);
  });
  return root;
}

function flowBlockDom(block) {
  const kind = block.kind;
  if (kind === 'heading') {
    const match = block.lines[0].trim().match(FLOW_HEADING);
    const raw = match[2];
    let text = raw;
    let tail = '';
    if (!/\]\{[^{}]*\}\s*$/.test(raw)) {
      const found = raw.match(/\s*(\{[^{}]*\})\s*$/);
      if (found) {
        tail = found[1];
        text = raw.slice(0, found.index);
      }
    }
    const el = document.createElement(`h${match[1].length}`);
    el.dataset.tail = tail;
    el.append(inlineNodes(text));
    return el;
  }
  if (kind === 'para') {
    const p = document.createElement('p');
    p.append(inlineNodes(flowJoin(block.lines)));
    return p;
  }
  if (kind === 'text') {
    const parsed = flowTextOptions(block.lines);
    if (parsed) {
      const p = document.createElement('p');
      p.dataset.opts = JSON.stringify(parsed.opts);
      p.append(inlineNodes(parsed.text));
      return p;
    }
  }
  const callout = flowCalloutParts(block);
  if (callout) {
    const box = document.createElement('div');
    box.className = 'fcall';
    box.dataset.kind = callout.kind;
    box.dataset.args = callout.args;
    callout.paragraphs.forEach((text) => {
      const p = document.createElement('p');
      p.append(inlineNodes(text));
      box.append(p);
    });
    return box;
  }
  if (kind === 'list') return flowListDom(flowItems(block.lines));
  if (kind === 'quote') {
    const quote = document.createElement('blockquote');
    const paragraphs = [];
    let current = [];
    block.lines.forEach((line) => {
      const piece = line.trim().slice(1).trim();
      if (piece) current.push(piece);
      else if (current.length) {
        paragraphs.push(current.join(' '));
        current = [];
      }
    });
    if (current.length) paragraphs.push(current.join(' '));
    (paragraphs.length ? paragraphs : ['']).forEach((text) => {
      const p = document.createElement('p');
      p.append(inlineNodes(text));
      quote.append(p);
    });
    return quote;
  }
  const el = document.createElement('div');
  el.setAttribute('data-fb', '');
  el.dataset.kind = kind;
  el.dataset.src = block.lines.join('\n');
  return el;
}

function flowDocDom(blocks) {
  const box = document.createElement('div');
  blocks.forEach((block) => box.append(flowBlockDom(block)));
  if (!box.childNodes.length) box.append(document.createElement('p'));
  return box;
}

function flowDocFrom(blocks) {
  const schema = FLOW.editor.schema;
  return TT.DOMParser.fromSchema(schema).parse(flowDocDom(blocks), { preserveWhitespace: true });
}

function flowInlineMd(node) {
  const box = document.createElement('div');
  box.append(TT.DOMSerializer.fromSchema(FLOW.editor.schema).serializeFragment(node.content));
  return bodyMd(box);
}

function flowGuard(md) {
  if (/^(#{1,3}\s|[-*+]\s|\d+[.)]\s|>|\||:::|```|\$\$|%%|\/\/(\s|$)|!\[|\[\^[\w-]+\]:|Table:\s)/.test(md)) return `\\${md}`;
  return md;
}

function flowOneLine(md) {
  return md.replace(/\\\\\n/g, ' ').replace(/\n/g, ' ');
}

function flowListLines(list, depth, out) {
  const ordered = list.type.name === 'orderedList';
  let number = ordered ? list.attrs.start || 1 : 1;
  list.forEach((item) => {
    const marker = ordered ? `${number}.` : '-';
    number += 1;
    const texts = [];
    const nested = [];
    item.forEach((child) => {
      if (child.type.name === 'paragraph') texts.push(flowOneLine(flowInlineMd(child)));
      else if (child.type.name === 'bulletList' || child.type.name === 'orderedList') nested.push(child);
    });
    out.push(`${'   '.repeat(depth)}${marker} ${texts.join(' ').trim()}`);
    nested.forEach((child) => flowListLines(child, depth + 1, out));
  });
  return out;
}

function flowNodeLines(node) {
  const name = node.type.name;
  if (name === 'paragraph') {
    const md = flowInlineMd(node);
    const opts = node.attrs.opts;
    if (opts && opts.length) return md.trim() ? [':::text', ...opts, '---', ...flowLines(md).map(flowGuard), ':::'] : [];
    if (!md.trim()) return [];
    return flowLines(md).map(flowGuard);
  }
  if (name === 'heading') {
    const md = flowOneLine(flowInlineMd(node)).trim();
    if (!md) return [];
    return [`${'#'.repeat(node.attrs.level)} ${md}${node.attrs.tail ? ` ${node.attrs.tail}` : ''}`];
  }
  if (name === 'bulletList' || name === 'orderedList') return flowListLines(node, 0, []);
  if (name === 'blockquote') {
    const out = [];
    node.forEach((child) => {
      const md = flowOneLine(flowInlineMd(child)).trim();
      if (!md) return;
      if (out.length) out.push('>');
      out.push(`> ${md}`);
    });
    return out;
  }
  if (name === 'callout') {
    const out = [`:::${node.attrs.kind}${node.attrs.args ? ` ${node.attrs.args}` : ''}`];
    let first = true;
    node.forEach((child) => {
      const md = flowInlineMd(child);
      if (!md.trim()) return;
      if (!first) out.push('');
      first = false;
      out.push(...flowLines(md).map(flowGuard));
    });
    out.push(':::');
    return out;
  }
  if (name === 'figureBlock') return flowLines(node.attrs.src);
  return [];
}

function flowCalloutPlain(args) {
  return String(args || '').replace(/\{[^{}]*\}\s*$/, '').replace(/[*_`$\\]/g, '').trim();
}

const FlowCallout = () => TT.Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  addAttributes() {
    return { kind: { default: 'box' }, args: { default: '' }, uid: { default: null, rendered: false } };
  },
  parseHTML() {
    return [{ tag: 'div.fcall', getAttrs: (el) => ({ kind: el.dataset.kind || 'box', args: el.dataset.args || '', uid: flowNextUid() }) }];
  },
  renderHTML({ node }) {
    const kind = node.attrs.kind;
    const title = flowCalloutPlain(node.attrs.args);
    const word = FLOW_CALLOUTS[kind] || '';
    const adm = ['tip', 'warning', 'info', 'important'].includes(kind);
    const attrs = { class: `fcall fcall-${kind}`, 'data-kind': kind, 'data-args': node.attrs.args };
    if (adm) attrs['data-label'] = title || word;
    else if (word) attrs.style = `--ttl:"${title ? ` (${title.replace(/"/g, "'")})` : ''}"`;
    return ['div', attrs, 0];
  },
});

function flowSerialize() {
  const doc = FLOW.editor.state.doc;
  const body = [];
  const map = [];
  const head = FLOW.header.length;
  doc.forEach((node, offset, index) => {
    const lines = flowNodeLines(node);
    if (!lines.length) {
      map.push(null);
      return;
    }
    if (body.length) body.push('');
    const start = head + (head ? 2 : 1) + body.length;
    body.push(...lines);
    map.push({ start, end: start + lines.length - 1, kind: node.type.name === 'figureBlock' ? node.attrs.kind : node.type.name, uid: node.attrs.uid, index, offset });
  });
  const source = `${[...FLOW.header, ...(head ? [''] : []), ...body].join('\n')}\n`;
  return { source, map };
}

function flowBlockNodes(block) {
  if (block.kind !== 'list') return 1;
  let count = 0;
  let last = null;
  flowItems(block.lines).forEach((item) => {
    if (item.depth !== 0) return;
    if (last === null || last !== item.ordered) count += 1;
    last = item.ordered;
  });
  return Math.max(1, count);
}

function flowAlignedMap(source) {
  const { blocks } = flowSplit(source);
  const doc = FLOW.editor.state.doc;
  const nodes = [];
  doc.forEach((node, offset, index) => nodes.push({ node, offset, index, live: flowNodeLines(node).length > 0 }));
  const counts = blocks.map(flowBlockNodes);
  if (counts.reduce((sum, value) => sum + value, 0) !== nodes.filter((item) => item.live).length) return flowSerialize().map;
  const map = [];
  let k = 0;
  let used = 0;
  nodes.forEach(({ node, offset, index, live }) => {
    if (!live) {
      map.push(null);
      return;
    }
    const block = blocks[k];
    map.push({ start: block.start, end: block.end, kind: node.type.name === 'figureBlock' ? node.attrs.kind : node.type.name, uid: node.attrs.uid, index, offset });
    used += 1;
    if (used >= counts[k]) {
      k += 1;
      used = 0;
    }
  });
  return map;
}

function flowRangeFor(entry) {
  return { id: `f${entry.start}`, start: entry.start, end: entry.end, kind: entry.kind, uid: entry.uid };
}

function flowCommit() {
  if (FLOW.pulling) return;
  const { source, map } = flowSerialize();
  FLOW.map = map;
  if (S.panel && S.panel.range && S.panel.range.uid) {
    const entry = map.find((item) => item && item.uid === S.panel.range.uid);
    if (entry) Object.assign(S.panel.range, { start: entry.start, end: entry.end });
    else closePanel();
  }
  if (source === S.source) return;
  S.source = source;
  FLOW.lastSource = source;
  flowRenumber();
  schedule(450);
}

function flowNextUid() {
  FLOW.uid += 1;
  return `b${FLOW.uid}`;
}

function flowLoad() {
  const { header, blocks } = flowSplit(S.source);
  FLOW.header = header;
  FLOW.pulling = true;
  const doc = flowDocFrom(blocks);
  const fresh = FLOW.editor.state.constructor.create({ doc, plugins: FLOW.editor.state.plugins });
  FLOW.editor.view.updateState(fresh);
  FLOW.pageSign = null;
  FLOW.pulling = false;
  FLOW.map = flowAlignedMap(S.source);
  FLOW.lastSource = S.source;
  flowRenumber();
  flowStyle();
}

function flowPull() {
  if (!FLOW.editor || S.source === FLOW.lastSource) return;
  const { header, blocks } = flowSplit(S.source);
  FLOW.header = header;
  const doc = FLOW.editor.state.doc;
  const nodes = [];
  doc.forEach((node, offset) => {
    if (flowNodeLines(node).length) nodes.push({ node, offset });
  });
  const fresh = flowDocFrom(blocks);
  const freshNodes = [];
  fresh.forEach((node) => freshNodes.push(node));
  FLOW.pulling = true;
  if (nodes.length === freshNodes.length) {
    let tr = FLOW.editor.state.tr;
    const replaced = [];
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const { node, offset } = nodes[i];
      const next = freshNodes[i];
      if (node.type.name === 'figureBlock' && next.type.name === 'figureBlock') {
        if (node.attrs.src !== next.attrs.src || node.attrs.kind !== next.attrs.kind) tr = tr.setNodeMarkup(offset, null, { ...node.attrs, src: next.attrs.src, kind: next.attrs.kind });
      } else if (!node.eq(next) && flowNodeLines(node).join('\n') !== flowNodeLines(next).join('\n')) {
        tr = tr.replaceWith(offset, offset + node.nodeSize, next);
        replaced.push({ offset, size: node.nodeSize, next });
      }
    }
    if (tr.docChanged) {
      const remap = (pos) => {
        const hit = replaced.find((item) => pos > item.offset && pos < item.offset + item.size);
        if (!hit) return tr.mapping.map(pos, -1);
        return tr.mapping.map(hit.offset, -1) + Math.min(pos - hit.offset, hit.next.nodeSize - 1);
      };
      if (FLOW.keep) FLOW.keep = { from: remap(FLOW.keep.from), to: remap(FLOW.keep.to) };
      const sel = FLOW.editor.state.selection;
      const caret = sel.empty && replaced.some((item) => sel.from > item.offset && sel.from < item.offset + item.size) ? remap(sel.from) : null;
      if (caret !== null) tr = tr.setSelection(TT.TextSelection.create(tr.doc, Math.max(1, Math.min(caret, tr.doc.content.size - 1))));
      FLOW.editor.view.dispatch(tr);
    }
  } else {
    const keep = FLOW.editor.state.selection.from;
    FLOW.editor.commands.setContent(fresh.toJSON(), { emitUpdate: false });
    const size = FLOW.editor.state.doc.content.size;
    FLOW.editor.commands.setTextSelection(Math.min(keep, Math.max(1, size - 1)));
    if (FLOW.keep) FLOW.keep = { from: FLOW.editor.state.selection.from, to: FLOW.editor.state.selection.to };
  }
  FLOW.pulling = false;
  FLOW.map = flowAlignedMap(S.source);
  FLOW.lastSource = S.source;
  flowRenumber();
}
