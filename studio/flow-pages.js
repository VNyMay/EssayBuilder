const FLOW_LANGS = { english: 'en', french: 'fr', francais: 'fr', français: 'fr', arabic: 'ar', عربي: 'ar', العربية: 'ar', spanish: 'es', español: 'es', german: 'de', deutsch: 'de', italian: 'it', portuguese: 'pt', chinese: 'zh', mandarin: 'zh', japanese: 'ja', korean: 'ko', russian: 'ru', hindi: 'hi', dutch: 'nl', turkish: 'tr' };

function flowLang(value) {
  const text = String(value || '').trim().toLowerCase();
  if (/^[a-z]{2}(-[a-z]{2})?$/.test(text)) return text;
  return FLOW_LANGS[text] || 'en';
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
  if (FLOW.editor) FLOW.editor.view.dom.lang = flowLang(set.language);
  root.style.setProperty('--pt', `${scale}px`);
  root.style.setProperty('--u', `${scale * zoom}px`);
  root.style.setProperty('--sheet-w', `${page.w * scale}px`);
  root.style.setProperty('--sheet-h', `${page.h * scale}px`);
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

const FLOW_REF_NAMES = { fig: 'Figure', tbl: 'Table', eq: 'Equation', sec: 'Section', code: 'Listing', def: 'Definition', thm: 'Theorem' };

function flowChipify() {
  const state = FLOW.editor.state;
  const type = state.schema.nodes.chip;
  const caret = state.selection.empty ? state.selection.from : -1;
  const found = [];
  state.doc.descendants((node, pos) => {
    if (!node.isText || node.marks.some((mark) => mark.type.name === 'code')) return;
    const pattern = /(^|[^\w@/.[\\-])(@[A-Za-z][\w-]*\d[\w-]*(?: ?\[[^\]@;]+\](?![({]))?)/g;
    let match = pattern.exec(node.text);
    while (match) {
      const key = match[2].replace(/ ?\[([^\]]+)\]$/, ' [$1]');
      if (S.cites && S.cites[key]) {
        const from = pos + match.index + match[1].length;
        found.push({ from, to: from + match[2].length, kind: 'cite', src: key, label: S.cites[key] });
      }
      match = pattern.exec(node.text);
    }
    const refs = /(^|[^\w@/.])@(fig|tbl|eq|sec|code|def|thm):([\w.-]*\w)/g;
    let ref = refs.exec(node.text);
    while (ref) {
      const from = pos + ref.index + ref[1].length;
      const to = from + ref[0].length - ref[1].length;
      const key = `${ref[2]}:${ref[3]}`;
      if (to !== caret) found.push({ from, to, kind: 'ref', src: `@${key}`, label: (S.labels && S.labels[key]) || `${FLOW_REF_NAMES[ref[2]]} ?` });
      ref = refs.exec(node.text);
    }
  });
  if (!found.length) return;
  let tr = state.tr;
  found.sort((a, b) => b.from - a.from).forEach((item) => {
    tr = tr.replaceWith(item.from, item.to, type.create({ kind: item.kind, src: item.src, label: item.label }));
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
    if (kind === 'ref') {
      const missing = !(S.labels && S.labels[String(dom.dataset.src || '').replace(/^@/, '')]);
      dom.classList.toggle('missing', missing);
      dom.title = missing ? 'This figure or table does not exist. Click to pick the right one.' : '';
    }
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

function flowFitPages(typing = false) {
  const info = FLOW.pageInfo;
  if (!info || !FLOW.gaps || !FLOW.sheet || !FLOW.on || !S.pages.length || !S.pages[info.last]) return;
  const scale = FLOW_L;
  const zoom = flowZoom();
  FLOW.sheet.style.paddingTop = `${Math.max(0, info.firstTop) * scale}px`;
  const sheetTop = () => FLOW.sheet.getBoundingClientRect().top;
  const at = (value) => value / zoom;
  let above = new Set();
  if (typing && FLOW.editor) {
    let caret = null;
    try {
      caret = FLOW.editor.view.coordsAtPos(FLOW.editor.state.selection.from).top;
    } catch (error) {
      caret = null;
    }
    if (caret !== null) above = new Set(FLOW.gaps.filter((gap) => gap.kind !== 'end' && gap.el.isConnected && gap.el.getBoundingClientRect().bottom < caret - 4));
  }
  FLOW.gaps.forEach((gap) => {
    const el = gap.el;
    if (!el.isConnected || above.has(gap)) return;
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
  const sign = JSON.stringify([info.first, info.last, info.tops, info.ends, FLOW_L, S.pages.slice(info.first, info.last + 1).map((page) => [page.url, page.w, page.h])]);
  if (sign !== FLOW.paintSign || !FLOW.marks.childElementCount) {
    FLOW.paintSign = sign;
    flowPaintPages();
  }
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
  if (FLOW.sheet) FLOW.sheet.classList.toggle('paged', sheets.length > 0);
  if (FLOW.notes && FLOW.notes.length) flowNotesPlace();
}
