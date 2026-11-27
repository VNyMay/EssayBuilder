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

const FLOW_RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const FLOW_STRONG = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]|[֐-ࣿיִ-﷿ﹰ-﻿]/;

function flowDirDeco(doc) {
  if (!FLOW_RTL.test(doc.textContent)) return TT.DecorationSet.empty;
  const deco = [];
  doc.forEach((node, offset) => {
    if (!node.isBlock || node.type.name === 'figureBlock') return;
    const first = (node.textContent.match(FLOW_STRONG) || [''])[0];
    if (first && FLOW_RTL.test(first)) deco.push(TT.Decoration.node(offset, offset + node.nodeSize, { dir: 'rtl' }));
  });
  return TT.DecorationSet.create(doc, deco);
}

const FlowDir = () => TT.Extension.create({
  name: 'flowDir',
  addProseMirrorPlugins() {
    const key = new TT.PluginKey('flowDir');
    return [new TT.Plugin({
      key,
      state: {
        init: (_, state) => flowDirDeco(state.doc),
        apply: (tr, old) => (tr.docChanged ? flowDirDeco(tr.doc) : old),
      },
      props: {
        decorations: (state) => key.getState(state),
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
  return TT.DecorationSet.create(doc, flowHeadingNumbers(doc).map((item) => {
    const parent = doc.resolve(item.pos).parent;
    const first = parent && parent.firstChild;
    const mark = first && first.marks.find((entry) => entry.type.name === 'fmt');
    const style = mark ? fmtStyle(attrList(mark.attrs.attrs)) : '';
    const size = (style.match(/font-size:[^;]+/) || [''])[0];
    return TT.Decoration.widget(item.pos, () => {
      const span = document.createElement('span');
      span.className = 'hnum';
      span.contentEditable = 'false';
      span.textContent = item.text;
      if (size) span.style.cssText = size;
      return span;
    }, { side: -1, key: `n${item.text}${size}` });
  }));
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
    FlowDir(),
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
          flowFitPages(true);
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
      else if (S.settingsOpen) closeSettings();
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
