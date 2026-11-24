const CMD = { open: false, items: [], shown: [], index: 0, root: null, input: null, list: null };

const CMD_WORDS = {
  table: 'spreadsheet grid rows columns',
  chart: 'graph bar pie line plot data',
  equation: 'maths math formula',
  image: 'picture photo upload',
  map: 'country geography atlas',
  molecule: 'chemistry smiles structure compound',
  pagebreak: 'new page',
  list: 'bullets numbers',
  quote: 'quotation',
  sources: 'references bibliography citation cite',
  bibliography: 'references works cited citation',
  heading: 'title section chapter',
  paragraph: 'text write',
  timeline: 'dates history',
  glossary: 'terms definitions',
  footnote: 'note bottom',
  venn: 'sets probability',
  circuit: 'physics electricity',
  fishbone: 'cause effect ishikawa',
  swot: 'business strengths weaknesses',
  supplydemand: 'economics curve',
};

function templateWords(template) {
  return `${template.label} ${template.group} ${template.id || ''} ${template.kind || ''} ${CMD_WORDS[template.id] || ''}`.toLowerCase();
}

function templateMatches(template, term) {
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = templateWords(template).split(/[^a-z0-9]+/).filter(Boolean);
  return words.every((word) => hay.some((part) => part.startsWith(word)));
}

function cmdItems() {
  const items = [];
  const open = Boolean(S.name) && !document.documentElement.classList.contains('home');
  const add = (label, group, run, words = '', iconName = 'arrow') => items.push({ label, group, run, words: `${label} ${group} ${words}`.toLowerCase(), icon: iconName });
  if (!open) {
    add('New essay', 'Start', () => $('#newEssay').click(), 'create blank', 'newFile');
    add('Open essay', 'Start', () => $('#openEssay').click(), 'file browse', 'folder');
  } else {
    add('Export PDF', 'Essay', () => $('#export').click(), 'save download print', 'export');
    add('Cover designer', 'Essay', () => openCover(), 'title page front', 'cover');
    add('Edit cover on the page', 'Essay', () => openCoverFree(), 'design own cover word count fields custom', 'shapes');
    add('Settings', 'Essay', () => openSettings(), 'font paper margins accent contents', 'gear');
    add('Previous versions', 'Essay', async () => {
      openSettings();
      await openVersions();
    }, 'history restore backup', 'clock');
    add('Make a copy', 'Essay', () => makeCopy(), 'duplicate', 'copy');
    add('All essays', 'Essay', () => goHome(), 'home back menu', 'home');
    add('New page', 'Essay', () => addPageAfter(pageInView()), 'blank page add break', 'newFile');
    add('Outline', 'View', () => toggleOutline(), 'headings navigation contents', 'list');
    add('Show the tour', 'Help', () => startTour(true), 'guide tutorial help how start basics', 'sparkle');
    add('Undo', 'Edit', () => undo(-1), 'back', 'undo');
    add('Redo', 'Edit', () => undo(1), 'forward', 'redo');
    [['Fit width', 'fit'], ['Fit page', 'page'], ['75%', 0.75 * (96 / 72)], ['100%', 96 / 72], ['125%', 1.25 * (96 / 72)], ['150%', 1.5 * (96 / 72)], ['200%', 2 * (96 / 72)]].forEach(([label, value]) => {
      add(`Zoom ${label}`, 'View', () => setZoom(value), 'size magnify', 'search');
    });
    ['A4', 'Letter', 'A5', 'Legal'].forEach((paper) => add(`Paper ${paper}`, 'Page', () => setHeader('paper', paper), 'page size', 'page'));
    ['10', '11', '12', '13', '14'].forEach((size) => add(`Font size ${size}`, 'Page', () => setHeader('font-size', size), 'text size', 'textIcon'));
    add('Contents page on', 'Page', () => setHeader('contents', 'yes'), 'table of contents toc', 'list');
    add('Contents page off', 'Page', () => setHeader('contents', 'no'), 'table of contents toc remove', 'list');
    add('Cover page on', 'Page', () => setHeader('cover', 'yes'), 'title page', 'cover');
    add('Cover page off', 'Page', () => setHeader('cover', 'no'), 'title page remove', 'cover');
    headingList().forEach((item) => add(item.text, 'Go to', () => scrollToRange(item.range), 'jump heading section', 'heading'));
    TEMPLATES.forEach((template) => add(template.label, `Insert · ${template.group}`, () => insertTemplate(template), `${template.id} ${CMD_WORDS[template.id] || ''}`, template.icon));
  }
  THEMES.forEach((theme) => add(`Theme ${theme.label || theme.name || theme.value}`, 'Look', () => {
    UI.theme = theme.value || theme.id || theme.name;
    applyAppearance();
  }, 'colour appearance dark light', 'palette'));
  [['Small', 1], ['Medium', 1.12], ['Large', 1.25], ['Extra large', 1.4]].forEach(([label, value]) => add(`Interface size ${label}`, 'Look', () => tweenSize(value), 'bigger smaller text zoom', 'eye'));
  return items;
}

function cmdScore(item, words) {
  let score = 0;
  for (const word of words) {
    const at = item.words.indexOf(word);
    if (at < 0) return -1;
    score += at === 0 ? 0 : item.label.toLowerCase().includes(word) ? 2 : 6;
  }
  return score;
}

function cmdFilter() {
  const words = CMD.input.value.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = CMD.items
    .map((item, order) => ({ item, order, score: words.length ? cmdScore(item, words) : 0 }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score || a.order - b.order);
  CMD.shown = scored.slice(0, 40).map((entry) => entry.item);
  CMD.index = 0;
  cmdDraw();
}

function cmdDraw() {
  CMD.list.replaceChildren(
    ...CMD.shown.map((item, index) => h('button', {
      type: 'button',
      class: `cmd-row${index === CMD.index ? ' on' : ''}`,
      'data-i': index,
      html: `<span class="cmd-icon">${icon(item.icon, 17)}</span><span class="cmd-label"></span><span class="cmd-group"></span>`,
      onmousemove: () => {
        if (CMD.index !== index) {
          CMD.index = index;
          cmdMark();
        }
      },
      onclick: () => cmdRun(index),
    })),
  );
  CMD.list.querySelectorAll('.cmd-row').forEach((row, index) => {
    row.querySelector('.cmd-label').textContent = CMD.shown[index].label;
    row.querySelector('.cmd-group').textContent = CMD.shown[index].group;
  });
  if (!CMD.shown.length) CMD.list.append(h('div', { class: 'cmd-empty', text: 'Nothing found' }));
}

function cmdMark() {
  CMD.list.querySelectorAll('.cmd-row').forEach((row, index) => row.classList.toggle('on', index === CMD.index));
  const row = CMD.list.querySelector('.cmd-row.on');
  if (row) row.scrollIntoView({ block: 'nearest' });
}

function cmdRun(index) {
  const item = CMD.shown[index];
  if (!item) return;
  cmdClose();
  setTimeout(() => item.run(), 30);
}

function cmdClose() {
  if (!CMD.open) return;
  CMD.open = false;
  conceal(CMD.root, true);
  CMD.root = null;
}

function cmdOpen() {
  if (CMD.open) {
    cmdClose();
    return;
  }
  if (typeof closeMenu === 'function') closeMenu();
  CMD.open = true;
  CMD.items = cmdItems();
  CMD.input = h('input', { type: 'text', class: 'cmd-input', spellcheck: 'false', placeholder: 'Search actions, blocks and headings' });
  CMD.list = h('div', { class: 'cmd-list' });
  CMD.root = h(
    'div',
    { class: 'cmd-back' },
    h('div', { class: 'cmd-box' }, h('div', { class: 'cmd-head', html: icon('search', 18) }, CMD.input), CMD.list),
  );
  CMD.root.addEventListener('mousedown', (event) => {
    if (event.target === CMD.root) cmdClose();
  });
  CMD.input.addEventListener('input', cmdFilter);
  CMD.input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      CMD.index = Math.min(CMD.shown.length - 1, CMD.index + 1);
      cmdMark();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      CMD.index = Math.max(0, CMD.index - 1);
      cmdMark();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      cmdRun(CMD.index);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      cmdClose();
    }
  });
  document.body.append(CMD.root);
  cmdFilter();
  CMD.input.focus();
}

document.addEventListener(
  'keydown',
  (event) => {
    if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'k' || event.key === '/')) {
      event.preventDefault();
      event.stopPropagation();
      cmdOpen();
    }
  },
  true,
);

window.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('searchBtn');
  if (!button) return;
  button.innerHTML = icon('search', 18);
  button.onclick = cmdOpen;
});
