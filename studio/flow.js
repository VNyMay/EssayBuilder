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
const FLOW_END = ['references', 'bibliography', 'works cited', 'sources', 'appendix', 'appendices'];
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
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const { node, offset } = nodes[i];
      const next = freshNodes[i];
      if (node.type.name === 'figureBlock' && next.type.name === 'figureBlock') {
        if (node.attrs.src !== next.attrs.src || node.attrs.kind !== next.attrs.kind) tr = tr.setNodeMarkup(offset, null, { ...node.attrs, src: next.attrs.src, kind: next.attrs.kind });
      } else if (!node.eq(next) && flowNodeLines(node).join('\n') !== flowNodeLines(next).join('\n')) {
        tr = tr.replaceWith(offset, offset + node.nodeSize, next);
      }
    }
    if (tr.docChanged) {
      if (FLOW.keep) FLOW.keep = { from: tr.mapping.map(FLOW.keep.from, -1), to: tr.mapping.map(FLOW.keep.to, 1) };
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

const FlowFmt = () => TT.Mark.create({
  name: 'fmt',
  excludes: '',
  addAttributes() {
    return { attrs: { default: '' } };
  },
  parseHTML() {
    return [{ tag: 'span.fmt', getAttrs: (el) => ({ attrs: el.dataset.attrs || '' }) }];
  },
  renderHTML({ mark }) {
    return ['span', { class: 'fmt', 'data-attrs': mark.attrs.attrs, style: fmtStyle(attrList(mark.attrs.attrs)) }, 0];
  },
});

const FlowLink = () => TT.Mark.create({
  name: 'rlink',
  inclusive: false,
  addAttributes() {
    return { url: { default: '' } };
  },
  parseHTML() {
    return [{ tag: 'span.rlink', getAttrs: (el) => ({ url: el.dataset.url || '' }) }, { tag: 'a[href]', getAttrs: (el) => ({ url: el.getAttribute('href') || '' }) }];
  },
  renderHTML({ mark }) {
    return ['span', { class: 'rlink', 'data-url': mark.attrs.url, title: mark.attrs.url }, 0];
  },
});

function flowChipLabel(kind, src, label) {
  if (kind === 'ref') {
    const match = src.match(/^@([a-z]+):(.+)$/);
    return (match && S.labels && S.labels[`${match[1]}:${match[2]}`]) || label;
  }
  if (kind === 'cite') {
    const key = src.replace(/^\[|\]$/g, '');
    return (S.cites && S.cites[key]) || label;
  }
  return label;
}

const FlowChip = () => TT.Node.create({
  name: 'chip',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { kind: { default: 'math' }, src: { default: '' }, label: { default: '' } };
  },
  parseHTML() {
    return [{
      tag: 'span.chip',
      getAttrs: (el) => ({ kind: ['math', 'note', 'cite', 'ref'].find((name) => el.classList.contains(name)) || 'math', src: el.dataset.src || '', label: el.textContent || '' }),
    }];
  },
  renderHTML({ node }) {
    return ['span', { class: `chip ${node.attrs.kind}`, 'data-src': node.attrs.src }, node.attrs.label || node.attrs.src];
  },
  renderText({ node }) {
    if (node.attrs.kind === 'note') return '';
    if (node.attrs.kind === 'math') return node.attrs.src.replace(/^\$+|\$+$/g, '');
    return flowChipLabel(node.attrs.kind, node.attrs.src, node.attrs.label) || node.attrs.src;
  },
  addInputRules() {
    return [new TT.InputRule({
      find: /(?:^|[^\\$\w])\$([^$\s](?:[^$]*[^$\s])?)\$$/,
      handler: ({ state, range, match }) => {
        const body = match[1];
        const end = range.to;
        const full = end - body.length - 2;
        const typed = full >= 0 && state.doc.textBetween(full, end, '￼') === `$${body}$`;
        const start = typed ? full : end - body.length - 1;
        state.tr.replaceWith(start, end, this.type.create({ kind: 'math', src: `$${body}$`, label: body }));
      },
    })];
  },
  addNodeView() {
    return ({ node, getPos }) => {
      const dom = chip(node.attrs.kind, node.attrs.src, flowChipLabel(node.attrs.kind, node.attrs.src, node.attrs.label));
      dom.classList.add('fchip');
      if (node.attrs.kind === 'note') {
        dom.title = node.attrs.src.startsWith('[^') ? 'Footnote' : node.attrs.src.slice(2, -1);
        dom.textContent = '';
        dom.classList.add('fnum');
      }
      dom.addEventListener('mousedown', (event) => {
        event.preventDefault();
        const pos = getPos();
        FLOW.editor.chain().setNodeSelection(pos).run();
        flowChipPop(dom, pos);
      });
      return { dom, ignoreMutation: () => true, stopEvent: (event) => event.type === 'mousedown' };
    };
  },
});

function flowKindLabel(kind) {
  const schema = typeof schemaOf === 'function' ? schemaOf(kind) : null;
  const template = TEMPLATES.find((item) => item.kind === kind || item.id === kind);
  return (schema && schema.label) || (template && template.label) || prettyKey(kind);
}

function flowKindIcon(kind) {
  const template = TEMPLATES.find((item) => item.kind === kind || item.id === kind);
  if (template && template.icon) return template.icon;
  return ICON_SET[kind] ? kind : 'box';
}

function flowCropFor(src) {
  return FLOW.crops.get(src) || null;
}

function flowDrawView(view, node) {
  const kind = node.attrs.kind;
  const src = node.attrs.src;
  view.replaceChildren();
  view.className = 'fb-view';
  if (kind === 'math') {
    const body = src.replace(/^\s*\$\$/, '').replace(/\$\$\s*(\{[^{}]*\})?\s*$/, '').trim();
    const html = mathHtml(body);
    view.classList.add('fb-math');
    view.innerHTML = html || '';
    if (!html) view.textContent = body;
    return;
  }
  if (kind === 'pagebreak' || kind === 'blank') {
    view.classList.add('fb-break');
    view.append(h('span', { text: kind === 'blank' ? 'Blank page' : 'Page break' }));
    return;
  }
  if (kind === 'notedef') {
    const found = src.match(/^\[\^([\w-]+)\]:\s*([\s\S]*)$/);
    view.classList.add('fb-notedef');
    view.append(h('span', { class: 'fb-notedef-mark', text: 'Footnote' }), h('span', { text: found ? found[2].replace(/\s*\n\s*/g, ' ') : src }));
    return;
  }
  if (kind === 'raw' || kind === 'numbering' || kind === 'wc-start' || kind === 'wc-end' || kind === 'spacer') {
    view.classList.add('fb-raw');
    const words = { 'wc-start': 'Word count starts', 'wc-end': 'Word count ends', numbering: 'Page numbering', spacer: 'Space' };
    view.textContent = words[kind] || src;
    return;
  }
  const crop = flowCropFor(src);
  if (crop && !crop.rects.length) {
    view.classList.add('fb-info');
    const lines = flowLines(src).slice(1, -1);
    let summary = '';
    if (kind === 'sources') {
      const keys = lines.filter((line) => /^\s*@[\w:-]+/.test(line));
      const titles = lines.filter((line) => /^\s*title\s*:/i.test(line)).map((line) => line.replace(/^\s*title\s*:\s*/i, ''));
      summary = keys.length ? `${keys.length} ${keys.length === 1 ? 'source' : 'sources'}${titles.length ? ` · ${titles.slice(0, 3).join(' · ')}${titles.length > 3 ? ' …' : ''}` : ''}` : 'No sources yet';
    } else summary = (lines.find((line) => line.trim() && !/^\s*[\w-]+\s*:/.test(line)) || '').trim();
    view.append(h('span', { class: 'fb-info-icon', html: icon(flowKindIcon(kind), 20) }), h('span', { class: 'fb-info-text' }, h('b', { text: flowKindLabel(kind) }), h('span', { text: summary })));
    return;
  }
  if (!crop) {
    view.classList.add('fb-wait');
    view.append(h('span', { class: 'fb-wait-icon', html: icon(flowKindIcon(kind), 22) }), h('span', { text: flowKindLabel(kind) }));
    return;
  }
  const scale = FLOW_L;
  const margin = marginPt();
  crop.rects.forEach((rect) => {
    const page = S.pages[rect.page] || crop.pages[rect.page];
    if (!page) return;
    const piece = h('div', { class: 'fb-crop' });
    const inner = (page.w - 2 * margin) * scale;
    piece.style.width = `${inner}px`;
    piece.style.height = `${Math.max(8, (rect.y1 - rect.y0 + 4) * scale)}px`;
    piece.style.backgroundImage = `url("${page.url}")`;
    piece.style.backgroundSize = `${page.w * scale}px ${page.h * scale}px`;
    piece.style.backgroundPosition = `${-margin * scale}px ${-(rect.y0 - 2) * scale}px`;
    view.append(piece);
  });
  if (crop.stale) view.classList.add('fb-stale');
}

const FlowFigure = () => TT.Node.create({
  name: 'figureBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return { kind: { default: 'figure' }, src: { default: '' }, uid: { default: null, rendered: false } };
  },
  parseHTML() {
    return [{ tag: 'div[data-fb]', getAttrs: (el) => ({ kind: el.dataset.kind || 'figure', src: el.dataset.src || '', uid: flowNextUid() }) }];
  },
  renderHTML({ node }) {
    return ['div', { 'data-fb': '', 'data-kind': node.attrs.kind, 'data-src': node.attrs.src }];
  },
  addNodeView() {
    return ({ node, getPos }) => {
      let current = node;
      const dom = h('div', { class: 'fb', 'data-kind': node.attrs.kind });
      const view = h('div', { class: 'fb-view' });
      const label = h('span', { class: 'fb-name' });
      const bar = h(
        'div',
        { class: 'fb-bar', contenteditable: 'false' },
        h('span', { class: 'fb-grip', 'data-drag-handle': '', html: icon('grip', 15), title: 'Drag to move' }),
        label,
        h('button', { type: 'button', class: 'fb-btn', html: icon('up', 15), title: 'Move up', onmousedown: (event) => flowBtn(event, () => flowMoveNode(getPos(), -1)) }),
        h('button', { type: 'button', class: 'fb-btn', html: icon('down', 15), title: 'Move down', onmousedown: (event) => flowBtn(event, () => flowMoveNode(getPos(), 1)) }),
        h('button', { type: 'button', class: 'fb-btn', html: icon('copy', 15), title: 'Duplicate', onmousedown: (event) => flowBtn(event, () => flowDuplicate(getPos())) }),
        h('button', { type: 'button', class: 'fb-btn danger', html: icon('trash', 15), title: 'Delete', onmousedown: (event) => flowBtn(event, () => flowDelete(getPos())) }),
      );
      dom.append(view, bar);
      if (flowResizable(node.attrs.kind)) {
        ['left', 'right'].forEach((side) => {
          const grip = h('span', { class: `fb-size ${side}`, contenteditable: 'false', title: 'Drag to resize' });
          grip.addEventListener('pointerdown', (event) => flowResizeStart(event, dom, getPos, side));
          dom.append(grip);
        });
      }
      const paint = () => {
        label.replaceChildren(h('span', { html: icon(flowKindIcon(current.attrs.kind), 14) }), h('span', { text: flowKindLabel(current.attrs.kind) }));
        dom.dataset.kind = current.attrs.kind;
        flowDrawView(view, current);
      };
      paint();
      dom.addEventListener('mousedown', (event) => {
        if (event.target.closest('.fb-bar, .sheet, .fb-size')) return;
        event.preventDefault();
        FLOW.openNext = true;
        FLOW.editor.chain().focus().setNodeSelection(getPos()).run();
        if (FLOW.openNext) {
          FLOW.openNext = false;
          flowSelectionChanged(true);
        }
      });
      dom.addEventListener('dblclick', (event) => {
        if (event.target.closest('.fb-bar, .sheet, .fb-size')) return;
        const pos = getPos();
        const node = FLOW.editor.state.doc.nodeAt(pos);
        if (!node) return;
        const lines = flowLines(node.attrs.src);
        const at = lines.findIndex((item) => /^\s*caption\s*:/i.test(item));
        const pipe = node.attrs.kind === 'pipetable' ? lines.findIndex((item) => /^Table:\s*/i.test(item.trim())) : -1;
        if (at < 0 && pipe < 0 && !(schemaOf(node.attrs.kind) && schemaOf(node.attrs.kind).keys && 'caption' in schemaOf(node.attrs.kind).keys)) return;
        event.preventDefault();
        const current = at >= 0 ? lines[at].replace(/^\s*caption\s*:\s*/i, '') : pipe >= 0 ? lines[pipe].trim().replace(/^Table:\s*/i, '').replace(/\s*\{[^{}]*\}\s*$/, '') : '';
        const anchor = { getBoundingClientRect: () => ({ left: event.clientX - 150, right: event.clientX + 150, top: event.clientY, bottom: event.clientY + 8 }) };
        flowInputPop(anchor, {
          value: current,
          placeholder: 'Caption',
          onDone: (text) => {
            const live = FLOW.editor.state.doc.nodeAt(pos);
            if (!live) return;
            const next = flowLines(live.attrs.src);
            const clean = text.trim();
            if (at >= 0) {
              if (clean) next[at] = `caption: ${clean}`;
              else next.splice(at, 1);
            } else if (pipe >= 0) {
              const tail = (next[pipe].match(/\s*(\{[^{}]*\})\s*$/) || ['', ''])[1];
              next[pipe] = `Table: ${clean}${tail ? ` ${tail}` : ''}`;
            } else if (clean) next.splice(1, 0, `caption: ${clean}`);
            const src = next.join('\n');
            const old = FLOW.crops.get(live.attrs.src);
            if (old) FLOW.crops.set(src, { ...old, stale: true });
            FLOW.editor.view.dispatch(FLOW.editor.state.tr.setNodeMarkup(pos, null, { ...live.attrs, src }));
            if (S.panel && S.panel.range && S.panel.range.uid === live.attrs.uid) {
              const entry = FLOW.map.find((item) => item && item.uid === live.attrs.uid);
              if (entry) openPanel(flowRangeFor(entry));
            }
          },
        });
      });
      dom.flowRepaint = paint;
      return {
        dom,
        update(next) {
          if (next.type !== current.type) return false;
          const changed = next.attrs.src !== current.attrs.src || next.attrs.kind !== current.attrs.kind;
          current = next;
          if (changed) paint();
          return true;
        },
        selectNode() {
          dom.classList.add('on');
        },
        deselectNode() {
          dom.classList.remove('on');
        },
        stopEvent: (event) => Boolean(event.target.closest && ((event.target.closest('.fb-bar') && event.type !== 'dragstart') || event.target.closest('.sheet, .fb-size'))),
        ignoreMutation: () => true,
      };
    };
  },
});

function flowResizable(kind) {
  const schema = typeof schemaOf === 'function' ? schemaOf(kind) : null;
  return Boolean(schema && schema.keys && 'width' in schema.keys) && !['table', 'pipetable', 'code'].includes(kind);
}

function flowWidthOf(src) {
  const line = flowLines(src).find((item) => /^\s*width\s*:/i.test(item));
  const value = line ? line.replace(/^\s*width\s*:\s*/i, '').trim().toLowerCase() : '';
  const pct = value.match(/^([\d.]+)\s*%$/);
  if (pct) return Number(pct[1]);
  return { full: 100, large: 86, wide: 100, medium: 70, small: 50, half: 50 }[value] || 86;
}

function flowWithWidth(src, pct) {
  const lines = flowLines(src);
  const value = `width: ${Math.round(pct)}%`;
  const at = lines.findIndex((item) => /^\s*width\s*:/i.test(item));
  if (at >= 0) lines[at] = value;
  else {
    const end = lines.findIndex((item, index) => index > 0 && (item.trim() === '---' || item.trim() === ':::'));
    lines.splice(end > 0 ? end : 1, 0, value);
  }
  return lines.join('\n');
}

function flowResizeStart(event, dom, getPos, side) {
  event.preventDefault();
  event.stopPropagation();
  const pos = getPos();
  const node = FLOW.editor.state.doc.nodeAt(pos);
  if (!node) return;
  const view = dom.querySelector('.fb-view');
  const full = view.getBoundingClientRect().width;
  const start = flowWidthOf(node.attrs.src);
  const x0 = event.clientX;
  const frame = h('div', { class: 'fb-frame' }, h('span', { class: 'fb-badge' }));
  dom.append(frame);
  dom.classList.add('sizing');
  let pct = start;
  const paint = () => {
    frame.style.width = `${((pct / 100) * full) / flowZoom()}px`;
    frame.firstChild.textContent = `${Math.round(pct)}%`;
  };
  paint();
  const move = (moveEvent) => {
    const delta = ((moveEvent.clientX - x0) * (side === 'right' ? 2 : -2)) / full * 100;
    pct = Math.max(15, Math.min(100, Math.round((start + delta) / 5) * 5));
    paint();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    frame.remove();
    dom.classList.remove('sizing');
    if (pct === start) return;
    const current = FLOW.editor.state.doc.nodeAt(pos);
    if (!current) return;
    const src = flowWithWidth(current.attrs.src, pct);
    const old = FLOW.crops.get(current.attrs.src);
    if (old) FLOW.crops.set(src, { ...old, stale: true });
    FLOW.editor.view.dispatch(FLOW.editor.state.tr.setNodeMarkup(pos, null, { ...current.attrs, src }));
    if (S.panel && S.panel.range && S.panel.range.uid === current.attrs.uid) openPanel(flowRangeFor(FLOW.map.find((item) => item && item.uid === current.attrs.uid)));
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function flowBtn(event, run) {
  event.preventDefault();
  event.stopPropagation();
  run();
}

const FlowParagraph = () => TT.Paragraph.extend({
  addAttributes() {
    return {
      opts: {
        default: null,
        parseHTML: (el) => {
          try {
            return el.dataset.opts ? JSON.parse(el.dataset.opts) : null;
          } catch (error) {
            return null;
          }
        },
        renderHTML: (attrs) => (attrs.opts && attrs.opts.length ? { 'data-opts': JSON.stringify(attrs.opts), style: flowOptsStyle(attrs.opts) } : {}),
      },
    };
  },
});

const FlowHeading = () => TT.Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      tail: { default: '', parseHTML: (el) => el.dataset.tail || '', renderHTML: (attrs) => (attrs.tail ? { 'data-tail': attrs.tail } : {}) },
    };
  },
}).configure({ levels: [1, 2, 3] });

const FlowQuote = () => TT.Blockquote.extend({ content: 'paragraph+' });

function flowOptValue(opts, key) {
  const found = (opts || []).find((line) => line.toLowerCase().startsWith(`${key}:`));
  return found ? found.slice(key.length + 1).trim() : '';
}

function flowOptsStyle(opts) {
  const css = [];
  const align = flowOptValue(opts, 'align');
  if (align) css.push(`text-align:${align === 'centre' ? 'center' : align}`);
  const size = flowOptValue(opts, 'size');
  if (/^[\d.]+$/.test(size)) css.push(`font-size:calc(${size} * var(--pt))`);
  const look = flowOptValue(opts, 'style').toLowerCase();
  if (look.includes('bold')) css.push('font-weight:700');
  if (look.includes('italic')) css.push('font-style:italic');
  const font = flowOptValue(opts, 'font');
  if (font) css.push(`font-family:"${font}",var(--doc-font)`);
  const color = flowOptValue(opts, 'color');
  if (color) css.push(`color:${color}`);
  const bg = flowOptValue(opts, 'bg');
  if (bg) css.push(`background:${bg}`);
  const indent = flowOptValue(opts, 'indent');
  if (/^[\d.]+$/.test(indent)) css.push(`padding-left:calc(${indent} * var(--pt))`);
  return css.join(';');
}

const FlowKeys = () => TT.Extension.create({
  name: 'flowKeys',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-l': () => flowAlign('left'),
      'Mod-Shift-e': () => flowAlign('center'),
      'Mod-Shift-r': () => flowAlign('right'),
      'Mod-Shift-j': () => flowAlign('justify'),
      'Mod-Alt-0': () => this.editor.chain().focus().setParagraph().run(),
      'Mod-m': () => {
        flowNewChip('math');
        return true;
      },
      'Mod-k': () => false,
      'Mod-Alt-m': () => {
        flowNoteAdd();
        return true;
      },
      Enter: () => {
        if (flowFigureSelected()) {
          flowSelectionChanged(true);
          return true;
        }
        return flowCalloutExit();
      },
      Backspace: () => flowCalloutUnwrap(),
      'Alt-ArrowUp': () => flowMoveCurrent(-1),
      'Alt-ArrowDown': () => flowMoveCurrent(1),
      'Mod-f': () => {
        flowFindOpen(false);
        return true;
      },
      'Mod-h': () => {
        flowFindOpen(true);
        return true;
      },
    };
  },
});

function flowCalloutExit() {
  const { state } = FLOW.editor;
  const { $from, empty } = state.selection;
  if (!empty || $from.depth < 2) return false;
  const box = $from.node(1);
  if (box.type.name !== 'callout') return false;
  const para = $from.parent;
  if (para.content.size || $from.index(1) !== box.childCount - 1 || box.childCount < 2) return false;
  const start = $from.before(2);
  let tr = state.tr.delete(start, start + para.nodeSize);
  const after = tr.mapping.map($from.after(1));
  tr = tr.insert(after, state.schema.nodes.paragraph.create());
  tr = tr.setSelection(TT.TextSelection.create(tr.doc, after + 1));
  FLOW.editor.view.dispatch(tr.scrollIntoView());
  return true;
}

function flowCalloutUnwrap() {
  const { state } = FLOW.editor;
  const { $from, empty } = state.selection;
  if (!empty || $from.depth < 2 || $from.parentOffset) return false;
  const box = $from.node(1);
  if (box.type.name !== 'callout' || $from.index(1) !== 0) return false;
  if (box.textContent.trim()) return false;
  const start = $from.before(1);
  const tr = state.tr.replaceWith(start, start + box.nodeSize, state.schema.nodes.paragraph.create());
  FLOW.editor.view.dispatch(tr.setSelection(TT.TextSelection.create(tr.doc, start + 1)));
  return true;
}

const FLOW_NOTES_KEY = new TT.PluginKey('flowNotes');

function flowNotesKey() {
  return `studio.notes.${S.name || 'essay'}`;
}

function flowNotesLoad() {
  try {
    FLOW.notes = JSON.parse(localStorage.getItem(flowNotesKey()) || '[]');
  } catch (error) {
    FLOW.notes = [];
  }
}

function flowNotesSave() {
  localStorage.setItem(flowNotesKey(), JSON.stringify(FLOW.notes || []));
}

function flowTextIndex(doc) {
  let text = '';
  const at = [];
  doc.descendants((node, pos) => {
    if (node.isText) {
      for (let i = 0; i < node.text.length; i += 1) at.push(pos + i);
      text += node.text;
    } else if (node.isBlock && text && !text.endsWith('\n')) {
      at.push(pos);
      text += '\n';
    }
    return true;
  });
  return { text, at };
}

function flowNoteRanges(doc) {
  const out = [];
  if (!FLOW.notes || !FLOW.notes.length) return out;
  const { text, at } = flowTextIndex(doc);
  FLOW.notes.forEach((note) => {
    if (!note.quote) return;
    let best = -1;
    let bestScore = -1;
    let index = text.indexOf(note.quote);
    while (index >= 0) {
      const before = text.slice(Math.max(0, index - 24), index);
      const after = text.slice(index + note.quote.length, index + note.quote.length + 24);
      let score = 0;
      if (note.prefix && before.endsWith(note.prefix.slice(-12))) score += 2;
      if (note.suffix && after.startsWith(note.suffix.slice(0, 12))) score += 2;
      if (score > bestScore) {
        best = index;
        bestScore = score;
      }
      index = text.indexOf(note.quote, index + 1);
    }
    if (best < 0) return;
    const from = at[best];
    const to = at[best + note.quote.length - 1] + 1;
    if (from != null && to > from) out.push({ id: note.id, from, to });
  });
  return out;
}

const FlowNotes = () => TT.Extension.create({
  name: 'flowNotes',
  addProseMirrorPlugins() {
    return [new TT.Plugin({
      key: FLOW_NOTES_KEY,
      state: {
        init: () => TT.DecorationSet.empty,
        apply: (tr, old, _, state) => {
          if (!tr.docChanged && !tr.getMeta(FLOW_NOTES_KEY)) return old;
          return TT.DecorationSet.create(state.doc, flowNoteRanges(state.doc).map((range) => TT.Decoration.inline(range.from, range.to, { class: `note-mark${FLOW.noteOn === range.id ? ' on' : ''}`, 'data-note': range.id })));
        },
      },
      props: {
        decorations(state) {
          return FLOW_NOTES_KEY.getState(state);
        },
        handleClick(view, pos, event) {
          const mark = event.target.closest && event.target.closest('.note-mark');
          if (!mark) return false;
          flowNoteFocus(mark.dataset.note);
          return false;
        },
      },
    })];
  },
});

function flowNotesRefresh() {
  if (!FLOW.editor) return;
  FLOW.editor.view.dispatch(FLOW.editor.state.tr.setMeta(FLOW_NOTES_KEY, true).setMeta('addToHistory', false));
  requestAnimationFrame(flowNotesPlace);
}

function flowNoteAdd() {
  const { state } = FLOW.editor;
  const { from, to, empty } = state.selection;
  if (empty) {
    toast('Select some text first');
    return;
  }
  const { text, at } = flowTextIndex(state.doc);
  const start = at.findIndex((pos) => pos >= from);
  let end = at.findIndex((pos) => pos >= to);
  if (end < 0) end = text.length;
  const quote = text.slice(start, end);
  if (!quote.trim()) return;
  const note = { id: `n${Date.now().toString(36)}`, quote, prefix: text.slice(Math.max(0, start - 24), start), suffix: text.slice(end, end + 24), text: '', made: Date.now() };
  FLOW.notes = [...(FLOW.notes || []), note];
  flowNotesSave();
  flowNotesRefresh();
  setTimeout(() => flowNoteFocus(note.id, true), 30);
}

function flowNoteFocus(id, edit = false) {
  FLOW.noteOn = id;
  flowNotesRefresh();
  setTimeout(() => {
    const card = FLOW.root.querySelector(`.note-card[data-id="${id}"]`);
    if (!card) return;
    if (edit) {
      const area = card.querySelector('textarea');
      if (area) area.focus();
    }
  }, 40);
}

function flowNotesPlace() {
  if (!FLOW.root || !FLOW.sheet) return;
  let rail = FLOW.sheet.querySelector('.note-rail');
  if (!rail) {
    rail = h('div', { class: 'note-rail', contenteditable: 'false' });
    FLOW.sheet.append(rail);
  }
  const notes = FLOW.notes || [];
  FLOW.sheet.classList.toggle('has-notes', notes.length > 0);
  if (Boolean(notes.length) !== Boolean(FLOW.hadNotes) && FLOW.sideChanged) FLOW.sideChanged();
  FLOW.hadNotes = notes.length > 0;
  if (!notes.length) {
    rail.replaceChildren();
    return;
  }
  const sheetTop = FLOW.sheet.getBoundingClientRect().top;
  const placed = [];
  const lost = [];
  notes.forEach((note) => {
    const mark = FLOW.root.querySelector(`.note-mark[data-note="${note.id}"]`);
    if (mark) placed.push({ note, y: (mark.getBoundingClientRect().top - sheetTop) / flowZoom() });
    else lost.push(note);
  });
  placed.sort((a, b) => a.y - b.y);
  const cards = [];
  let floor = 0;
  placed.forEach(({ note, y }) => {
    const card = flowNoteCard(note, false);
    const top = Math.max(y - 6, floor);
    card.style.top = `${top}px`;
    cards.push(card);
    floor = top + (note.id === FLOW.noteOn ? 150 : 74);
  });
  lost.forEach((note) => {
    const card = flowNoteCard(note, true);
    card.style.top = `${floor}px`;
    floor += 74;
    cards.push(card);
  });
  rail.replaceChildren(...cards);
}

function flowNoteCard(note, lost) {
  const on = note.id === FLOW.noteOn;
  const card = h('div', { class: `note-card${on ? ' on' : ''}${lost ? ' lost' : ''}`, 'data-id': note.id });
  const area = h('textarea', { rows: on ? 3 : 1, placeholder: 'Note', spellcheck: 'true' });
  area.value = note.text;
  area.addEventListener('input', () => {
    note.text = area.value;
    flowNotesSave();
  });
  area.addEventListener('focus', () => {
    if (FLOW.noteOn !== note.id) {
      FLOW.noteOn = note.id;
      FLOW.editor.view.dispatch(FLOW.editor.state.tr.setMeta(FLOW_NOTES_KEY, true).setMeta('addToHistory', false));
      card.classList.add('on');
    }
  });
  area.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
      event.preventDefault();
      FLOW.noteOn = null;
      flowNotesRefresh();
      FLOW.editor.commands.focus();
    }
  });
  const done = h('button', { type: 'button', class: 'note-done', html: icon('check', 14), title: 'Resolve' });
  done.addEventListener('mousedown', (event) => {
    event.preventDefault();
    FLOW.notes = FLOW.notes.filter((item) => item.id !== note.id);
    flowNotesSave();
    FLOW.noteOn = null;
    flowNotesRefresh();
  });
  const quote = h('div', { class: 'note-quote', text: lost ? `Text changed: “${note.quote.slice(0, 60)}”` : note.quote.slice(0, 80) });
  card.append(h('div', { class: 'note-top' }, quote, done), area);
  card.addEventListener('mousedown', (event) => {
    if (event.target.closest('textarea, button')) return;
    event.preventDefault();
    const range = flowNoteRanges(FLOW.editor.state.doc).find((item) => item.id === note.id);
    if (range) FLOW.editor.chain().setTextSelection(range).focus().run();
    flowNoteFocus(note.id);
  });
  return card;
}

const FLOW_FIND_KEY = new TT.PluginKey('flowFind');
const FLOW_NUM_KEY = new TT.PluginKey('flowNum');

function flowFindMatches(doc, term, caseSensitive) {
  const out = [];
  if (!term) return out;
  const needle = caseSensitive ? term : term.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = '';
    const at = [];
    node.forEach((child, offset) => {
      if (child.isText) {
        for (let i = 0; i < child.text.length; i += 1) at.push(pos + 1 + offset + i);
        text += child.text;
      } else {
        at.push(pos + 1 + offset);
        text += '￼';
      }
    });
    const hay = caseSensitive ? text : text.toLowerCase();
    let index = hay.indexOf(needle);
    while (index >= 0) {
      out.push({ from: at[index], to: at[index + needle.length - 1] + 1 });
      index = hay.indexOf(needle, index + Math.max(1, needle.length));
    }
    return false;
  });
  return out;
}

const FlowFind = () => TT.Extension.create({
  name: 'flowFind',
  addProseMirrorPlugins() {
    return [new TT.Plugin({
      key: FLOW_FIND_KEY,
      state: {
        init: () => ({ term: '', cs: false, index: 0, matches: [], deco: TT.DecorationSet.empty }),
        apply(tr, old, _, state) {
          const meta = tr.getMeta(FLOW_FIND_KEY);
          if (!meta && !tr.docChanged) return old;
          const next = { ...old, ...(meta || {}) };
          next.matches = flowFindMatches(state.doc, next.term, next.cs);
          if (next.index >= next.matches.length) next.index = 0;
          next.deco = TT.DecorationSet.create(state.doc, next.matches.map((match, i) => TT.Decoration.inline(match.from, match.to, { class: i === next.index ? 'find-hit now' : 'find-hit' })));
          return next;
        },
      },
      props: {
        decorations(state) {
          return FLOW_FIND_KEY.getState(state).deco;
        },
      },
    })];
  },
});

const FLOW_PAGES_KEY = new TT.PluginKey('flowPages');

const FlowPages = () => TT.Extension.create({
  name: 'flowPages',
  addProseMirrorPlugins() {
    return [new TT.Plugin({
      key: FLOW_PAGES_KEY,
      state: {
        init: () => TT.DecorationSet.empty,
        apply: (tr, old) => tr.getMeta(FLOW_PAGES_KEY) || old.map(tr.mapping, tr.doc),
      },
      props: {
        decorations(state) {
          return FLOW_PAGES_KEY.getState(state);
        },
      },
    })];
  },
});

const FlowFocus = () => TT.Extension.create({
  name: 'flowFocus',
  addProseMirrorPlugins() {
    return [new TT.Plugin({
      props: {
        decorations(state) {
          if (!document.documentElement.classList.contains('focus-mode')) return null;
          const { $from } = state.selection;
          if (!$from.depth) return null;
          const start = $from.before(1);
          return TT.DecorationSet.create(state.doc, [TT.Decoration.node(start, start + $from.node(1).nodeSize, { class: 'focus-now' })]);
        },
      },
    })];
  },
});

function flowHeadingNumbers(doc) {
  const set = S.settings || {};
  const on = !/^(no|off|false)$/i.test(String(set['heading-numbers'] || 'yes'));
  const out = [];
  let h1 = 0;
  let h2 = 0;
  let numbered = false;
  doc.forEach((node, offset) => {
    if (node.type.name !== 'heading' || node.attrs.level === 3) return;
    const title = node.textContent.trim().toLowerCase();
    const flags = node.attrs.tail || '';
    const skip = /nonumber|unnumbered/.test(flags);
    if (node.attrs.level === 1) {
      const end = FLOW_END.some((word) => title.startsWith(word));
      numbered = on && !end && !FLOW_FRONT.has(title) && !skip;
      if (numbered) {
        h1 += 1;
        h2 = 0;
        out.push({ pos: offset + 1, text: String(h1) });
      }
    } else if (numbered && !skip) {
      h2 += 1;
      out.push({ pos: offset + 1, text: `${h1}.${h2}` });
    }
  });
  return out;
}

const FlowNumbers = () => TT.Extension.create({
  name: 'flowNumbers',
  addProseMirrorPlugins() {
    return [new TT.Plugin({
      key: FLOW_NUM_KEY,
      state: {
        init: (_, state) => flowNumberDeco(state.doc),
        apply: (tr, old, _, state) => (tr.docChanged || tr.getMeta(FLOW_NUM_KEY) ? flowNumberDeco(state.doc) : old),
      },
      props: {
        decorations(state) {
          return FLOW_NUM_KEY.getState(state);
        },
      },
    })];
  },
});

function flowNumberDeco(doc) {
  return TT.DecorationSet.create(doc, flowHeadingNumbers(doc).map((item) => TT.Decoration.widget(item.pos, () => {
    const span = document.createElement('span');
    span.className = 'hnum';
    span.contentEditable = 'false';
    span.textContent = item.text;
    return span;
  }, { side: -1, key: `n${item.text}` })));
}

function flowRenumber() {
  if (!FLOW.editor) return;
  FLOW.editor.view.dispatch(FLOW.editor.state.tr.setMeta(FLOW_NUM_KEY, true).setMeta('addToHistory', false));
}

function flowExtensions() {
  return [
    TT.StarterKit.configure({
      heading: false,
      paragraph: false,
      blockquote: false,
      codeBlock: false,
      horizontalRule: false,
      link: false,
      trailingNode: false,
      dropcursor: { color: 'var(--flow-accent, #1f7a3d)', width: 3 },
    }),
    FlowParagraph(),
    FlowHeading(),
    FlowQuote(),
    TT.Superscript,
    TT.Subscript,
    FlowFmt(),
    FlowLink(),
    FlowChip(),
    FlowChipText(),
    FlowFigure(),
    FlowCallout(),
    FlowKeys(),
    FlowFind(),
    FlowNumbers(),
    FlowFocus(),
    FlowNotes(),
    FlowPages(),
    TT.Placeholder.configure({
      placeholder: ({ node, editor }) => {
        if (node.type.name === 'heading') return 'Heading';
        if (editor.state.doc.childCount === 1) return 'Start writing, or type / to insert';
        return 'Type / to insert';
      },
      showOnlyCurrent: true,
    }),
  ];
}

function flowMount() {
  if (FLOW.root) return;
  FLOW.root = h('div', { id: 'flow', hidden: true });
  FLOW.front = h('div', { class: 'flow-front' });
  FLOW.sheet = h('div', { class: 'flow-sheet' });
  FLOW.marks = h('div', { class: 'flow-marks' });
  const host = h('div', { class: 'flow-host' });
  FLOW.sheet.append(FLOW.marks, host);
  FLOW.zoomer = h('div', { class: 'flow-zoomer' }, FLOW.front, FLOW.sheet);
  FLOW.zoomBox = h('div', { class: 'flow-zoom' }, FLOW.zoomer);
  FLOW.root.append(FLOW.zoomBox);
  new ResizeObserver(() => flowZoomBox()).observe(FLOW.zoomer);
  $('#scroll').append(FLOW.root);
  FLOW.editor = new TT.Editor({
    element: host,
    extensions: flowExtensions(),
    content: '<p></p>',
    editorProps: {
      attributes: { spellcheck: 'true', lang: 'en', class: 'flow-doc' },
      handleKeyDown: (view, event) => flowSlashKey(event),
      handlePaste: (view, event) => flowPasteFiles(event),
      transformPastedHTML: (html) => flowWordLists(html)
        .replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (whole, attrs, inner) => `<a${attrs}>${inner.replace(/text-decoration(-line)?\s*:\s*underline\s*;?/gi, '').replace(/<\/?u>/gi, '')}</a>`)
        .replace(/color\s*:\s*(#1155cc|rgb\(17,\s*85,\s*204\)|#0563c1)\s*;?/gi, ''),
      handleDrop: (view, event) => flowDropFiles(view, event),
    },
    onUpdate: () => {
      flowCommit();
      flowSlashCheck();
      flowFindCount();
      if (FLOW.outlineSoon) FLOW.outlineSoon();
      if (FLOW.notes && FLOW.notes.length) requestAnimationFrame(flowNotesPlace);
      if (!FLOW.fitQueued) {
        FLOW.fitQueued = true;
        requestAnimationFrame(() => {
          FLOW.fitQueued = false;
          flowFitPages();
        });
      }
    },
    onSelectionUpdate: () => {
      flowSelectionChanged();
      flowSlashCheck();
      flowFocusPaint();
    },
  });
  FLOW.bar = flowToolbar();
  document.body.append(FLOW.bar);
  flowHandleMount();
  ['keydown', 'copy', 'cut', 'paste'].forEach((name) => FLOW.root.addEventListener(name, (event) => {
    if (name === 'keydown' && event.key === 'Escape') {
      if (FLOW.slash) flowSlashClose();
      else if (FLOW.pop) flowPopClose();
      else if (S.panel) closePanel();
    }
    event.stopPropagation();
  }));
  FLOW.root.addEventListener('mousedown', (event) => {
    if (event.target === FLOW.root || event.target === FLOW.sheet) {
      event.preventDefault();
      const rect = FLOW.sheet.getBoundingClientRect();
      if (event.clientY > rect.bottom - 40 || event.target === FLOW.root) FLOW.editor.chain().focus('end').run();
    }
  });
}

function flowSelectedWords() {
  if (!FLOW.on || !FLOW.editor) return 0;
  const { from, to, empty } = FLOW.editor.state.selection;
  if (empty) return 0;
  const text = FLOW.editor.state.doc.textBetween(from, to, ' ', ' ');
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
}

const FlowChipText = () => TT.Extension.create({
  name: 'flowChipText',
  extendNodeSchema(extension) {
    if (extension.name !== 'chip') return {};
    return {
      leafText: (node) => {
        if (node.attrs.kind === 'note') return '';
        if (node.attrs.kind === 'math') return node.attrs.src.replace(/^\$+|\$+$/g, '');
        return flowChipLabel(node.attrs.kind, node.attrs.src, node.attrs.label) || node.attrs.src;
      },
    };
  },
});

function flowFigureSelected() {
  const sel = FLOW.editor.state.selection;
  return sel instanceof TT.NodeSelection && sel.node.type.name === 'figureBlock';
}

function flowHandleMount() {
  if (FLOW.handle) return;
  const plus = h('button', { type: 'button', class: 'fh-btn', html: icon('plus', 16), title: 'Add below' });
  const grip = h('button', { type: 'button', class: 'fh-btn fh-grip', html: icon('grip', 16), title: 'Drag to move, click for options', draggable: 'true' });
  FLOW.handle = h('div', { class: 'flow-handle', contenteditable: 'false' }, plus, grip);
  FLOW.sheet.append(FLOW.handle);
  plus.addEventListener('mousedown', (event) => {
    event.preventDefault();
    const pos = FLOW.handlePos;
    const node = pos == null ? null : FLOW.editor.state.doc.nodeAt(pos);
    if (!node) return;
    const after = pos + node.nodeSize;
    const empty = node.type.name === 'paragraph' && !node.content.size;
    let tr = FLOW.editor.state.tr;
    let at = pos + 1;
    if (!empty) {
      tr = tr.insert(after, FLOW.editor.schema.nodes.paragraph.create());
      at = after + 1;
    }
    tr = tr.insertText('/', at);
    tr = tr.setSelection(TT.TextSelection.create(tr.doc, at + 1));
    FLOW.editor.view.dispatch(tr);
    FLOW.editor.commands.focus();
    flowSlashCheck();
  });
  grip.addEventListener('dragstart', (event) => {
    const pos = FLOW.handlePos;
    if (pos == null) return;
    const view = FLOW.editor.view;
    const sel = TT.NodeSelection.create(view.state.doc, pos);
    view.dispatch(view.state.tr.setSelection(sel));
    const slice = sel.content();
    view.dragging = { slice, move: true };
    const dom = view.nodeDOM(pos);
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData('text/plain', view.state.doc.textBetween(pos, pos + sel.node.nodeSize, '\n'));
    if (dom) event.dataTransfer.setDragImage(dom, 0, 0);
  });
  grip.addEventListener('click', (event) => {
    event.preventDefault();
    const pos = FLOW.handlePos;
    if (pos == null) return;
    const node = FLOW.editor.state.doc.nodeAt(pos);
    if (!node) return;
    const textLike = ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList'].includes(node.type.name);
    const into = (value) => () => {
      FLOW.editor.chain().setTextSelection(pos + 1).run();
      if (value === 'bullet') FLOW.editor.chain().focus().toggleBulletList().run();
      else if (value === 'ordered') FLOW.editor.chain().focus().toggleOrderedList().run();
      else flowSetBlock(value);
    };
    const items = [];
    if (textLike) {
      items.push(
        { label: 'Text', run: into('p') },
        { label: 'Heading', cls: 'st-h1', run: into('h1') },
        { label: 'Sub-heading', cls: 'st-h2', run: into('h2') },
        { label: 'Sub-sub-heading', cls: 'st-h3', run: into('h3') },
        { label: 'Bullet list', run: into('bullet') },
        { label: 'Numbered list', run: into('ordered') },
        { label: 'Quote', cls: 'st-quote', run: into('quote') },
      );
    }
    if (node.type.name === 'heading') {
      const tail = node.attrs.tail || '';
      const has = (flag) => new RegExp(`(^|[\\s{])${flag}(?=[\\s}])`).test(tail);
      const toggle = (flag, on) => () => {
        const inner = tail.replace(/^\{|\}$/g, '').split(/\s+/).filter((part) => part && part !== flag && !(flag === 'nonumber' && part === 'unnumbered'));
        if (on) inner.push(flag);
        const next = inner.length ? `{${inner.join(' ')}}` : '';
        FLOW.editor.view.dispatch(FLOW.editor.state.tr.setNodeMarkup(pos, null, { ...node.attrs, tail: next }));
      };
      const numbered = !has('nonumber') && !has('unnumbered');
      const listed = !has('notoc');
      items.push(
        { label: `${numbered ? '✓ ' : ''}Numbered`, cls: 'sep-top', run: toggle('nonumber', numbered) },
        { label: `${listed ? '✓ ' : ''}In contents`, run: toggle('notoc', listed) },
      );
      if (node.attrs.level === 1 && !/^(no|off|false)$/i.test(String((S.settings || {})['section-breaks'] || 'yes'))) {
        const ownPage = !has('samepage') && !has('nobreak');
        items.push({ label: `${ownPage ? '✓ ' : ''}Starts a new page`, run: toggle('samepage', ownPage) });
      }
    }
    items.push(
      { label: 'Move up', cls: 'sep-top', run: () => flowMoveNode(pos, -1) },
      { label: 'Move down', run: () => flowMoveNode(pos, 1) },
      { label: 'Duplicate', run: () => flowDuplicate(pos) },
      { label: 'Delete', cls: 'danger', run: () => flowDelete(pos) },
    );
    flowMenu(grip, items);
  });
  FLOW.sheet.addEventListener('mousemove', (event) => {
    if (event.target.closest('.flow-handle, .note-rail')) return;
    const doc = FLOW.editor.view.dom;
    const rect = doc.getBoundingClientRect();
    const spot = FLOW.editor.view.posAtCoords({ left: Math.max(rect.left + 4, Math.min(event.clientX, rect.right - 4)), top: event.clientY });
    if (!spot) return;
    const $pos = FLOW.editor.state.doc.resolve(spot.inside >= 0 ? spot.inside : spot.pos);
    const pos = $pos.depth ? $pos.before(1) : spot.inside >= 0 ? spot.inside : null;
    if (pos == null) return;
    const node = FLOW.editor.state.doc.nodeAt(pos);
    const dom = FLOW.editor.view.nodeDOM(pos);
    if (!node || !dom || !dom.getBoundingClientRect) return;
    FLOW.handlePos = pos;
    const box = dom.getBoundingClientRect();
    const sheet = FLOW.sheet.getBoundingClientRect();
    const zoom = flowZoom();
    const line = node.type.name === 'figureBlock' ? 18 : Math.min(box.height / zoom, parseFloat(getComputedStyle(dom).lineHeight) || 24);
    FLOW.handle.style.top = `${(box.top - sheet.top) / zoom + line / 2 - 13}px`;
    FLOW.handle.style.left = `${(box.left - sheet.left) / zoom - 58}px`;
    FLOW.handle.classList.add('on');
  });
  FLOW.sheet.addEventListener('mouseleave', () => FLOW.handle.classList.remove('on'));
}

function flowSelectionChanged(force = false) {
  const sel = FLOW.editor.state.selection;
  flowPaintBar();
  const picked = flowSelectedWords();
  if (picked || FLOW.pickedWords) {
    FLOW.pickedWords = picked;
    updatePill();
  }
  if (sel instanceof TT.NodeSelection && sel.node.type.name === 'figureBlock') {
    let entry = FLOW.map.find((item) => item && item.uid === sel.node.attrs.uid);
    if (!entry) {
      flowCommit();
      entry = FLOW.map.find((item) => item && item.uid === sel.node.attrs.uid);
    }
    const wanted = force === true || FLOW.openNext;
    FLOW.openNext = false;
    if (!wanted && !(S.panel && S.panel.range && S.panel.range.uid)) return;
    if (entry && (!S.panel || S.panel.range.uid !== entry.uid)) {
      S.sel = null;
      openPanel(flowRangeFor(entry));
    }
    return;
  }
  if (S.panel && S.panel.range && S.panel.range.uid) closePanel();
}

function flowDomFor(uid) {
  if (!uid || !FLOW.editor) return null;
  let found = null;
  FLOW.editor.state.doc.forEach((node, offset) => {
    if (!found && node.attrs && node.attrs.uid === uid) found = FLOW.editor.view.nodeDOM(offset);
  });
  return found;
}

function flowMoveNode(pos, direction) {
  const { state } = FLOW.editor;
  const node = state.doc.nodeAt(pos);
  if (!node) return false;
  const $pos = state.doc.resolve(pos);
  const index = $pos.index(0);
  const target = index + direction;
  if (target < 0 || target >= state.doc.childCount) return false;
  const other = state.doc.child(target);
  let tr = state.tr.delete(pos, pos + node.nodeSize);
  const insertAt = direction < 0 ? pos - other.nodeSize : pos + other.nodeSize;
  tr = tr.insert(insertAt, node);
  if (node.type.name === 'figureBlock') tr = tr.setSelection(TT.NodeSelection.create(tr.doc, insertAt));
  else tr = tr.setSelection(TT.TextSelection.near(tr.doc.resolve(insertAt + 1)));
  FLOW.editor.view.dispatch(tr.scrollIntoView());
  return true;
}

function flowMoveCurrent(direction) {
  const { state } = FLOW.editor;
  const $from = state.selection.$from;
  const pos = state.selection instanceof TT.NodeSelection && $from.depth === 0 ? state.selection.from : $from.before(1);
  return flowMoveNode(pos, direction);
}

function flowDuplicate(pos) {
  const node = FLOW.editor.state.doc.nodeAt(pos);
  if (!node) return;
  const copy = node.type.create({ ...node.attrs, uid: flowNextUid() }, node.content, node.marks);
  const at = pos + node.nodeSize;
  const tr = FLOW.editor.state.tr.insert(at, copy);
  FLOW.editor.view.dispatch(tr.setSelection(TT.NodeSelection.create(tr.doc, at)).scrollIntoView());
}

function flowDelete(pos) {
  const node = FLOW.editor.state.doc.nodeAt(pos);
  if (!node) return;
  closePanel();
  FLOW.editor.view.dispatch(FLOW.editor.state.tr.delete(pos, pos + node.nodeSize));
  FLOW.editor.commands.focus();
  toast('Deleted. Ctrl+Z to undo');
}

function flowWithId(lines) {
  const head = (lines[0] || '').trim().match(FLOW_DIRECTIVE);
  if (!head) return lines;
  const name = head[1].toLowerCase();
  const schema = typeof schemaOf === 'function' ? schemaOf(name) : null;
  if (!schema || !schema.keys || !('id' in schema.keys)) return lines;
  const end = lines.findIndex((line, index) => index > 0 && (line.trim() === '---' || line.trim() === ':::'));
  const options = lines.slice(1, end > 0 ? end : lines.length);
  if (options.some((line) => /^\s*id\s*:/i.test(line))) return lines;
  const used = new Set(Object.keys(S.labels || {}).map((key) => key.split(':')[1]));
  const words = (options.find((line) => /^\s*caption\s*:/i.test(line)) || '').replace(/^\s*caption\s*:\s*/i, '').toLowerCase().match(/[a-z0-9]+/g) || [];
  const stop = new Set(['figure', 'caption', 'table', 'chart', 'the', 'a', 'of', 'and', 'in', 'to']);
  let base = words.filter((word) => !stop.has(word)).slice(0, 2).join('-') || name;
  if (!/^[a-z]/.test(base)) base = `${name}-${base}`;
  let ident = base;
  let n = 2;
  while (used.has(ident) || new RegExp(`^\\s*id\\s*:\\s*${ident}\\s*$`, 'm').test(S.source)) {
    ident = `${base}-${n}`;
    n += 1;
  }
  return [lines[0], `id: ${ident}`, ...lines.slice(1)];
}

function flowInsertBlocks(lines, kind) {
  const blocks = flowBlocks(flowWithId(lines), 0);
  if (!blocks.length) return;
  const doc = flowDocFrom(blocks);
  const nodes = [];
  doc.forEach((node) => nodes.push(node.type.name === 'figureBlock' ? node.type.create({ ...node.attrs, uid: flowNextUid() }) : node));
  const { state } = FLOW.editor;
  const $from = state.selection.$from;
  let at;
  let replace = null;
  if (state.selection instanceof TT.NodeSelection && $from.depth === 0) at = state.selection.to;
  else {
    const top = $from.node(1);
    const start = $from.before(1);
    if (top && top.type.name === 'paragraph' && !top.textContent.trim() && !top.childCount) replace = { from: start, to: start + top.nodeSize };
    at = start + (top ? top.nodeSize : 0);
  }
  let tr = state.tr;
  if (replace) {
    tr = tr.replaceWith(replace.from, replace.to, nodes);
    at = replace.from;
  } else tr = tr.insert(at, nodes);
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const after = at + nodes.reduce((sum, node) => sum + node.nodeSize, 0);
  if (last.type.name === 'figureBlock' && after >= tr.doc.content.size) tr = tr.insert(after, state.schema.nodes.paragraph.create());
  if (first.type.name === 'figureBlock') {
    tr = tr.setSelection(TT.NodeSelection.create(tr.doc, at));
    FLOW.openNext = !['pagebreak', 'blank', 'spacer', 'contents', 'list-of-figures', 'list-of-tables', 'wc-start', 'wc-end'].includes(first.attrs.kind);
  } else {
    const textEnd = at + first.nodeSize - 1;
    tr = tr.setSelection(TT.TextSelection.create(tr.doc, at + 1, Math.max(at + 1, textEnd)));
  }
  FLOW.editor.view.dispatch(tr.scrollIntoView());
  FLOW.editor.commands.focus();
  flowGlow(at);
}

function flowGlow(pos) {
  requestAnimationFrame(() => {
    const dom = FLOW.editor.view.nodeDOM(pos);
    if (!dom || !dom.classList) return;
    dom.classList.add('flow-new');
    setTimeout(() => dom.classList.remove('flow-new'), 1200);
  });
}

async function flowInsertTemplate(template) {
  conceal($('#palette'));
  flowSlashClose(true);
  if (template.upload) {
    const file = await pickFile('image/*');
    if (!file) return;
    const path = await upload(file);
    if (path) flowInsertBlocks([':::figure', `src: ${path}`, 'caption: Figure caption.', 'width: 70%', ':::'], 'figure');
    return;
  }
  if (template.kind === 'bibliography') {
    const title = citationTitle(headerValue('citations') || S.settings.citations);
    flowInsertBlocks([`# ${title} {nonumber}`, '', ...template.lines], 'heading');
    return;
  }
  const lines = template.lines.slice();
  if (template.kind === 'heading' || template.kind === 'para' || template.kind === 'list' || template.kind === 'quote') {
    flowInsertText(template.kind, lines);
    return;
  }
  flowInsertBlocks(lines, template.kind);
}

function flowInsertText(kind, lines) {
  const chain = FLOW.editor.chain().focus();
  const level = (lines[0] || '').match(/^(#{1,3})\s/);
  const { state } = FLOW.editor;
  const $from = state.selection.$from;
  const top = $from.depth ? $from.node(1) : null;
  const empty = top && top.type.name === 'paragraph' && !top.textContent.trim();
  if (!empty) {
    const end = $from.depth ? $from.after(1) : state.selection.to;
    chain.insertContentAt(end, { type: 'paragraph' }).setTextSelection(end + 1);
  }
  if (kind === 'heading' && level) chain.setNode('heading', { level: level[1].length });
  else if (kind === 'list') chain.toggleBulletList();
  else if (kind === 'quote') chain.toggleBlockquote();
  chain.run();
}

function flowWordLists(html) {
  if (!/mso-list|MsoListParagraph/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html.replace(/<!\[if !supportLists\]>|<!\[endif\]>/gi, ''), 'text/html');
  let stack = [];
  [...doc.body.querySelectorAll('p')].forEach((p) => {
    const style = p.getAttribute('style') || '';
    const item = /MsoListParagraph/i.test(p.className || '') || /mso-list:\s*l\d+\s+level\d+/i.test(style);
    if (!item) {
      stack = [];
      return;
    }
    const level = Math.max(1, Number((style.match(/level(\d+)/i) || [0, 1])[1]));
    const marker = [...p.querySelectorAll('span')].find((span) => /mso-list:\s*ignore/i.test(span.getAttribute('style') || ''));
    const mark = marker ? marker.textContent.replace(/\s+/g, ' ').trim() : '';
    if (marker) marker.remove();
    const ordered = /^[(\[]?([0-9]+|[ivxlcdm]+|[a-z])[.)\]]$/i.test(mark);
    const li = doc.createElement('li');
    const inner = doc.createElement('p');
    inner.append(...p.childNodes);
    li.append(inner);
    while (stack.length > level) stack.pop();
    let top = stack[stack.length - 1];
    if (stack.length === level && top && top.tagName !== (ordered ? 'OL' : 'UL')) {
      stack.pop();
      top = stack[stack.length - 1];
    }
    if (stack.length < level) {
      const list = doc.createElement(ordered ? 'ol' : 'ul');
      if (top && top.lastElementChild) top.lastElementChild.append(list);
      else p.before(list);
      stack.push(list);
      while (stack.length < level) {
        const deeper = doc.createElement(ordered ? 'ol' : 'ul');
        list.append(deeper);
        stack.push(deeper);
      }
      top = stack[stack.length - 1];
    }
    top.append(li);
    p.remove();
  });
  return doc.body.innerHTML;
}

function flowPasteFiles(event) {
  const files = [...((event.clipboardData && event.clipboardData.files) || [])].filter((file) => file.type.startsWith('image/'));
  if (!files.length) return false;
  event.preventDefault();
  files.forEach(async (file) => {
    const path = await upload(file);
    if (path) flowInsertBlocks([':::figure', `src: ${path}`, 'caption: Figure caption.', 'width: 70%', ':::'], 'figure');
  });
  return true;
}

function flowDropFiles(view, event) {
  const files = [...((event.dataTransfer && event.dataTransfer.files) || [])].filter((file) => file.type.startsWith('image/'));
  if (!files.length) return false;
  event.preventDefault();
  const spot = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (spot) FLOW.editor.commands.setTextSelection(spot.pos);
  files.forEach(async (file) => {
    const path = await upload(file);
    if (path) flowInsertBlocks([':::figure', `src: ${path}`, 'caption: Figure caption.', 'width: 70%', ':::'], 'figure');
  });
  return true;
}

function flowAlign(value) {
  const editor = FLOW.editor;
  const { state } = editor;
  const justified = !/^(no|off|false)$/i.test(String((S.settings || {}).justify || 'yes'));
  const base = justified ? 'justify' : 'left';
  let tr = state.tr;
  state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
    if (node.type.name !== 'paragraph') return true;
    const $pos = state.doc.resolve(pos);
    if ($pos.depth !== 0) return false;
    const opts = (node.attrs.opts || []).filter((line) => !line.toLowerCase().startsWith('align:'));
    if (value !== base) opts.unshift(`align: ${value}`);
    tr = tr.setNodeMarkup(pos, null, { ...node.attrs, opts: opts.length ? opts : null });
    return false;
  });
  if (tr.docChanged) editor.view.dispatch(tr);
  flowPaintBar();
  return true;
}

function flowCurrentAlign() {
  const { $from } = FLOW.editor.state.selection;
  const top = $from.depth ? $from.node(1) : null;
  const justified = !/^(no|off|false)$/i.test(String((S.settings || {}).justify || 'yes'));
  if (!top || top.type.name !== 'paragraph') return justified ? 'justify' : 'left';
  return flowOptValue(top.attrs.opts, 'align') || (justified ? 'justify' : 'left');
}

function flowFmtAt() {
  const { state } = FLOW.editor;
  const marks = state.selection.empty ? state.storedMarks || state.selection.$from.marks() : [];
  if (!state.selection.empty) {
    state.doc.nodesBetween(state.selection.from, state.selection.to, (node) => {
      if (node.isText) node.marks.forEach((mark) => marks.push(mark));
    });
  }
  const fmt = marks.find((mark) => mark.type.name === 'fmt');
  return fmt ? attrList(fmt.attrs.attrs) : [];
}

function flowSetFmt(key, value) {
  const editor = FLOW.editor;
  const { state } = editor;
  const type = state.schema.marks.fmt;
  const merge = (list) => {
    const kept = list.filter((item) => item.key !== key && item.flag !== key);
    if (value) kept.push(value === true ? { flag: key } : { key, value });
    return attrString(kept);
  };
  if (state.selection.empty) {
    const marks = state.storedMarks || state.selection.$from.marks();
    const old = marks.find((mark) => mark.type === type);
    const attrs = merge(old ? attrList(old.attrs.attrs) : []);
    let tr = state.tr;
    if (old) tr = tr.removeStoredMark(old);
    if (attrs) tr = tr.addStoredMark(type.create({ attrs }));
    editor.view.dispatch(tr);
    editor.commands.focus();
    return;
  }
  let tr = state.tr;
  const { from, to } = state.selection;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText) return true;
    const a = Math.max(from, pos);
    const b = Math.min(to, pos + node.nodeSize);
    const old = node.marks.filter((mark) => mark.type === type);
    const attrs = merge(old.length ? attrList(old.map((mark) => mark.attrs.attrs).join(' ')) : []);
    old.forEach((mark) => {
      tr = tr.removeMark(a, b, mark);
    });
    if (attrs) tr = tr.addMark(a, b, type.create({ attrs }));
    return false;
  });
  editor.view.dispatch(tr);
  editor.commands.focus();
}

function flowClearFormat() {
  FLOW.editor.chain().focus().unsetAllMarks().run();
}

function flowBlockType() {
  const { $from } = FLOW.editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'heading') return `h${node.attrs.level}`;
    if (node.type.name === 'blockquote') return 'quote';
    if (node.type.name === 'bulletList') return 'bullet';
    if (node.type.name === 'orderedList') return 'ordered';
  }
  return 'p';
}

function flowSetBlock(value) {
  const chain = FLOW.editor.chain().focus();
  const now = flowBlockType();
  if (now === 'quote' && value !== 'quote') chain.toggleBlockquote();
  if (value === 'p') chain.setParagraph();
  else if (value === 'quote') {
    if (now !== 'quote') chain.setParagraph().toggleBlockquote();
  } else chain.setNode('heading', { level: Number(value.slice(1)) });
  chain.run();
}

const FLOW_STYLES = [
  { value: 'p', label: 'Text' },
  { value: 'h1', label: 'Heading' },
  { value: 'h2', label: 'Sub-heading' },
  { value: 'h3', label: 'Sub-sub-heading' },
  { value: 'quote', label: 'Quote' },
];

function flowToolbar() {
  const bar = h('div', { id: 'fbar', hidden: true });
  const btn = (name, title, run, extra = '') => {
    const b = h('button', { type: 'button', class: `fbtn ${extra}`, html: icon(name, 17), title });
    b.addEventListener('mousedown', (event) => {
      event.preventDefault();
      run(b);
    });
    b.dataset.cmd = name;
    return b;
  };
  const sep = () => h('span', { class: 'fsep' });
  const style = h('button', { type: 'button', class: 'fpick style', title: 'Text style' });
  style.addEventListener('mousedown', (event) => {
    event.preventDefault();
    flowMenu(style, FLOW_STYLES.map((item) => ({ label: item.label, cls: `st-${item.value}`, on: flowBlockType() === item.value, run: () => flowSetBlock(item.value) })));
  });
  const size = h('button', { type: 'button', class: 'fpick size', title: 'Size' });
  size.addEventListener('mousedown', (event) => {
    event.preventDefault();
    const now = (flowFmtAt().find((item) => item.key === 'size') || {}).value;
    flowMenu(size, [{ label: 'Default', on: !now, run: () => flowSetFmt('size', '') }, ...FLOW_SIZES.map((value) => ({ label: value, on: now === value, run: () => flowSetFmt('size', value) }))]);
  });
  const font = h('button', { type: 'button', class: 'fpick font', title: 'Font' });
  font.addEventListener('mousedown', (event) => {
    event.preventDefault();
    flowFontMenu(font);
  });
  const chain = (fn) => () => fn(FLOW.editor.chain().focus()).run();
  const fx = h('button', { type: 'button', class: 'fbtn fx', title: 'More text styles: colour, highlight, strikethrough, superscript', html: '<span class="fx-a">Aa</span><span class="fx-bar"></span>' });
  fx.dataset.cmd = 'fx';
  fx.addEventListener('mousedown', (event) => {
    event.preventDefault();
    flowFxMenu(fx);
  });
  const align = btn('alignLeft', 'Align', (b) => flowMenu(b, [
    ['left', 'alignLeft', 'Left', 'Ctrl+Shift+L'],
    ['center', 'alignCenter', 'Centre', 'Ctrl+Shift+E'],
    ['right', 'alignRight', 'Right', 'Ctrl+Shift+R'],
    ['justify', 'alignJustify', 'Justify', 'Ctrl+Shift+J'],
  ].map(([value, name, label, keys]) => ({ label, icon: name, hint: keys, on: flowCurrentAlign() === value, run: () => flowAlign(value) }))), 'align');
  const add = h('button', { type: 'button', class: 'fpick addmenu', title: 'Add maths, a citation, a footnote, a table, a chart...', html: `${icon('plus', 16)}<span>Add</span>${icon('chevron', 14)}` });
  add.addEventListener('mousedown', (event) => {
    event.preventDefault();
    const block = (label, iconName, extra = {}) => {
      const found = TEMPLATES.find((item) => item.label === label);
      return found ? { label, icon: iconName, run: () => flowInsertTemplate(found), ...extra } : null;
    };
    flowMenu(add, [
      { label: 'Maths', icon: 'equation', hint: 'Ctrl+M', run: () => flowNewChip('math') },
      { label: 'Citation', icon: 'bibliography', hint: '@', run: () => flowCitePop(add) },
      { label: 'Figure or table reference', icon: 'hash', hint: '@', run: () => flowRefPop(add) },
      { label: 'Footnote', icon: 'footnote', run: () => flowNewChip('note') },
      block('Table', 'table', { cls: 'sep-top' }),
      block('Chart', 'chart'),
      block('Image', 'image'),
      { label: 'All blocks…', icon: 'box', hint: '/', run: () => reveal($('#palette')) },
    ].filter(Boolean));
  });
  const groups = [
    [btn('undo', 'Undo (Ctrl+Z)', chain((c) => c.undo())), btn('redo', 'Redo (Ctrl+Y)', chain((c) => c.redo()))],
    [style, font, size],
    [btn('bold', 'Bold (Ctrl+B)', chain((c) => c.toggleBold())), btn('italic', 'Italic (Ctrl+I)', chain((c) => c.toggleItalic())), btn('underline', 'Underline (Ctrl+U)', chain((c) => c.toggleUnderline())), fx],
    [align, btn('list', 'Bullets (Ctrl+Shift+8)', chain((c) => c.toggleBulletList())), btn('listOrdered', 'Numbers (Ctrl+Shift+7)', chain((c) => c.toggleOrderedList())), btn('link', 'Link', (b) => flowLinkPop(b))],
    [add],
  ];
  groups.forEach((group, index) => {
    if (index) bar.append(sep());
    bar.append(...group);
  });
  bar.append(h('span', { class: 'fgrow' }), btn('note', 'Add a note (Ctrl+Alt+M)', flowNoteAdd), btn('search', 'Find and replace (Ctrl+F)', () => flowFindOpen(false)));
  return bar;
}

function flowFxMenu(anchor) {
  flowPopClose();
  const editor = FLOW.editor;
  const box = h('div', { class: 'fmenu fxmenu' });
  const toggle = (name, label, active, run) => {
    const b = h('button', { type: 'button', class: `fx-toggle${active ? ' on' : ''}`, html: `${icon(name, 16)}<span>${label}</span>` });
    b.addEventListener('mousedown', (event) => {
      event.preventDefault();
      run();
      flowPopClose();
      flowPaintBar();
    });
    return b;
  };
  const swatches = (key, list) => {
    const row = h('div', { class: 'fx-swatches' });
    const none = h('button', { type: 'button', class: 'swatch none', title: 'None' });
    none.addEventListener('mousedown', (event) => {
      event.preventDefault();
      flowPopClose();
      flowSetFmt(key, '');
      if (key === 'bg') flowSetFmt('highlight', '');
    });
    row.append(none);
    list.forEach((value) => {
      const swatch = h('button', { type: 'button', class: 'swatch', title: value });
      swatch.style.background = value;
      swatch.addEventListener('mousedown', (event) => {
        event.preventDefault();
        flowPopClose();
        flowSetFmt(key, value);
      });
      row.append(swatch);
    });
    return row;
  };
  box.append(
    h('div', { class: 'fx-row' },
      toggle('strike', 'Strike', editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run()),
      toggle('superscript', 'Super', editor.isActive('superscript'), () => editor.chain().focus().toggleSuperscript().run()),
      toggle('subscript', 'Sub', editor.isActive('subscript'), () => editor.chain().focus().toggleSubscript().run())),
    h('div', { class: 'fx-label', text: 'Colour' }),
    swatches('color', FLOW_COLORS),
    h('div', { class: 'fx-label', text: 'Highlight' }),
    swatches('bg', FLOW_MARKS),
    toggle('eraser', 'Clear formatting', false, flowClearFormat),
  );
  flowPlacePop(box, anchor);
}

function flowPaintBar() {
  if (!FLOW.bar || !FLOW.editor) return;
  const editor = FLOW.editor;
  const active = {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    superscript: editor.isActive('superscript'),
    subscript: editor.isActive('subscript'),
    list: editor.isActive('bulletList'),
    listOrdered: editor.isActive('orderedList'),
    quote: editor.isActive('blockquote'),
    link: editor.isActive('rlink'),
  };
  const align = flowCurrentAlign();
  const alignName = { left: 'alignLeft', center: 'alignCenter', centre: 'alignCenter', right: 'alignRight', justify: 'alignJustify' }[align] || 'alignLeft';
  FLOW.bar.querySelectorAll('.fbtn').forEach((b) => {
    b.classList.toggle('on', Boolean(active[b.dataset.cmd]));
  });
  const alignBtn = FLOW.bar.querySelector('.fbtn.align');
  if (alignBtn && alignBtn.dataset.shown !== alignName) {
    alignBtn.dataset.shown = alignName;
    alignBtn.innerHTML = icon(alignName, 17);
  }
  const fxBtn = FLOW.bar.querySelector('.fbtn.fx');
  if (fxBtn) fxBtn.classList.toggle('on', Boolean(active.strike || active.superscript || active.subscript));
  const type = flowBlockType();
  const style = FLOW_STYLES.find((item) => item.value === type);
  const styleBtn = FLOW.bar.querySelector('.fpick.style');
  styleBtn.innerHTML = `<span>${style ? style.label : 'Text'}</span>${icon('chevron', 14)}`;
  const fmt = flowFmtAt();
  const size = (fmt.find((item) => item.key === 'size') || {}).value;
  const font = (fmt.find((item) => item.key === 'font') || {}).value;
  FLOW.bar.querySelector('.fpick.size').innerHTML = `<span>${size || (S.settings && S.settings['font-size']) || '11'}</span>${icon('chevron', 14)}`;
  const fontBtn = FLOW.bar.querySelector('.fpick.font');
  fontBtn.innerHTML = `<span>${font || (S.settings && S.settings.font) || 'Cambria'}</span>${icon('chevron', 14)}`;
  fontBtn.firstChild.style.fontFamily = `"${font || (S.settings && S.settings.font) || 'Cambria'}"`;
  const color = (fmt.find((item) => item.key === 'color') || {}).value;
  if (fxBtn) fxBtn.style.setProperty('--swatch', color || 'currentColor');
}

function flowMenu(anchor, items) {
  flowPopClose();
  const menu = h('div', { class: 'fmenu' });
  items.forEach((item) => {
    const row = h('button', { type: 'button', class: `frow${item.on ? ' on' : ''} ${item.cls || ''}` });
    if (item.icon) row.append(h('span', { class: 'frow-icon small', html: icon(item.icon, 16) }));
    const text = h('span', { class: 'frow-main', text: item.label });
    if (item.style) text.style.cssText = item.style;
    row.append(text);
    if (item.hint) row.append(h('span', { class: 'frow-hint', text: item.hint }));
    row.addEventListener('mousedown', (event) => {
      event.preventDefault();
      flowPopClose();
      item.run();
    });
    menu.append(row);
  });
  flowPlacePop(menu, anchor);
}

function flowPlacePop(node, anchor) {
  document.body.append(node);
  const rect = anchor.getBoundingClientRect();
  const width = node.offsetWidth;
  node.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, rect.left))}px`;
  node.style.top = `${rect.bottom + 6}px`;
  FLOW.pop = node;
  reveal(node);
  setTimeout(() => document.addEventListener('mousedown', flowPopOutside, true), 0);
}

function flowPopOutside(event) {
  if (FLOW.pop && !FLOW.pop.contains(event.target)) flowPopClose();
}

function flowPopClose() {
  document.removeEventListener('mousedown', flowPopOutside, true);
  if (FLOW.pop) {
    const node = FLOW.pop;
    FLOW.pop = null;
    node.remove();
  }
}

function flowFontMenu(anchor) {
  const fonts = ['Cambria', 'Calibri', 'Times New Roman', 'Arial', 'Georgia', 'Garamond', 'EB Garamond', 'Lora', 'Merriweather', 'Source Serif 4', 'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'JetBrains Mono'];
  const now = (flowFmtAt().find((item) => item.key === 'font') || {}).value;
  flowMenu(anchor, [{ label: 'Document font', on: !now, run: () => flowSetFmt('font', '') }, ...fonts.map((name) => ({ label: name, on: now === name, style: `font-family:"${name}"`, run: () => flowSetFmt('font', name) }))]);
}

function flowColorMenu(anchor, key) {
  flowPopClose();
  const list = key === 'color' ? FLOW_COLORS : FLOW_MARKS;
  const box = h('div', { class: 'fmenu swatches' });
  const none = h('button', { type: 'button', class: 'swatch none', title: key === 'color' ? 'Default' : 'None' });
  none.addEventListener('mousedown', (event) => {
    event.preventDefault();
    flowPopClose();
    flowSetFmt(key, '');
    if (key === 'bg') flowSetFmt('highlight', '');
  });
  box.append(none);
  list.forEach((value) => {
    const swatch = h('button', { type: 'button', class: 'swatch', title: value });
    swatch.style.background = value;
    swatch.addEventListener('mousedown', (event) => {
      event.preventDefault();
      flowPopClose();
      flowSetFmt(key, value);
    });
    box.append(swatch);
  });
  flowPlacePop(box, anchor);
}

function flowInputPop(anchor, { value = '', placeholder = '', preview = null, onDone, onRemove = null, multiline = false }) {
  flowPopClose();
  const box = h('div', { class: 'fmenu finput' });
  const input = h(multiline ? 'textarea' : 'input', { type: 'text', class: 'fpop-input', spellcheck: multiline ? 'true' : 'false', placeholder });
  input.value = value;
  const show = h('div', { class: 'fpop-preview' });
  const paint = () => {
    if (!preview) return;
    const html = preview(input.value);
    show.hidden = !html;
    show.innerHTML = html || '';
  };
  const done = () => {
    const text = input.value;
    flowPopClose();
    onDone(text);
  };
  input.addEventListener('input', paint);
  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter' && (!multiline || !event.shiftKey)) {
      event.preventDefault();
      done();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      flowPopClose();
      FLOW.editor.commands.focus();
    }
  });
  const row = h('div', { class: 'fpop-row' }, input);
  const ok = h('button', { type: 'button', class: 'fpop-ok', html: icon('check', 16), title: 'Done' });
  ok.addEventListener('mousedown', (event) => {
    event.preventDefault();
    done();
  });
  row.append(ok);
  if (onRemove) {
    const drop = h('button', { type: 'button', class: 'fpop-ok drop', html: icon('trash', 15), title: 'Remove' });
    drop.addEventListener('mousedown', (event) => {
      event.preventDefault();
      flowPopClose();
      onRemove();
    });
    row.append(drop);
  }
  box.append(row);
  if (preview) box.append(show);
  flowPlacePop(box, anchor);
  paint();
  setTimeout(() => {
    input.focus();
    input.select();
  }, 20);
}

function flowCaretAnchor() {
  const { view, state } = FLOW.editor;
  const at = view.coordsAtPos(state.selection.from);
  const ghost = { getBoundingClientRect: () => ({ left: at.left, right: at.right, top: at.top, bottom: at.bottom }) };
  return ghost;
}

function flowNewChip(kind) {
  const anchor = flowCaretAnchor();
  const { from, to } = FLOW.editor.state.selection;
  const picked = FLOW.editor.state.doc.textBetween(from, to, ' ');
  if (kind === 'math') {
    flowInputPop(anchor, {
      value: picked,
      placeholder: 'x^2 + sqrt(y)/2',
      preview: (text) => (text.trim() ? mathHtml(text) : ''),
      onDone: (text) => {
        if (!text.trim()) return FLOW.editor.commands.focus();
        flowPutChip(from, to, 'math', `$${text.trim()}$`, text.trim());
      },
    });
  } else if (kind === 'note') {
    flowInputPop(anchor, {
      value: picked,
      placeholder: 'Footnote',
      multiline: true,
      onDone: (text) => {
        if (!text.trim()) return FLOW.editor.commands.focus();
        flowPutChip(from, to, 'note', `^[${text.trim().replace(/\]/g, '\\]')}]`, '†');
      },
    });
  }
}

function flowPutChip(from, to, kind, src, label) {
  const node = FLOW.editor.schema.nodes.chip.create({ kind, src, label });
  const tr = FLOW.editor.state.tr.replaceWith(from, to, node);
  FLOW.editor.view.dispatch(tr.setSelection(TT.TextSelection.create(tr.doc, from + 1)));
  FLOW.editor.commands.focus();
}

function flowPutCite(from, to, key, label) {
  const size = FLOW.editor.state.doc.content.size;
  const a = Math.max(1, Math.min(from, size - 1));
  const b = Math.max(a, Math.min(to, size - 1));
  const before = FLOW.editor.state.doc.textBetween(Math.max(0, a - 1), a, '\n', '￼');
  let at = a;
  if (before && !/[\s(\[\n]/.test(before)) {
    FLOW.editor.view.dispatch(FLOW.editor.state.tr.insertText(' ', a, b));
    at = a + 1;
  } else if (b > a) FLOW.editor.view.dispatch(FLOW.editor.state.tr.delete(a, b));
  flowPutChip(at, at, 'cite', `[@${key}]`, label);
}

function flowChipPop(dom, pos) {
  const node = FLOW.editor.state.doc.nodeAt(pos);
  if (!node) return;
  const { kind, src } = node.attrs;
  const replace = (nextSrc, label) => {
    const fresh = FLOW.editor.schema.nodes.chip.create({ kind, src: nextSrc, label });
    const tr = FLOW.editor.state.tr.replaceWith(pos, pos + 1, fresh);
    FLOW.editor.view.dispatch(tr.setSelection(TT.TextSelection.create(tr.doc, pos + 1)));
    FLOW.editor.commands.focus();
  };
  const remove = () => {
    const tr = FLOW.editor.state.tr.delete(pos, pos + 1);
    FLOW.editor.view.dispatch(tr);
    FLOW.editor.commands.focus();
  };
  if (kind === 'math') {
    const body = src.replace(/^\$+|\$+$/g, '');
    flowInputPop(dom, { value: body, preview: (text) => (text.trim() ? mathHtml(text) : ''), onDone: (text) => (text.trim() ? replace(`$${text.trim()}$`, text.trim()) : remove()), onRemove: remove });
  } else if (kind === 'note' && src.startsWith('[^')) {
    FLOW.editor.commands.focus();
  } else if (kind === 'note') {
    flowInputPop(dom, { value: src.slice(2, -1).replace(/\\\]/g, ']'), multiline: true, onDone: (text) => (text.trim() ? replace(`^[${text.trim().replace(/\]/g, '\\]')}]`, '†') : remove()), onRemove: remove });
  } else if (kind === 'cite') flowCitePop(dom, { pos, remove });
  else if (kind === 'ref') flowRefPop(dom, { pos, remove });
}

function flowPickList(anchor, items, { empty, onPick, onRemove = null, extra = null }) {
  flowPopClose();
  const box = h('div', { class: 'fmenu fpick-list' });
  const input = h('input', { type: 'text', class: 'fpop-input', placeholder: 'Search', spellcheck: 'false' });
  const list = h('div', { class: 'fpick-rows' });
  let shown = [];
  let index = 0;
  const draw = () => {
    const term = input.value.trim().toLowerCase();
    shown = items.filter((item) => !term || `${item.label} ${item.hint || ''}`.toLowerCase().includes(term)).slice(0, 60);
    index = Math.min(index, Math.max(0, shown.length - 1));
    list.replaceChildren(...shown.map((item, i) => {
      const row = h('button', { type: 'button', class: `frow${i === index ? ' on' : ''}` }, h('span', { class: 'frow-main', text: item.label }), h('span', { class: 'frow-hint', text: item.hint || '' }));
      row.addEventListener('mousedown', (event) => {
        event.preventDefault();
        flowPopClose();
        onPick(item);
      });
      return row;
    }));
    if (!shown.length) list.append(h('div', { class: 'fempty', text: empty }));
  };
  input.addEventListener('input', () => {
    index = 0;
    draw();
  });
  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      index = Math.min(shown.length - 1, index + 1);
      draw();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      index = Math.max(0, index - 1);
      draw();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = shown[index];
      flowPopClose();
      if (item) onPick(item);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      flowPopClose();
      FLOW.editor.commands.focus();
    }
  });
  box.append(input, list);
  if (extra || onRemove) {
    const foot = h('div', { class: 'fpop-foot' });
    if (extra) foot.append(extra);
    if (onRemove) {
      const drop = h('button', { type: 'button', class: 'pill ghost small', text: 'Remove' });
      drop.addEventListener('mousedown', (event) => {
        event.preventDefault();
        flowPopClose();
        onRemove();
      });
      foot.append(drop);
    }
    box.append(foot);
  }
  flowPlacePop(box, anchor);
  draw();
  setTimeout(() => input.focus(), 20);
}

function flowCitePop(anchor, existing = null) {
  const { from, to } = FLOW.editor.state.selection;
  const items = Object.keys(S.sources || {}).map((key) => ({ key, label: String((S.sources[key] && (S.sources[key].label || S.sources[key].title)) || S.sources[key] || key).slice(0, 90), hint: key }));
  let extra = null;
  if (typeof openSourceLookup === 'function') {
    extra = h('button', { type: 'button', class: 'pill ghost small', html: `${icon('plus', 14)}<span>Add source</span>` });
    extra.addEventListener('mousedown', (event) => {
      event.preventDefault();
      flowPopClose();
      FLOW.keep = { from, to };
      openSourceLookup({
        onInsert: (key, info) => {
          flowPull();
          const spot = FLOW.keep || { from, to };
          FLOW.keep = null;
          flowPutCite(spot.from, spot.to, key, (info && info.label) || `(${key})`);
        },
      });
    });
  }
  flowPickList(anchor, items, {
    empty: 'No sources yet',
    extra,
    onRemove: existing ? existing.remove : null,
    onPick: (item) => {
      const src = `[@${item.key}]`;
      if (existing) {
        const tr = FLOW.editor.state.tr.replaceWith(existing.pos, existing.pos + 1, FLOW.editor.schema.nodes.chip.create({ kind: 'cite', src, label: `(${item.key})` }));
        FLOW.editor.view.dispatch(tr);
        FLOW.editor.commands.focus();
      } else flowPutCite(from, to, item.key, `(${item.key})`);
    },
  });
}

function flowRefPop(anchor, existing = null) {
  const { from, to } = FLOW.editor.state.selection;
  const items = Object.keys(S.labels || {}).map((key) => ({ key, label: S.labels[key], hint: key }));
  flowPickList(anchor, items, {
    empty: 'Add a caption id to a figure or table first',
    onRemove: existing ? existing.remove : null,
    onPick: (item) => {
      const src = `@${item.key}`;
      if (existing) {
        const tr = FLOW.editor.state.tr.replaceWith(existing.pos, existing.pos + 1, FLOW.editor.schema.nodes.chip.create({ kind: 'ref', src, label: item.label }));
        FLOW.editor.view.dispatch(tr);
        FLOW.editor.commands.focus();
      } else flowPutChip(from, to, 'ref', src, item.label);
    },
  });
}

function flowLinkPop(anchor) {
  const editor = FLOW.editor;
  const now = editor.getAttributes('rlink').url || '';
  const { from, to, empty } = editor.state.selection;
  flowInputPop(anchor, {
    value: now,
    placeholder: 'https://',
    onRemove: now ? () => editor.chain().focus().extendMarkRange('rlink').unsetMark('rlink').run() : null,
    onDone: (url) => {
      const clean = url.trim();
      if (!clean) return editor.commands.focus();
      if (empty && !now) {
        const tr = editor.state.tr.insertText(clean, from, to);
        tr.addMark(from, from + clean.length, editor.schema.marks.rlink.create({ url: clean }));
        editor.view.dispatch(tr);
        editor.commands.focus();
        return;
      }
      editor.chain().focus().setTextSelection({ from, to }).extendMarkRange('rlink').setMark('rlink', { url: clean }).run();
    },
  });
}

const FLOW_ACTIONS = [
  { id: 'cite', label: 'Citation', icon: 'bibliography', group: 'Text', hint: '@', words: 'cite source reference quote', action: () => flowCitePop(flowCaretAnchor()) },
  { id: 'footnote', label: 'Footnote', icon: 'footnote', group: 'Text', words: 'note endnote', action: () => flowNewChip('note') },
];

function flowRunAction(item) {
  const go = () => {
    FLOW.editor.commands.focus();
    item.action();
  };
  if (FLOW.on && FLOW.editor) return go();
  flowShow(true);
  requestAnimationFrame(() => requestAnimationFrame(go));
}

function flowPaletteActions() {
  const head = [...document.querySelectorAll('#palette .palette-group')].find((node) => node.textContent === 'Text');
  const grid = head && head.nextElementSibling;
  if (!grid || grid.querySelector('.palette-action')) return;
  const tint = getComputedStyle(grid.firstElementChild || grid).getPropertyValue('--tint') || '#fbbc04';
  FLOW_ACTIONS.forEach((item, i) => {
    const tile = h('button', { class: 'palette-action', html: `${icon(item.icon, 26)}<span>${item.label}</span>`, title: item.label, style: `--tint:${tint};--i:${grid.children.length + i}` });
    tile.template = item;
    tile.addEventListener('click', () => {
      conceal($('#palette'));
      flowRunAction(item);
    });
    grid.append(tile);
  });
}

function flowSlashCheck() {
  if (!FLOW.editor) return;
  const { state } = FLOW.editor;
  const sel = state.selection;
  if (!sel.empty || !sel.$from.parent.isTextblock || sel.$from.parent.type.name === 'heading') return flowSlashClose();
  const before = sel.$from.parent.textBetween(0, sel.$from.parentOffset, '￼');
  const at = before.match(/(?:^|[\s(])@([\w:.-]*)$/);
  if (at) return flowAtCheck(at[1], sel.from - at[1].length - 1, sel.from);
  const match = before.match(/(?:^|\s)\/([\w-]*)$/);
  if (!match) return flowSlashClose();
  const term = match[1];
  const from = sel.from - term.length - 1;
  if (FLOW.slash && FLOW.slash.mode === 'at') flowSlashClose();
  const low = term.toLowerCase();
  const rank = (template) => {
    const label = template.label.toLowerCase();
    if (!low) return 0;
    if (label.startsWith(low)) return 0;
    if (label.split(/[^a-z0-9]+/).some((word) => word.startsWith(low))) return 1;
    return 2;
  };
  const list = [...FLOW_ACTIONS, ...TEMPLATES].map((template, order) => ({ template, order }))
    .filter(({ template }) => !term || templateMatches(template, term) || (template.words && templateMatches({ label: template.words, group: '' }, term)))
    .sort((a, b) => rank(a.template) - rank(b.template) || a.order - b.order)
    .map(({ template }) => template)
    .slice(0, 12);
  if (!FLOW.slash) {
    FLOW.slash = { box: h('div', { class: 'fmenu fslash' }), index: 0 };
    document.body.append(FLOW.slash.box);
  }
  Object.assign(FLOW.slash, { from, to: sel.from, list, term });
  FLOW.slash.index = Math.min(FLOW.slash.index, Math.max(0, list.length - 1));
  flowSlashDraw();
}

function flowAtItems() {
  const out = [];
  const kinds = { fig: 'Figure', tbl: 'Table', eq: 'Equation', sec: 'Section', code: 'Listing', def: 'Definition', thm: 'Theorem' };
  Object.keys(S.labels || {}).forEach((key) => {
    const kind = key.split(':')[0];
    out.push({ label: S.labels[key], group: kinds[kind] || 'Reference', icon: kind === 'tbl' ? 'table' : kind === 'sec' ? 'heading' : kind === 'eq' ? 'equation' : 'image', chip: 'ref', src: `@${key}`, words: `${key} ${S.labels[key]}` });
  });
  Object.keys(S.sources || {}).forEach((key) => {
    const info = S.sources[key];
    const title = String((info && (info.label || info.title)) || info || key);
    out.push({ label: title, group: 'Source', icon: 'bibliography', chip: 'cite', src: `[@${key}]`, words: `${key} ${title}`, hint: 'Cite' });
  });
  return out;
}

function flowAtCheck(term, from, to) {
  const low = term.toLowerCase();
  const list = flowAtItems().filter((item) => !low || item.words.toLowerCase().includes(low)).slice(0, 12);
  if (FLOW.slash && FLOW.slash.mode !== 'at') flowSlashClose();
  if (!FLOW.slash) {
    FLOW.slash = { box: h('div', { class: 'fmenu fslash' }), index: 0, mode: 'at' };
    document.body.append(FLOW.slash.box);
  }
  Object.assign(FLOW.slash, { from, to, list, term });
  FLOW.slash.index = Math.min(FLOW.slash.index, Math.max(0, list.length - 1));
  flowSlashDraw();
}

function flowSlashDraw() {
  const slash = FLOW.slash;
  const { box, list } = slash;
  box.replaceChildren(...list.map((template, i) => {
    const row = h('button', { type: 'button', class: `frow${i === slash.index ? ' on' : ''}` }, h('span', { class: 'frow-icon', html: icon(template.icon || 'box', 17) }), h('span', { class: 'frow-main', text: template.label }), h('span', { class: 'frow-hint', text: template.hint || template.group }));
    row.addEventListener('mousedown', (event) => {
      event.preventDefault();
      flowSlashRun(i);
    });
    return row;
  }));
  if (!list.length) box.append(h('div', { class: 'fempty', text: slash.mode === 'at' ? 'No figures, tables or sources yet' : 'Nothing found' }));
  const at = FLOW.editor.view.coordsAtPos(slash.from);
  const below = at.bottom + 6;
  box.style.left = `${Math.min(window.innerWidth - 300, at.left)}px`;
  box.style.top = `${below + 320 > window.innerHeight ? Math.max(8, at.top - 6 - box.offsetHeight) : below}px`;
  const on = box.querySelector('.frow.on');
  if (on) on.scrollIntoView({ block: 'nearest' });
}

function flowSlashRun(i) {
  const slash = FLOW.slash;
  const template = slash && slash.list[i];
  if (!template) return;
  if (slash.mode === 'at') {
    flowSlashClose();
    const node = FLOW.editor.schema.nodes.chip.create({ kind: template.chip, src: template.src, label: template.label });
    const tr = FLOW.editor.state.tr.replaceWith(slash.from, slash.to, node);
    FLOW.editor.view.dispatch(tr.setSelection(TT.TextSelection.create(tr.doc, slash.from + 1)));
    return;
  }
  FLOW.editor.view.dispatch(FLOW.editor.state.tr.delete(slash.from, slash.to));
  flowSlashClose(true);
  if (template.action) return template.action();
  flowInsertTemplate(template);
}

function flowSlashClose() {
  if (!FLOW.slash) return;
  FLOW.slash.box.remove();
  FLOW.slash = null;
}

function flowSlashKey(event) {
  if (!FLOW.slash) return false;
  const slash = FLOW.slash;
  if (event.key === 'ArrowDown') {
    slash.index = Math.min(slash.list.length - 1, slash.index + 1);
    flowSlashDraw();
    return true;
  }
  if (event.key === 'ArrowUp') {
    slash.index = Math.max(0, slash.index - 1);
    flowSlashDraw();
    return true;
  }
  if (event.key === 'Enter' || event.key === 'Tab') {
    if (!slash.list.length) return false;
    flowSlashRun(slash.index);
    return true;
  }
  if (event.key === 'Escape') {
    flowSlashClose();
    return true;
  }
  return false;
}

function flowFindOpen(replace) {
  if (!FLOW.find) {
    const input = h('input', { type: 'text', class: 'ffind-in', placeholder: 'Find', spellcheck: 'false' });
    const swap = h('input', { type: 'text', class: 'ffind-in', placeholder: 'Replace with', spellcheck: 'false' });
    const count = h('span', { class: 'ffind-count' });
    const caseBtn = h('button', { type: 'button', class: 'fbtn small', text: 'Aa', title: 'Match case' });
    const up = h('button', { type: 'button', class: 'fbtn small', html: icon('up', 15), title: 'Previous (Shift+Enter)' });
    const down = h('button', { type: 'button', class: 'fbtn small', html: icon('down', 15), title: 'Next (Enter)' });
    const more = h('button', { type: 'button', class: 'fbtn small', html: icon('chevron', 15), title: 'Replace' });
    const close = h('button', { type: 'button', class: 'fbtn small', html: icon('close', 15), title: 'Close (Esc)' });
    const one = h('button', { type: 'button', class: 'pill ghost small', text: 'Replace' });
    const all = h('button', { type: 'button', class: 'pill ghost small', text: 'All' });
    const swapRow = h('div', { class: 'ffind-row swap' }, swap, one, all);
    const box = h('div', { id: 'ffind' }, h('div', { class: 'ffind-row' }, more, input, count, caseBtn, up, down, close), swapRow);
    document.body.append(box);
    FLOW.find = { box, input, swap, count, caseBtn, swapRow, cs: false };
    const push = (meta) => {
      FLOW.editor.view.dispatch(FLOW.editor.state.tr.setMeta(FLOW_FIND_KEY, meta).setMeta('addToHistory', false));
      flowFindCount();
      flowFindReveal();
    };
    input.addEventListener('input', () => push({ term: input.value, index: 0 }));
    const step = (dir) => {
      const state = FLOW_FIND_KEY.getState(FLOW.editor.state);
      if (!state.matches.length) return;
      push({ index: (state.index + dir + state.matches.length) % state.matches.length });
    };
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        step(event.shiftKey ? -1 : 1);
      } else if (event.key === 'Escape') flowFindClose();
    });
    swap.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        one.dispatchEvent(new MouseEvent('mousedown'));
      } else if (event.key === 'Escape') flowFindClose();
    });
    const press = (node, run) => node.addEventListener('mousedown', (event) => {
      event.preventDefault();
      run();
    });
    press(up, () => step(-1));
    press(down, () => step(1));
    press(close, flowFindClose);
    press(more, () => {
      box.classList.toggle('with-swap');
      if (box.classList.contains('with-swap')) setTimeout(() => swap.focus(), 10);
    });
    press(caseBtn, () => {
      FLOW.find.cs = !FLOW.find.cs;
      caseBtn.classList.toggle('on', FLOW.find.cs);
      push({ cs: FLOW.find.cs, index: 0 });
    });
    press(one, () => {
      const state = FLOW_FIND_KEY.getState(FLOW.editor.state);
      const match = state.matches[state.index];
      if (!match) return;
      FLOW.editor.view.dispatch(FLOW.editor.state.tr.insertText(swap.value, match.from, match.to));
      flowFindCount();
      flowFindReveal();
    });
    press(all, () => {
      const state = FLOW_FIND_KEY.getState(FLOW.editor.state);
      if (!state.matches.length) return;
      let tr = FLOW.editor.state.tr;
      [...state.matches].reverse().forEach((match) => {
        tr = tr.insertText(swap.value, match.from, match.to);
      });
      const done = state.matches.length;
      FLOW.editor.view.dispatch(tr);
      flowFindCount();
      toast(`Replaced ${done}`);
    });
  }
  const { box, input } = FLOW.find;
  box.classList.toggle('with-swap', replace || box.classList.contains('with-swap'));
  reveal(box);
  const { from, to } = FLOW.editor.state.selection;
  const picked = FLOW.editor.state.doc.textBetween(from, to, ' ');
  if (picked && picked.length < 80 && !picked.includes('\n')) input.value = picked;
  input.focus();
  input.select();
  FLOW.editor.view.dispatch(FLOW.editor.state.tr.setMeta(FLOW_FIND_KEY, { term: input.value, index: 0 }).setMeta('addToHistory', false));
  flowFindCount();
}

function flowFindCount() {
  if (!FLOW.find || FLOW.find.box.hidden) return;
  const state = FLOW_FIND_KEY.getState(FLOW.editor.state);
  FLOW.find.count.textContent = state.term ? (state.matches.length ? `${state.index + 1} of ${state.matches.length}` : 'No results') : '';
}

function flowFindReveal() {
  const state = FLOW_FIND_KEY.getState(FLOW.editor.state);
  const match = state.matches[state.index];
  if (!match) return;
  const at = FLOW.editor.view.coordsAtPos(match.from);
  const scroll = $('#scroll');
  const box = scroll.getBoundingClientRect();
  if (at.top < box.top + 120 || at.bottom > box.bottom - 120) scroll.scrollBy({ top: at.top - box.top - box.height / 3, behavior: 'smooth' });
}

function flowFindClose() {
  if (!FLOW.find) return;
  conceal(FLOW.find.box);
  FLOW.editor.view.dispatch(FLOW.editor.state.tr.setMeta(FLOW_FIND_KEY, { term: '' }).setMeta('addToHistory', false));
  FLOW.editor.commands.focus();
}

function flowStyle() {
  if (!FLOW.root) return;
  const set = S.settings || {};
  const page = S.pages[0] || { w: 595.28, h: 841.89 };
  const margin = marginPt();
  const size = parseFloat(set['font-size']) || 11;
  const zoom = size / 12;
  const scale = FLOW_L;
  const root = FLOW.root;
  root.style.setProperty('--pt', `${scale}px`);
  root.style.setProperty('--u', `${scale * zoom}px`);
  root.style.setProperty('--sheet-w', `${page.w * scale}px`);
  root.style.setProperty('--pad', `${margin * scale}px`);
  root.style.setProperty('--doc-font', docFont());
  root.style.setProperty('--lh', String(parseFloat(set['line-spacing']) || 1.8));
  root.style.setProperty('--flow-accent', set.accent || '#1f4e79');
  const heading = String(set['heading-font'] || '').trim();
  root.style.setProperty('--head-font', heading ? `"${heading.split(',')[0].trim()}",${docFont()}` : docFont());
  let tag = document.getElementById('flow-look');
  if (!tag) {
    tag = h('style', { id: 'flow-look' });
    document.head.append(tag);
  }
  tag.textContent = flowLookCss(set, zoom);
  flowPaintBar();
}

function flowLookCss(set, zoom) {
  const rules = [];
  const at = (value) => `calc(${value} * var(--u))`;
  const style = String(set['heading-style'] || 'rule').toLowerCase();
  const off = (value) => /^(no|off|false)$/i.test(String(value || ''));
  if (off(set.justify)) rules.push('.flow-doc p,.flow-doc li{text-align:left}');
  if (style === 'underline') rules.push(`.flow-doc h1,.flow-doc h2{font-weight:400;border-bottom:0;padding-bottom:0;text-decoration:underline;text-underline-offset:${at(3.5)}}.flow-doc h1{font-size:${at(17 / zoom)};margin-bottom:${at(14)}}.flow-doc h2{font-size:${at(14 / zoom)}}`);
  else if (style === 'plain') rules.push(`.flow-doc h1,.flow-doc h2{border-bottom:0;padding-bottom:0}.flow-doc h1{font-size:${at(17 / zoom)};margin-bottom:${at(12)}}`);
  else if (style === 'accent') rules.push(`.flow-doc h1,.flow-doc h2,.flow-doc h3{color:var(--flow-accent)}.flow-doc h1{border-bottom:0;padding-bottom:0;margin:${at(20)} 0 ${at(6)};font-size:${at(15 / zoom)};line-height:1.3}.flow-doc h2{margin:${at(14)} 0 ${at(4)};font-size:${at(12.5 / zoom)}}.flow-doc h3{margin:${at(10)} 0 ${at(2)}}`);
  const big = parseFloat(set['heading-size']);
  if (big) rules.push(`.flow-doc h1{font-size:${at(big / zoom)}}.flow-doc h2{font-size:${at((big * 0.85) / zoom)}}`);
  const colour = String(set['heading-color'] || '').trim();
  if (/^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(colour)) rules.push(`.flow-doc h1,.flow-doc h2,.flow-doc h3{color:${colour}}`);
  const align = String(set['heading-align'] || '').trim().toLowerCase();
  if (['center', 'centre', 'right'].includes(align)) rules.push(`.flow-doc h1,.flow-doc h2{text-align:${align === 'right' ? 'right' : 'center'}}`);
  if (/^(upper|caps|uppercase)$/i.test(String(set['heading-case'] || '').trim())) rules.push('.flow-doc h1,.flow-doc h2{text-transform:uppercase;letter-spacing:0.04em}');
  [['h2-size', 'h2'], ['h3-size', 'h3']].forEach(([key, tag]) => {
    const value = parseFloat(set[key]);
    if (value) rules.push(`.flow-doc ${tag}{font-size:${at(value / zoom)}}`);
  });
  const indent = String(set['paragraph-indent'] || '').trim();
  if (indent && !/^(no|none|0)$/i.test(indent)) rules.push(`.flow-doc > p{text-indent:${/^[\d.]+$/.test(indent) ? at(indent) : indent}}`);
  const spacing = parseFloat(set['paragraph-spacing']);
  if (spacing >= 0 && String(set['paragraph-spacing'] || '').trim()) rules.push(`.flow-doc p{margin-bottom:${at(spacing)}}`);
  return rules.join('\n');
}

function flowChipify() {
  const keys = Object.keys(S.cites || {}).filter((key) => /^@[A-Za-z][\w-]*\d[\w-]*$/.test(key));
  if (!keys.length) return;
  const state = FLOW.editor.state;
  const type = state.schema.nodes.chip;
  const found = [];
  state.doc.descendants((node, pos) => {
    if (!node.isText || node.marks.some((mark) => mark.type.name === 'code')) return;
    const pattern = /(^|[^\w@/.[\\-])(@[A-Za-z][\w-]*\d[\w-]*)/g;
    let match = pattern.exec(node.text);
    while (match) {
      const key = match[2];
      if (S.cites[key]) {
        const from = pos + match.index + match[1].length;
        found.push({ from, to: from + key.length, key });
      }
      match = pattern.exec(node.text);
    }
  });
  if (!found.length) return;
  let tr = state.tr;
  found.reverse().forEach((item) => {
    tr = tr.replaceWith(item.from, item.to, type.create({ kind: 'cite', src: item.key, label: S.cites[item.key] }));
  });
  FLOW.pulling = true;
  FLOW.editor.view.dispatch(tr.setMeta('addToHistory', false));
  FLOW.pulling = false;
  FLOW.map = flowAlignedMap(S.source);
}

function flowAfterRender(sent) {
  if (!FLOW.editor || sent === undefined) return;
  flowChipify();
  const { blocks } = flowSplit(sent);
  const pages = S.pages.map((page) => ({ ...page }));
  const byStart = new Map(S.ranges.map((range) => [range.start, range]));
  const rectsOf = [];
  blocks.forEach((block) => {
    const range = byStart.get(block.start);
    const rects = range ? S.regions[String(range.id)] || [] : [];
    rectsOf.push(rects);
    if (!['heading', 'para', 'list', 'quote'].includes(block.kind) && !(block.kind === 'text' && flowTextOptions(block.lines)) && !flowCalloutParts(block)) FLOW.crops.set(block.lines.join('\n'), { rects, pages });
  });
  FLOW.root.querySelectorAll('.fb').forEach((dom) => dom.flowRepaint && dom.flowRepaint());
  FLOW.root.querySelectorAll('.fchip.ref, .fchip.cite').forEach((dom) => {
    const kind = dom.classList.contains('ref') ? 'ref' : 'cite';
    const label = flowChipLabel(kind, dom.dataset.src, dom.textContent);
    if (label && dom.textContent !== label) dom.textContent = label;
  });
  flowStyle();
  flowRenumber();
  FLOW.lastRects = sent === S.source ? rectsOf : null;
  flowFrontPages(blocks, rectsOf);
  flowMarkers();
}

const FLOW_GAP = 28;
const FLOW_L = 96 / 72;

function flowZoom() {
  return (S.scale || FLOW_L) / FLOW_L;
}

function flowZoomBox() {
  if (!FLOW.zoomer) return;
  const zoom = flowZoom();
  FLOW.zoomer.style.transform = zoom === 1 ? '' : `scale(${zoom})`;
  FLOW.zoomBox.style.width = `${FLOW.zoomer.offsetWidth * zoom}px`;
  FLOW.zoomBox.style.height = `${FLOW.zoomer.offsetHeight * zoom}px`;
}

function flowFrontPages(blocks, rectsOf) {
  const firstBody = rectsOf.reduce((low, rects) => (rects.length ? Math.min(low, rects[0].page) : low), Infinity);
  const count = Number.isFinite(firstBody) ? firstBody : 0;
  FLOW.frontCount = count;
  const items = [];
  const coverOn = typeof coverIsOn === 'function' && coverIsOn();
  const contentsOn = /^(yes|on|true)$/i.test(String(S.settings.contents || ''));
  for (let i = 0; i < count; i += 1) {
    const page = S.pages[i];
    if (!page) continue;
    const isCover = coverOn && i === 0;
    const label = isCover ? 'Design the cover' : i === (coverOn ? 1 : 0) && contentsOn ? 'Contents settings' : 'Settings';
    const sheet = h('div', { class: 'flow-page-sheet', title: label });
    sheet.style.width = `${page.w * FLOW_L}px`;
    sheet.style.height = `${page.h * FLOW_L}px`;
    sheet.append(h('img', { src: page.url, alt: '', draggable: 'false' }), h('span', { class: 'flow-page-tag', html: `${icon(isCover ? 'shapes' : 'gear', 14)}<span>${label}</span>` }));
    sheet.addEventListener('click', () => {
      if (isCover) {
        if (typeof cvEnterPage === 'function') {
          FLOW.backToWrite = true;
          flowShow(false);
          cvEnterPage();
        } else if (typeof openCover === 'function') openCover();
      } else openSettings();
    });
    items.push(sheet);
  }
  FLOW.front.replaceChildren(...items);
  FLOW.front.hidden = !items.length;
}

function flowPageLayout() {
  const rectsOf = FLOW.lastRects;
  if (!rectsOf || !S.pages.length) return null;
  const doc = FLOW.editor.state.doc;
  const entries = [];
  let k = 0;
  doc.forEach((node, offset) => {
    if (!flowNodeLines(node).length) return;
    entries.push({ offset, node, rects: rectsOf[k] || [] });
    k += 1;
  });
  const first = FLOW.frontCount || 0;
  const breaks = [];
  const seen = new Set();
  const ends = {};
  const tops = {};
  let firstTop = null;
  entries.forEach((entry) => {
    entry.rects.forEach((rect, i) => {
      ends[rect.page] = Math.max(ends[rect.page] || 0, rect.y1);
      if (!(rect.page in tops)) tops[rect.page] = rect.y0;
      if (rect.page === first && firstTop === null) firstTop = rect.y0;
      if (rect.page > first && !seen.has(rect.page)) breaks.push({ page: rect.page, offset: entry.offset, node: entry.node, part: i, rects: entry.rects, y0: rect.y0 });
      seen.add(rect.page);
    });
  });
  return { first, last: S.pages.length - 1, breaks, ends, tops, firstTop: firstTop === null ? marginPt() : firstTop };
}

function flowPageTop(page) {
  let top = 0;
  for (let p = FLOW.frontCount || 0; p < page; p += 1) top += (S.pages[p] ? S.pages[p].h : 842) * FLOW_L + FLOW_GAP;
  return top;
}

function flowSplitPos(item) {
  const view = FLOW.editor.view;
  const dom = view.nodeDOM(item.offset);
  if (!dom || !dom.getBoundingClientRect) return null;
  const before = item.rects.slice(0, item.part).reduce((sum, rect) => sum + Math.max(0, rect.y1 - rect.y0), 0) * FLOW_L;
  const top = dom.getBoundingClientRect().top;
  const zoom = flowZoom();
  const walker = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT);
  let best = null;
  let node = walker.nextNode();
  while (node) {
    if (!node.parentElement.closest('.hnum, [contenteditable="false"]')) {
      const range = document.createRange();
      range.selectNodeContents(node);
      [...range.getClientRects()].forEach((rect) => {
        if (!rect.width) return;
        const line = (rect.top - top) / zoom;
        if (line >= before - (rect.height / zoom) * 0.45 && (!best || rect.top < best.top - 1 || (Math.abs(rect.top - best.top) <= 1 && rect.left < best.left))) best = rect;
      });
    }
    node = walker.nextNode();
  }
  if (!best) return null;
  const spot = view.posAtCoords({ left: best.left + 1, top: best.top + best.height / 2 });
  return spot ? spot.pos : null;
}

function flowMarkers() {
  if (!FLOW.marks || !FLOW.editor || !FLOW.on) return;
  const layout = flowPageLayout();
  if (!layout) {
    flowFitPages();
    return;
  }
  const view = FLOW.editor.view;
  const sign = `${layout.breaks.map((item) => `${item.offset}:${item.page}:${item.part}`).join(',')}|${FLOW_L}|${S.pages.length}|${FLOW.editor.state.doc.content.size}`;
  FLOW.pageInfo = layout;
  if (sign !== FLOW.pageSign) {
    FLOW.pageSign = sign;
    view.dispatch(view.state.tr.setMeta(FLOW_PAGES_KEY, TT.DecorationSet.empty).setMeta('addToHistory', false));
    const gaps = [];
    const deco = [];
    layout.breaks.forEach((item) => {
      if (item.part === 0 || item.node.type.name === 'figureBlock') {
        const el = h('div', { class: 'pg-gap', contenteditable: 'false' });
        gaps.push({ el, page: item.page, y0: item.y0, kind: 'block' });
        deco.push(TT.Decoration.widget(item.offset, el, { side: -1, key: `pg${item.page}`, ignoreSelection: true }));
        return;
      }
      const pos = flowSplitPos(item);
      if (pos === null) return;
      const el = h('span', { class: 'pg-gap inline', contenteditable: 'false' });
      gaps.push({ el, page: item.page, y0: item.y0, kind: 'inline' });
      deco.push(TT.Decoration.widget(pos, el, { side: -1, key: `pg${item.page}i`, ignoreSelection: true }));
    });
    const end = h('div', { class: 'pg-gap end', contenteditable: 'false' });
    gaps.push({ el: end, page: layout.last, kind: 'end' });
    deco.push(TT.Decoration.widget(view.state.doc.content.size, end, { side: 1, key: 'pgend', ignoreSelection: true }));
    FLOW.gaps = gaps;
    view.dispatch(view.state.tr.setMeta(FLOW_PAGES_KEY, TT.DecorationSet.create(view.state.doc, deco)).setMeta('addToHistory', false));
  }
  flowFitPages();
}

function flowFitPages() {
  const info = FLOW.pageInfo;
  if (!info || !FLOW.gaps || !FLOW.sheet || !FLOW.on) return;
  const scale = FLOW_L;
  const zoom = flowZoom();
  FLOW.sheet.style.paddingTop = `${Math.max(0, info.firstTop) * scale}px`;
  const base = FLOW.sheet.getBoundingClientRect().top;
  const sheetTop = () => base;
  const at = (value) => value / zoom;
  FLOW.gaps.forEach((gap) => {
    const el = gap.el;
    if (!el.isConnected) return;
    if (gap.kind === 'end') {
      el.style.height = '0px';
      const top = at(el.getBoundingClientRect().top - sheetTop());
      const page = S.pages[gap.page] || S.pages[S.pages.length - 1];
      el.style.height = `${Math.max(24, flowPageTop(gap.page) + page.h * scale - top)}px`;
      return;
    }
    const target = flowPageTop(gap.page) + gap.y0 * scale;
    const follower = () => {
      if (gap.kind === 'inline') return at(el.getBoundingClientRect().bottom - sheetTop());
      const next = el.nextElementSibling;
      return at((next ? next.getBoundingClientRect().top : el.getBoundingClientRect().bottom) - sheetTop());
    };
    el.style.height = '0px';
    let height = Math.max(0, target - follower());
    el.style.height = `${height}px`;
    const miss = target - follower();
    if (Math.abs(miss) > 0.5) {
      height = Math.max(0, height + miss);
      el.style.height = `${height}px`;
    }
  });
  flowPaintPages();
}

function flowPaintPages() {
  const info = FLOW.pageInfo;
  if (!info || !FLOW.marks) return;
  const scale = FLOW_L;
  const sheets = [];
  for (let p = info.first; p <= info.last; p += 1) {
    const page = S.pages[p];
    if (!page) continue;
    const top = flowPageTop(p);
    const sheet = h('div', { class: 'pg-sheet' });
    sheet.style.top = `${top}px`;
    sheet.style.height = `${page.h * scale}px`;
    sheet.style.width = `${page.w * scale}px`;
    const head = Math.max(0, ((p in info.tops ? info.tops[p] : marginPt()) - 3) * scale);
    const foot = (p in info.ends ? info.ends[p] + 3 : page.h - marginPt()) * scale;
    const paint = (y, height) => {
      if (height <= 1) return;
      const band = h('div', { class: 'pg-band' });
      band.style.top = `${y}px`;
      band.style.height = `${height}px`;
      band.style.backgroundImage = `url("${page.url}")`;
      band.style.backgroundSize = `${page.w * scale}px ${page.h * scale}px`;
      band.style.backgroundPosition = `0 ${-y}px`;
      sheet.append(band);
    };
    paint(0, head);
    paint(foot, page.h * scale - foot);
    sheets.push(sheet);
  }
  FLOW.marks.replaceChildren(...sheets);
  if (FLOW.notes && FLOW.notes.length) flowNotesPlace();
}

function flowSections() {
  const doc = FLOW.editor.state.doc;
  const numbers = new Map(flowHeadingNumbers(doc).map((item) => [item.pos - 1, item.text]));
  const out = [];
  doc.forEach((node, offset) => {
    if (node.type.name === 'heading') out.push({ level: node.attrs.level, text: node.textContent.trim() || 'Untitled', offset, size: node.nodeSize, number: numbers.get(offset) || '', words: 0 });
    else if (out.length) {
      const text = node.type.name === 'figureBlock' ? '' : node.textContent;
      out[out.length - 1].words += (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
    }
  });
  out.forEach((item, index) => {
    let end = doc.content.size;
    for (let j = index + 1; j < out.length; j += 1) {
      if (out[j].level <= item.level) {
        end = out[j].offset;
        break;
      }
    }
    item.end = end;
  });
  return out;
}

function flowOutline() {
  const box = $('#outline');
  const open = localStorage.getItem('studio.outline') === '1' && FLOW.on;
  box.hidden = !open;
  $('#outlineBtn').classList.toggle('on', open);
  if (!open) return;
  const items = flowSections();
  const list = h('div', { class: 'outline-list flow-outline' });
  items.forEach((item, index) => {
    const row = h('button', { type: 'button', class: `ol l${item.level}`, draggable: 'true', 'data-i': index });
    row.append(
      h('span', { class: 'ol-num', text: item.number }),
      h('span', { class: 'ol-text', text: item.text }),
      h('span', { class: 'ol-words', text: item.words ? item.words.toLocaleString() : '' }),
    );
    row.title = `${item.text} · ${item.words.toLocaleString()} words`;
    row.addEventListener('click', () => {
      const dom = FLOW.editor.view.nodeDOM(item.offset);
      const scroll = $('#scroll');
      if (dom) scroll.scrollTo({ top: scroll.scrollTop + dom.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 40, behavior: 'smooth' });
      FLOW.editor.chain().setTextSelection(item.offset + item.size - 1).focus(null, { scrollIntoView: false }).run();
    });
    row.addEventListener('dragstart', (event) => {
      FLOW.dragSection = index;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.text);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      list.querySelectorAll('.drop-above').forEach((node) => node.classList.remove('drop-above'));
    });
    row.addEventListener('dragover', (event) => {
      if (FLOW.dragSection == null) return;
      event.preventDefault();
      list.querySelectorAll('.drop-above').forEach((node) => node.classList.remove('drop-above'));
      row.classList.add('drop-above');
    });
    row.addEventListener('drop', (event) => {
      event.preventDefault();
      const from = FLOW.dragSection;
      FLOW.dragSection = null;
      if (from == null || from === index) return;
      flowMoveSection(items[from], items[index].offset);
    });
    list.append(row);
  });
  const tail = h('div', { class: 'ol-tail' });
  tail.addEventListener('dragover', (event) => {
    if (FLOW.dragSection == null) return;
    event.preventDefault();
    tail.classList.add('drop-above');
  });
  tail.addEventListener('dragleave', () => tail.classList.remove('drop-above'));
  tail.addEventListener('drop', (event) => {
    event.preventDefault();
    const from = FLOW.dragSection;
    FLOW.dragSection = null;
    tail.classList.remove('drop-above');
    if (from != null) flowMoveSection(items[from], FLOW.editor.state.doc.content.size);
  });
  list.append(tail);
  if (!items.length) list.append(h('div', { class: 'empty', text: 'No headings yet' }));
  const total = items.reduce((sum, item) => sum + item.words, 0);
  box.replaceChildren(
    h('div', { class: 'outline-head' }, h('span', { text: 'Outline' }), h('button', { class: 'round', html: icon('close', 14), title: 'Close', onclick: toggleOutline })),
    list,
  );
  if (total) list.title = '';
  flowOutlineActive();
}

function flowMoveSection(item, target) {
  if (target > item.offset && target < item.end) return;
  const { state } = FLOW.editor;
  const slice = state.doc.slice(item.offset, item.end);
  let tr = state.tr.delete(item.offset, item.end);
  const at = tr.mapping.map(target, -1);
  tr = tr.insert(at, slice.content);
  tr = tr.setSelection(TT.TextSelection.create(tr.doc, at + 1));
  FLOW.editor.view.dispatch(tr.scrollIntoView());
  FLOW.editor.commands.focus();
  toast('Section moved. Ctrl+Z to undo');
}

function flowOutlineActive() {
  const box = $('#outline');
  if (!FLOW.on || box.hidden) return;
  const rows = [...box.querySelectorAll('.flow-outline .ol')];
  if (!rows.length) return;
  const items = flowSections();
  const top = $('#scroll').getBoundingClientRect().top + 120;
  let active = 0;
  items.forEach((item, index) => {
    const dom = FLOW.editor.view.nodeDOM(item.offset);
    if (dom && dom.getBoundingClientRect().top <= top) active = index;
  });
  rows.forEach((row, index) => row.classList.toggle('now', index === active));
}

function flowFocusMode(on) {
  const want = on === undefined ? !document.documentElement.classList.contains('focus-mode') : on;
  if (want && !FLOW.on) flowShow(true);
  document.documentElement.classList.toggle('focus-mode', want);
  if (FLOW.editor) FLOW.editor.view.dispatch(FLOW.editor.state.tr.setMeta('focusMode', want).setMeta('addToHistory', false));
  if (want) {
    if (!FLOW.focusExit) {
      FLOW.focusExit = h('button', { type: 'button', id: 'focusExit', class: 'pill soft', html: `${icon('eye', 15)}<span>Exit focus</span>` });
      FLOW.focusExit.addEventListener('click', () => flowFocusMode(false));
      document.body.append(FLOW.focusExit);
    }
    flowFocusPaint();
    FLOW.editor.commands.focus();
    toast('Focus mode. Esc to exit');
  } else {
    FLOW.root && FLOW.root.querySelectorAll('.focus-now').forEach((node) => node.classList.remove('focus-now'));
  }
}

function flowFocusPaint() {
  if (!document.documentElement.classList.contains('focus-mode') || !FLOW.editor) return;
  const at = FLOW.editor.view.coordsAtPos(FLOW.editor.state.selection.from);
  const scroll = $('#scroll');
  const box = scroll.getBoundingClientRect();
  const want = box.top + box.height * 0.42;
  if (Math.abs(at.top - want) > 60) scroll.scrollBy({ top: at.top - want, behavior: 'smooth' });
}

const FLOW_SHORTCUTS = [
  ['Writing', [
    ['Ctrl+B', 'Bold'], ['Ctrl+I', 'Italic'], ['Ctrl+U', 'Underline'], ['Ctrl+Shift+S', 'Strikethrough'], ['Ctrl+.', 'Superscript'], ['Ctrl+,', 'Subscript'],
    ['Ctrl+M', 'Maths'], ['Shift+Enter', 'Line break'], ['/', 'Insert anything'], ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'],
  ]],
  ['Paragraphs', [
    ['Ctrl+Alt+1 / 2 / 3', 'Heading / Sub-heading / Sub-sub-heading'], ['Ctrl+Alt+0', 'Text'], ['Ctrl+Shift+8', 'Bullets'], ['Ctrl+Shift+7', 'Numbers'],
    ['Tab / Shift+Tab', 'Indent list item'], ['Ctrl+Shift+L / E / R / J', 'Left / Centre / Right / Justify'], ['Alt+↑ / Alt+↓', 'Move paragraph or block'],
    ['# then space', 'Heading'], ['- then space', 'Bullet list'], ['1. then space', 'Numbered list'], ['> then space', 'Quote'],
  ]],
  ['Essay', [
    ['Ctrl+F', 'Find'], ['Ctrl+H', 'Find and replace'], ['Ctrl+K', 'Search actions'], ['Ctrl+Shift+P', 'Print preview'], ['Ctrl+Shift+F', 'Focus mode'],
    ['Ctrl+= / Ctrl+−', 'Zoom in / out'], ['Ctrl+/', 'Shortcuts'],
  ]],
];

function flowShortcuts() {
  const old = document.getElementById('keysSheet');
  if (old) {
    old.remove();
    return;
  }
  const back = h('div', { id: 'keysSheet', class: 'keys-back' });
  const card = h('div', { class: 'keys-card' });
  card.append(h('div', { class: 'keys-head' }, h('span', { text: 'Keyboard shortcuts' }), h('button', { type: 'button', class: 'round', html: icon('close', 16), title: 'Close', onclick: () => back.remove() })));
  const cols = h('div', { class: 'keys-cols' });
  FLOW_SHORTCUTS.forEach(([title, rows]) => {
    const col = h('div', { class: 'keys-col' }, h('div', { class: 'keys-title', text: title }));
    rows.forEach(([keys, what]) => {
      const keyBox = h('span', { class: 'keys-k' });
      keys.split(' / ').forEach((combo, index) => {
        if (index) keyBox.append(h('span', { class: 'keys-or', text: '/' }));
        combo.split('+').forEach((part, i) => {
          if (i) keyBox.append(h('span', { class: 'keys-plus', text: '+' }));
          keyBox.append(h('kbd', { text: part.trim() }));
        });
      });
      col.append(h('div', { class: 'keys-row' }, h('span', { class: 'keys-what', text: what }), keyBox));
    });
    cols.append(col);
  });
  card.append(cols);
  back.append(card);
  back.addEventListener('mousedown', (event) => {
    if (event.target === back) back.remove();
  });
  document.body.append(back);
}

function flowSyllables(word) {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (clean.length <= 3) return 1;
  const trimmed = clean.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  return Math.max(1, (trimmed.match(/[aeiouy]{1,2}/g) || []).length);
}

function flowStatsData() {
  const doc = FLOW.editor.state.doc;
  const texts = [];
  doc.descendants((node) => {
    if (node.type.name === 'figureBlock') return false;
    if (node.isTextblock) {
      texts.push(node.textContent);
      return false;
    }
    return true;
  });
  const all = texts.join('\n');
  const words = all.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];
  const sentences = all.split(/[.!?]+(?=\s|$)/).filter((part) => /[\p{L}\p{N}]/u.test(part));
  const syllables = words.reduce((sum, word) => sum + flowSyllables(word), 0);
  const ease = words.length && sentences.length ? 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllables / words.length) : 0;
  const stop = new Set('the a an and or of to in on for with as by at from that this is are was were be been it its their there which who whom what when where how not but also than then into over more most such these those can could would should may might will has have had do does did i we you he she they them his her our your my me us'.split(' '));
  const counts = new Map();
  words.forEach((word) => {
    const low = word.toLowerCase();
    if (low.length > 3 && !stop.has(low)) counts.set(low, (counts.get(low) || 0) + 1);
  });
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return {
    words: words.length,
    counted: Number(S.words) || 0,
    characters: all.replace(/\n/g, '').length,
    paragraphs: texts.filter((text) => text.trim()).length,
    sentences: sentences.length,
    minutes: Math.max(1, Math.round(words.length / 230)),
    average: sentences.length ? words.length / sentences.length : 0,
    ease,
    top,
  };
}

function flowGoalKey() {
  return `studio.goal.${S.name || 'essay'}`;
}

function flowStats() {
  const old = document.getElementById('statsSheet');
  if (old) {
    old.remove();
    return;
  }
  flowMount();
  if (FLOW.lastSource === null) flowLoad();
  else flowPull();
  const data = flowStatsData();
  const limit = parseInt(String(headerValue('word-limit') || '').replace(/[^\d]/g, ''), 10) || 0;
  let goal = {};
  try {
    goal = JSON.parse(localStorage.getItem(flowGoalKey()) || '{}');
  } catch (error) {
    goal = {};
  }
  const back = h('div', { id: 'statsSheet', class: 'keys-back' });
  const card = h('div', { class: 'keys-card stats-card' });
  const head = h('div', { class: 'keys-head' }, h('span', { text: 'Essay statistics' }), h('button', { type: 'button', class: 'round', html: icon('close', 16), title: 'Close', onclick: () => back.remove() }));
  const tile = (value, label) => h('div', { class: 'stat-tile' }, h('b', { text: value }), h('span', { text: label }));
  const grade = data.ease >= 60 ? 'Easy' : data.ease >= 45 ? 'Standard' : data.ease >= 30 ? 'Academic' : 'Very dense';
  const tiles = h(
    'div',
    { class: 'stat-tiles' },
    tile(data.counted.toLocaleString(), limit ? `of ${limit.toLocaleString()} counted` : 'words counted'),
    tile(data.words.toLocaleString(), 'words in all text'),
    tile(data.characters.toLocaleString(), 'characters'),
    tile(String(data.paragraphs), 'paragraphs'),
    tile(String(data.sentences), 'sentences'),
    tile(`${data.minutes} min`, 'reading time'),
    tile(data.average.toFixed(1), 'words per sentence'),
    tile(grade, `readability ${Math.round(data.ease)}`),
  );
  const words = h('div', { class: 'stat-words' }, h('div', { class: 'keys-title', text: 'Most used words' }), h('div', { class: 'stat-chips' }, ...data.top.map(([word, count]) => h('span', { class: 'stat-chip' }, h('span', { text: word }), h('i', { text: String(count) })))));
  const target = h('input', { type: 'number', min: '0', step: '50', class: 'fpop-input', value: String(goal.target || limit || '') });
  const due = h('input', { type: 'date', class: 'fpop-input', value: goal.due || '' });
  const plan = h('div', { class: 'stat-plan' });
  const paintPlan = () => {
    const want = parseInt(target.value, 10) || 0;
    const date = due.value ? new Date(`${due.value}T23:59:00`) : null;
    localStorage.setItem(flowGoalKey(), JSON.stringify({ target: want, due: due.value }));
    plan.replaceChildren();
    if (!want) return;
    const left = Math.max(0, want - data.counted);
    const share = Math.min(1, data.counted / want);
    const bar = h('div', { class: 'stat-bar' }, h('i'));
    bar.firstChild.style.width = `${share * 100}%`;
    plan.append(bar);
    if (!left) {
      plan.append(h('div', { class: 'stat-line', text: 'Target reached' }));
      return;
    }
    if (!date) {
      plan.append(h('div', { class: 'stat-line', text: `${left.toLocaleString()} words to go` }));
      return;
    }
    const days = Math.ceil((date - new Date()) / 86400000);
    if (days <= 0) plan.append(h('div', { class: 'stat-line late', text: `${left.toLocaleString()} words to go, deadline passed` }));
    else plan.append(h('div', { class: 'stat-line' }, h('b', { text: `${Math.ceil(left / days).toLocaleString()} words a day` }), h('span', { text: ` for ${days} ${days === 1 ? 'day' : 'days'} · ${left.toLocaleString()} to go` })));
  };
  target.addEventListener('input', paintPlan);
  due.addEventListener('input', paintPlan);
  const goalBox = h(
    'div',
    { class: 'stat-goal' },
    h('div', { class: 'keys-title', text: 'Goal' }),
    h('div', { class: 'stat-goal-row' }, h('label', {}, h('span', { text: 'Target words' }), target), h('label', {}, h('span', { text: 'Deadline' }), due)),
    plan,
  );
  card.append(head, tiles, h('div', { class: 'stat-cols' }, goalBox, words));
  back.append(card);
  back.addEventListener('mousedown', (event) => {
    if (event.target === back) back.remove();
  });
  back.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') back.remove();
  });
  document.body.append(back);
  paintPlan();
}

const FLOW_TOUR = [
  {
    title: 'This is Essay Builder',
    text: 'You write straight onto the real pages. The cover, contents, page numbers and footnotes are done for you.',
    centre: true,
  },
  {
    title: 'Just type',
    text: 'Click anywhere and write. Enter starts a new paragraph, and the toolbar styles your text.',
    show: () => flowFocusStart(),
    points: [() => $('#fbar .fpick.style'), () => $('#fbar [data-cmd="bold"]')],
  },
  {
    title: 'Insert anything',
    text: 'Press / on an empty line, or use Insert. Charts, tables, maps, equations and many more.',
    show: () => reveal($('#palette')),
    hide: () => conceal($('#palette')),
    points: [() => $('#insertBtn'), () => [...document.querySelectorAll('#palette .palette-grid button')].find((tile) => tile.title === 'Chart')],
  },
  {
    title: 'Cite and refer',
    text: 'Type @ to cite a source or point to a figure, or use Add. Numbers and references update by themselves.',
    points: [() => $('#fbar .fpick.addmenu')],
  },
  {
    title: 'Change a chart or table',
    text: 'Click it to edit. Tables are edited right on the page.',
    show: () => {
      const dom = FLOW.root.querySelector('.fb:not([data-kind="raw"]):not([data-kind="sources"])');
      if (!dom) return;
      const scroll = $('#scroll');
      scroll.scrollTop += dom.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 160;
      dom.classList.add('tour-hover');
      TOUR.flowFig = dom;
    },
    hide: () => TOUR.flowFig && TOUR.flowFig.classList.remove('tour-hover'),
    points: [() => TOUR.flowFig && TOUR.flowFig.querySelector('.fb-bar')],
  },
  {
    title: 'Your outline',
    text: 'Jump to any section, see its word count, and drag sections to reorder them.',
    show: () => {
      TOUR.outlineWas = localStorage.getItem('studio.outline');
      localStorage.setItem('studio.outline', '1');
      renderOutline();
    },
    hide: () => {
      localStorage.setItem('studio.outline', TOUR.outlineWas === '1' ? '1' : '0');
      renderOutline();
    },
    points: [() => $('#outline')],
  },
  {
    title: 'Word count',
    text: 'Counted the way the IB counts, against your word limit. Select text to count just that.',
    points: [() => $('#statusPill .words') || $('#statusPill span:nth-child(2)')],
  },
  { title: 'Hand it in', text: 'It saves by itself as you go. Export when you are ready.', points: [() => $('#export')] },
];

function flowShow(on) {
  const scroll = $('#scroll');
  const turn = FLOW.root && FLOW.on !== on && S.name ? scroll.scrollTop / Math.max(1, scroll.scrollHeight - scroll.clientHeight) : null;
  if (FLOW.on !== on && typeof TOUR !== 'undefined' && TOUR.root) endTour();
  flowMount();
  FLOW.on = on;
  document.documentElement.classList.toggle('flow-mode', on);
  FLOW.root.hidden = !on;
  $('#pages').hidden = on;
  FLOW.bar.hidden = !on;
  localStorage.setItem('studio.view', on ? 'write' : 'pages');
  flowPaintToggle();
  if (on) {
    closeEditor(true);
    closePanel();
    S.sel = null;
    if (FLOW.lastSource !== S.source) {
      if (FLOW.lastSource === null) flowLoad();
      else flowPull();
    }
    flowStyle();
    flowAfterRender(S.lastSent);
  } else {
    flowSlashClose();
    flowPopClose();
    if (FLOW.find) conceal(FLOW.find.box);
    closePanel();
    layout();
  }
  renderOutline();
  if (turn !== null) scroll.scrollTop = turn * Math.max(0, scroll.scrollHeight - scroll.clientHeight);
  if (on && turn !== null) FLOW.editor.commands.focus(null, { scrollIntoView: false });
}

function flowPaintToggle() {
  const toggle = $('#viewBtn');
  if (!toggle) return;
  toggle.innerHTML = FLOW.on ? `${icon('page', 16)}<span>Pages</span>` : `${icon('paragraph', 16)}<span>Write</span>`;
  toggle.title = FLOW.on ? 'See the exact pages (Ctrl+Shift+P)' : 'Back to writing (Ctrl+Shift+P)';
}

function flowFocusStart() {
  let target = null;
  FLOW.editor.state.doc.descendants((node, pos) => {
    if (target !== null) return false;
    if (node.isTextblock) {
      target = pos + node.content.size + 1;
      return false;
    }
    return true;
  });
  const { doc } = FLOW.editor.state;
  if (target !== null && target === doc.content.size - 1 && doc.lastChild.type.name === 'heading') {
    FLOW.editor.view.dispatch(FLOW.editor.state.tr.insert(doc.content.size, FLOW.editor.schema.nodes.paragraph.create()).setMeta('addToHistory', false));
    target += 2;
  }
  if (target === null) FLOW.editor.commands.focus('end', { scrollIntoView: false });
  else FLOW.editor.chain().setTextSelection(target).focus(null, { scrollIntoView: false }).run();
  $('#scroll').scrollTop = 0;
}

function flowFitPalette() {
  const palette = $('#palette');
  if (!palette || palette.hidden) return;
  palette.style.maxHeight = '';
  if (!FLOW.on || !FLOW.bar || FLOW.bar.hidden) return;
  const box = palette.getBoundingClientRect();
  const limit = FLOW.bar.getBoundingClientRect().bottom + 12;
  if (box.top >= limit) return;
  const zoom = palette.offsetHeight ? box.height / palette.offsetHeight : 1;
  palette.style.maxHeight = `${Math.max(240, (box.bottom - limit) / (zoom || 1))}px`;
  palette.style.overflowY = 'auto';
  const settle = (tries) => {
    const now = palette.getBoundingClientRect();
    const over = limit - now.top;
    if (over <= 1 || tries <= 0) return;
    palette.style.maxHeight = `${Math.max(240, parseFloat(palette.style.maxHeight) - over / (zoom || 1) - 2)}px`;
    requestAnimationFrame(() => settle(tries - 1));
  };
  setTimeout(() => settle(3), 260);
}

function flowFitScale() {
  const page = S.pages.length ? S.pages[0] : { w: 595 };
  const scroll = $('#scroll');
  const shown = (node) => Boolean(node && !node.hidden && !node.classList.contains('leaving'));
  const panel = shown($('#panel')) || shown(document.getElementById('checkSheet'));
  let side = 0;
  if (shown($('#outline'))) side += 250;
  if (panel) side += 350;
  else if (FLOW.notes && FLOW.notes.length) side += 260;
  return Math.max(0.45, Math.min(1.6, (scroll.clientWidth - 90 - side) / page.w));
}

function flowWanted() {
  return localStorage.getItem('studio.view') !== 'pages';
}

function flowHook() {
  flowPaletteActions();
  const baseLoad = load;
  load = function (state) {
    baseLoad(state);
    if (!state.open) {
      if (FLOW.root) {
        FLOW.root.hidden = true;
        FLOW.bar.hidden = true;
        document.documentElement.classList.remove('flow-mode');
      }
      return;
    }
    flowMount();
    FLOW.lastSource = null;
    FLOW.crops = new Map();
    FLOW.lastRects = null;
    S.lastSent = undefined;
    flowLoad();
    flowNotesLoad();
    FLOW.noteOn = null;
    flowShow(flowWanted());
    flowNotesRefresh();
    if (FLOW.on) setTimeout(flowFocusStart, 50);
  };
  const baseApply = applyResult;
  applyResult = async function (result, sent) {
    await baseApply(result, sent);
    if (!result.fatal && !(result.errors && result.errors.length)) S.lastSent = sent;
    if (FLOW.on) {
      flowPull();
      flowAfterRender(sent);
    }
  };
  const baseInsert = insertTemplate;
  insertTemplate = function (template) {
    if (FLOW.on) return flowInsertTemplate(template);
    return baseInsert(template);
  };
  const baseCommit = commitPanel;
  commitPanel = function (delay) {
    baseCommit(delay);
    if (FLOW.on) flowPull();
  };
  const baseSchedule = schedule;
  schedule = function (delay) {
    baseSchedule(delay);
    if (FLOW.on && S.source !== FLOW.lastSource) flowPull();
  };
  const baseScroll = scrollToRange;
  scrollToRange = function (range) {
    if (!FLOW.on) return baseScroll(range);
    if (FLOW.header.length && range.start <= FLOW.header.length) {
      openSettings();
      return;
    }
    const entries = FLOW.map.filter(Boolean);
    const entry = entries.find((item) => item.start <= range.start && range.start <= item.end) || entries.find((item) => item.start >= range.start) || entries[entries.length - 1];
    if (!entry) return;
    if (entry.kind && !['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'callout'].includes(entry.kind)) {
      const dom = FLOW.editor.view.nodeDOM(entry.offset);
      const scroll = $('#scroll');
      if (dom) scroll.scrollTo({ top: scroll.scrollTop + dom.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 140, behavior: 'smooth' });
      FLOW.editor.chain().setNodeSelection(entry.offset).run();
      if (dom) {
        dom.classList.add('flow-new');
        setTimeout(() => dom.classList.remove('flow-new'), 1200);
      }
      return;
    }
    const dom = FLOW.editor.view.nodeDOM(entry.offset);
    if (!dom) return;
    const scroll = $('#scroll');
    scroll.scrollTo({ top: scroll.scrollTop + dom.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 140, behavior: 'smooth' });
    FLOW.editor.chain().setTextSelection(entry.offset + 1).focus(null, { scrollIntoView: false }).run();
  };
  const baseExitPage = cvExitPage;
  cvExitPage = function () {
    baseExitPage();
    if (FLOW.backToWrite) {
      FLOW.backToWrite = false;
      flowShow(true);
    }
  };
  const baseSelect = select;
  select = function (range) {
    const texty = range && (TEXT_KINDS.has(range.kind) || (typeof isRichText === 'function' && isRichText(range)) || (typeof isProse === 'function' && isProse(range)));
    if (FLOW.on || !texty || range.kind === 'blank' || (typeof CV !== 'undefined' && CV.mode)) return baseSelect(range);
    const start = range.start;
    flowShow(true);
    requestAnimationFrame(() => scrollToRange({ start, end: start, kind: 'para' }));
  };
  $('#pages').addEventListener('mousedown', (event) => {
    if (event.button !== 0 || (S.edit && S.edit.ta && S.edit.ta.contains && S.edit.ta.contains(event.target))) return;
    S.clickAt = { x: event.clientX, y: event.clientY, t: Date.now() };
  }, true);
  const basePosition = positionSheet;
  positionSheet = function () {
    if (!FLOW.on) return basePosition();
    if (!SHEET.root || !SHEET.range) return;
    const host = flowDomFor(SHEET.range.uid);
    if (!host) return;
    if (SHEET.root.parentNode !== host) host.append(SHEET.root);
    host.classList.toggle('sheeting', SHEET.mode !== 'below');
    SHEET.root.style.left = '';
    SHEET.root.style.top = '';
    SHEET.root.style.width = '';
    SHEET.root.style.minHeight = '';
    SHEET.root.style.fontFamily = docFont();
    SHEET.root.style.fontSize = `${(parseFloat(S.settings['font-size']) || 12) * 0.92 * FLOW_L}px`;
    SHEET.root.style.setProperty('--pt', `${FLOW_L}px`);
  };
  const baseCloseSheet = closeSheet;
  closeSheet = function () {
    baseCloseSheet();
    if (FLOW.root) FLOW.root.querySelectorAll('.fb.sheeting').forEach((node) => node.classList.remove('sheeting'));
  };
  const pageTour = TOUR_STEPS.slice();
  const baseTour = startTour;
  startTour = function (again = false) {
    TOUR_STEPS.splice(0, TOUR_STEPS.length, ...(FLOW.on ? FLOW_TOUR : pageTour));
    return baseTour(again);
  };
  const baseOutline = renderOutline;
  renderOutline = function () {
    if (FLOW.on && FLOW.editor) return flowOutline();
    return baseOutline();
  };
  let outlineTimer = 0;
  FLOW.outlineSoon = () => {
    clearTimeout(outlineTimer);
    outlineTimer = setTimeout(() => FLOW.on && flowOutline(), 400);
  };
  $('#scroll').addEventListener('scroll', () => {
    if (FLOW.on) requestAnimationFrame(flowOutlineActive);
  }, { passive: true });
  const baseHeadings = headingList;
  headingList = function () {
    if (!FLOW.on || !FLOW.editor) return baseHeadings();
    const out = [];
    FLOW.editor.state.doc.forEach((node, offset) => {
      if (node.type.name !== 'heading') return;
      const entry = FLOW.map.find((item) => item && item.offset === offset);
      if (entry) out.push({ level: node.attrs.level, text: node.textContent, range: flowRangeFor(entry) });
    });
    return out;
  };
  const baseLayout = layout;
  layout = function () {
    if (FLOW.on) {
      S.scale = S.zoom === 'fit' ? flowFitScale() : S.zoom === 'page' ? pageScale() : S.zoom;
      if (zoomPick) zoomPick.setLabel(`${Math.round((S.scale / (96 / 72)) * 100)}%`);
      flowZoomBox();
      if (!FLOW.styled) {
        FLOW.styled = true;
        flowStyle();
      }
      return;
    }
    baseLayout();
  };
  const zoomAt = (scale, x, y) => {
    const scroll = $('#scroll');
    const before = FLOW.zoomer.getBoundingClientRect();
    const old = flowZoom();
    const lx = (x - before.left) / old;
    const ly = (y - before.top) / old;
    S.zoom = scale;
    S.scale = scale;
    flowZoomBox();
    const after = FLOW.zoomer.getBoundingClientRect();
    const now = flowZoom();
    scroll.scrollLeft += after.left + lx * now - x;
    scroll.scrollTop += after.top + ly * now - y;
    if (zoomPick) zoomPick.setLabel(`${Math.round((scale / PX) * 100)}%`);
    clearTimeout(FLOW.sharpTimer);
    FLOW.sharpTimer = setTimeout(async () => {
      const dpi = S.dpi;
      await sharpen();
      if (S.dpi === dpi || !FLOW.on) return;
      flowPaintPages();
      FLOW.root.querySelectorAll('.fb').forEach((dom) => dom.flowRepaint && dom.flowRepaint());
      FLOW.front.querySelectorAll('img').forEach((img, index) => {
        if (S.pages[index] && img.getAttribute('src') !== S.pages[index].url) img.src = S.pages[index].url;
      });
    }, 400);
  };
  const basePinch = pinchWheel;
  pinchWheel = function (event) {
    if (!FLOW.on || !FLOW.zoomer) return basePinch(event);
    cancelAnimationFrame(FLOW.zoomAnim);
    const unit = event.deltaMode === 1 ? 0.04 : event.deltaMode === 2 ? 0.5 : 0.0016;
    const step = Math.max(-0.35, Math.min(0.35, -event.deltaY * unit));
    const next = Math.max(0.25 * PX, Math.min(4 * PX, (S.scale || PX) * Math.exp(step)));
    zoomAt(next, event.clientX, event.clientY);
  };
  const baseSetZoom = setZoom;
  setZoom = function (value) {
    if (!FLOW.on || !FLOW.zoomer) return baseSetZoom(value);
    const scroll = $('#scroll');
    const box = scroll.getBoundingClientRect();
    const from = S.scale || PX;
    S.zoom = value;
    const to = value === 'fit' ? flowFitScale() : value === 'page' ? pageScale() : value;
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    cancelAnimationFrame(FLOW.zoomAnim);
    const start = performance.now();
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = (time) => {
      const t = still ? 1 : Math.min(1, (time - start) / 220);
      const ease = 1 - Math.pow(1 - t, 3);
      zoomAt(from + (to - from) * ease, x, y);
      if (t < 1) FLOW.zoomAnim = requestAnimationFrame(tick);
      else {
        S.zoom = value;
        if (FLOW.editor) FLOW.editor.commands.focus(null, { scrollIntoView: false });
      }
    };
    FLOW.zoomAnim = requestAnimationFrame(tick);
  };
  let sideTimer = 0;
  const sideChanged = () => {
    clearTimeout(sideTimer);
    sideTimer = setTimeout(() => {
      if (FLOW.on && S.zoom === 'fit') layout();
    }, 60);
  };
  const sides = new MutationObserver(sideChanged);
  ['#outline', '#panel'].forEach((selector) => {
    const node = $(selector);
    if (node) sides.observe(node, { attributes: true, attributeFilter: ['hidden', 'class'] });
  });
  new MutationObserver((records) => {
    if (records.some((record) => [...record.addedNodes, ...record.removedNodes].some((node) => node.id === 'checkSheet'))) sideChanged();
  }).observe(document.body, { childList: true });
  FLOW.sideChanged = sideChanged;
  const palette = $('#palette');
  if (palette) {
    new MutationObserver(() => requestAnimationFrame(flowFitPalette)).observe(palette, { attributes: true, attributeFilter: ['hidden'] });
    window.addEventListener('resize', () => requestAnimationFrame(flowFitPalette));
  }
  const baseHome = goHome;
  goHome = async function () {
    flowSlashClose();
    flowPopClose();
    if (FLOW.find) conceal(FLOW.find.box);
    if (FLOW.root) {
      FLOW.root.hidden = true;
      FLOW.bar.hidden = true;
    }
    document.documentElement.classList.remove('flow-mode');
    return baseHome();
  };
  let markTimer = 0;
  FLOW_HOOKED = true;
  document.addEventListener('keydown', (event) => {
    const open = S.name && !document.documentElement.classList.contains('home');
    const mod = event.ctrlKey || event.metaKey;
    if (mod && event.shiftKey && event.key.toLowerCase() === 'p' && open) {
      event.preventDefault();
      event.stopPropagation();
      flowShow(!FLOW.on);
    } else if (mod && event.shiftKey && event.key.toLowerCase() === 'f' && open) {
      event.preventDefault();
      event.stopPropagation();
      flowFocusMode();
    } else if (mod && !event.shiftKey && event.key === '/') {
      event.preventDefault();
      event.stopPropagation();
      flowShortcuts();
    } else if (mod && !event.altKey && open && ['=', '+', '-', '0'].includes(event.key) && typeof zoomStep === 'function') {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === '0') setZoom('fit');
      else zoomStep(event.key === '-' ? -1 : 1);
      if (FLOW.on) FLOW.editor.commands.focus(null, { scrollIntoView: false });
    } else if (event.key === 'Escape' && (document.getElementById('keysSheet') || document.getElementById('statsSheet'))) {
      event.preventDefault();
      event.stopPropagation();
      (document.getElementById('statsSheet') || document.getElementById('keysSheet')).remove();
    } else if (event.key === 'Escape' && document.documentElement.classList.contains('focus-mode') && !FLOW.slash && !FLOW.pop) {
      event.preventDefault();
      event.stopPropagation();
      flowFocusMode(false);
    }
  }, true);
  const baseItems = cmdItems;
  cmdItems = function () {
    const items = baseItems();
    const open = Boolean(S.name) && !document.documentElement.classList.contains('home');
    const add = (label, group, run, words, iconName) => items.unshift({ label, group, run, words: `${label} ${group} ${words}`.toLowerCase(), icon: iconName });
    add('Keyboard shortcuts', 'Help', flowShortcuts, 'keys hotkeys help', 'textIcon');
    if (typeof whatsNew === 'function') add("What's new", 'Help', () => whatsNew(true), 'update version release changes', 'sparkle');
    if (typeof helpOpen === 'function') add('Help', 'Help', helpOpen, 'questions faq how support guide f1', 'info');
    if (open && typeof saveAsTemplate === 'function') add('Save as template', 'Essay', saveAsTemplate, 'reuse my own starter layout', 'copy');
    if (open) {
      add('Find and replace', 'Edit', () => flowFindOpen(true), 'search replace swap ctrl h', 'search');
      add('Focus mode', 'View', () => flowFocusMode(), 'zen distraction free typewriter', 'eye');
      add(FLOW.on ? 'Print preview' : 'Back to writing', 'View', () => flowShow(!FLOW.on), 'pages view layout exact pdf image', 'page');
    }
    return items;
  };
  window.addEventListener('resize', () => {
    clearTimeout(markTimer);
    markTimer = setTimeout(() => FLOW.on && flowMarkers(), 120);
  });
  const dock = $('#dock');
  if (dock) {
    const toggle = h('button', { id: 'viewBtn', class: 'pill soft', type: 'button' });
    toggle.addEventListener('click', () => flowShow(!FLOW.on));
    dock.insertBefore(toggle, dock.querySelector('.sep'));
    flowPaintToggle();
  }
}

let FLOW_HOOKED = false;
flowHook();
