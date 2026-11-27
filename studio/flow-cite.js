function flowCiteParse(src) {
  const text = String(src || '').trim();
  let match = text.match(/^\[(-?)@([^,\];]+)(?:\s*,\s*([^\];]+))?\]$/);
  if (match) return { key: match[2].trim(), page: (match[3] || '').trim(), sentence: false, hideName: match[1] === '-' };
  match = text.match(/^@([^\s[]+)(?: ?\[([^\]]+)\])?$/);
  if (match) return { key: match[1], page: (match[2] || '').trim(), sentence: true, hideName: false };
  return null;
}

function flowCiteSource(parts) {
  const page = parts.page.trim();
  if (parts.sentence) return `@${parts.key}${page ? ` [${page}]` : ''}`;
  return `[${parts.hideName ? '-' : ''}@${parts.key}${page ? `, ${page}` : ''}]`;
}

function flowCiteTitle(key) {
  const info = S.sources && S.sources[key];
  return String((info && (info.label || info.title)) || info || key);
}

function flowCiteCard(anchor, pos, focusPage = false) {
  const node = FLOW.editor.state.doc.nodeAt(pos);
  const parts = node && flowCiteParse(node.attrs.src);
  if (!parts) return flowCitePop(anchor, { pos, remove: () => flowCiteRemove(pos) });
  flowPopClose();
  const box = h('div', { class: 'fmenu fcite' });
  const write = () => {
    const live = FLOW.editor.state.doc.nodeAt(pos);
    if (!live || live.type.name !== 'chip') return;
    const src = flowCiteSource(parts);
    if (src === live.attrs.src) return;
    const label = (S.cites && S.cites[src.replace(/^\[|\]$/g, '')]) || (S.cites && S.cites[src]) || live.attrs.label || `(${parts.key})`;
    FLOW.editor.view.dispatch(FLOW.editor.state.tr.setNodeMarkup(pos, null, { ...live.attrs, src, label }));
  };
  const source = h('button', { type: 'button', class: 'fcite-source', title: 'Change the source' }, h('span', { class: 'fcite-icon', html: icon('bibliography', 16) }), h('span', { class: 'fcite-name', text: flowCiteTitle(parts.key) }), h('span', { class: 'fcite-change', text: 'Change' }));
  source.addEventListener('mousedown', (event) => {
    event.preventDefault();
    flowPopClose();
    flowCitePop(anchor, {
      pos,
      remove: () => flowCiteRemove(pos),
      keep: (key) => {
        parts.key = key;
        write();
        setTimeout(() => flowCiteCard(anchor, pos), 0);
      },
    });
  });
  const page = h('input', { type: 'text', class: 'fpop-input fcite-page', placeholder: 'For example 45 or 45-47', spellcheck: 'false', value: parts.page });
  page.addEventListener('input', () => {
    parts.page = page.value;
    if (typeof paintForms === 'function') paintForms();
    clearTimeout(FLOW.citeTimer);
    FLOW.citeTimer = setTimeout(write, 300);
  });
  page.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      clearTimeout(FLOW.citeTimer);
      write();
      flowPopClose();
      FLOW.editor.chain().setTextSelection(pos + 1).focus().run();
    }
  });
  const style = String((typeof headerValue === 'function' && headerValue('citations')) || (S.settings && S.settings.citations) || 'apa').toLowerCase();
  const samples = { mla: ['(Smith 45)', 'Smith (45)'], chicago: ['(Smith 2020, 45)', 'Smith (2020, 45)'], ieee: ['[1, p. 45]', 'Smith [1, p. 45]'] };
  const [brackets, sentence] = samples[style] || ['(Smith, 2020, p. 45)', 'Smith (2020, p. 45)'];
  const plain = (text) => {
    const shown = parts.page.trim();
    if (shown) return text.replace(/45/, shown.replace(/^pp?\.\s*/i, ''));
    return text.replace(/ \(45\)/, '').replace(/,? (p\. )?45/, '').replace(' ()', '').replace('()', '');
  };
  const seg = h('div', { class: 'fcite-forms' });
  const paintForms = () =>
    seg.replaceChildren(
      ...[
        { sentence: false, text: 'In brackets', example: plain(brackets) },
        { sentence: true, text: 'Name in my sentence', example: plain(sentence) },
      ].map((form) => {
        const button = h('button', { type: 'button', class: `fcite-form${parts.sentence === form.sentence ? ' on' : ''}` }, h('b', { text: form.text }), h('span', { text: form.example }));
        button.addEventListener('mousedown', (event) => {
          event.preventDefault();
          parts.sentence = form.sentence;
          if (form.sentence) parts.hideName = false;
          write();
          paintForms();
        });
        return button;
      }),
    );
  paintForms();
  const remove = h('button', { type: 'button', class: 'fcite-remove', html: `${icon('trash', 14)}<span>Remove citation</span>` });
  remove.addEventListener('mousedown', (event) => {
    event.preventDefault();
    flowPopClose();
    flowCiteRemove(pos);
  });
  box.append(source, h('label', { class: 'fcite-label', text: 'Page or pages (optional)' }), page, h('div', { class: 'fcite-label', text: 'How it appears' }), seg, remove);
  flowPlacePop(box, anchor);
  if (focusPage) setTimeout(() => page.focus(), 30);
}

function flowCiteRemove(pos) {
  const live = FLOW.editor.state.doc.nodeAt(pos);
  if (!live) return;
  FLOW.editor.view.dispatch(FLOW.editor.state.tr.delete(pos, pos + 1));
  FLOW.editor.commands.focus();
}
