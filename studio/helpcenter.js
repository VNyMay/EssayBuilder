const HELP_QUESTIONS = [
  ['How is my word count worked out?', 'Like the IB: only your main text. The cover, contents, captions, tables, footnotes, references and appendices are not counted. Click the word count for more.'],
  ['How do I cite a source?', 'Type @ and pick the source, or press Add in the toolbar and choose Citation. To add a new source, press Add source in that list and paste a DOI, ISBN or link.'],
  ['How do I add a chart, table or picture?', 'Press Add in the toolbar, or type / on an empty line. You can also drag a picture onto the page.'],
  ['How do I change a chart or table?', 'Click it. Tables are edited right on the page, everything else in the panel on the right.'],
  ['How do I change fonts, margins or the cover?', 'Settings changes the whole essay. Cover designs the title page.'],
  ['How do I add a footnote?', 'Press Add in the toolbar and choose Footnote, or type /footnote. Footnotes do not count toward your words.'],
  ['Can I get an older version back?', 'Click Saved at the bottom left. Every version is kept and you can restore any of them.'],
  ['How do I hand in a Word file?', 'Use the arrow next to Export PDF and pick Word document.'],
  ['Is what I see what I hand in?', 'Yes. The pages you write on are the pages of your PDF, with the same breaks, page numbers and footnotes. They settle a moment after you stop typing.'],
  ['Is my work saved?', 'Yes, as you type. Nothing is lost if the app closes.'],
];

function helpClose() {
  const sheet = document.getElementById('helpSheet');
  if (sheet) sheet.remove();
}

function helpOpen() {
  if (document.getElementById('helpSheet')) {
    helpClose();
    return;
  }
  const open = Boolean(S.name) && !document.documentElement.classList.contains('home');
  const action = (iconName, label, run, show = true) => {
    if (!show) return null;
    const button = h('button', { type: 'button', class: 'help-act', html: `${icon(iconName, 18)}<span>${label}</span>` });
    button.addEventListener('click', () => {
      helpClose();
      run();
    });
    return button;
  };
  const actions = h(
    'div',
    { class: 'help-acts' },
    ...[
      action('sparkle', 'Take the tour', () => startTour(true), open),
      action('textIcon', 'Keyboard shortcuts', () => flowShortcuts(), typeof flowShortcuts === 'function'),
      action('box', 'What each block does', () => {
        reveal($('#palette'));
        const toggle = $('#palette .palette-help');
        if (toggle && !$('#palette').classList.contains('helping')) toggle.click();
      }, open),
      action('copy', 'Save as template', () => saveAsTemplate(), open && typeof saveAsTemplate === 'function'),
      action('folder', 'Show this essay in its folder', () => api('/api/reveal', {}), open),
      action('clock', "What's new", () => whatsNew(true), typeof whatsNew === 'function'),
      action('warn', 'Report a problem', () => reportOpen(), typeof reportOpen === 'function'),
    ].filter(Boolean),
  );
  const search = h('input', { type: 'search', class: 'fpop-input help-search', placeholder: 'Search questions', spellcheck: 'false' });
  const list = h('div', { class: 'help-list' });
  const draw = () => {
    const term = search.value.trim().toLowerCase();
    const rows = HELP_QUESTIONS.filter(([q, a]) => !term || `${q} ${a}`.toLowerCase().includes(term));
    list.replaceChildren(...rows.map(([q, a]) => h('details', { class: 'help-q' }, h('summary', { text: q }), h('p', { text: a }))));
    if (!rows.length) list.append(h('div', { class: 'fempty', text: 'Nothing found' }));
  };
  search.addEventListener('input', draw);
  search.addEventListener('keydown', (event) => event.stopPropagation());
  draw();
  const back = h('div', { id: 'helpSheet', class: 'keys-back' });
  const card = h(
    'div',
    { class: 'keys-card help-card' },
    h('div', { class: 'keys-head' }, h('span', { text: 'Help' }), h('button', { type: 'button', class: 'round', html: icon('close', 16), title: 'Close', onclick: helpClose })),
    actions,
    h('div', { class: 'keys-title help-title', text: 'Questions' }),
    search,
    list,
  );
  back.append(card);
  back.addEventListener('mousedown', (event) => {
    if (event.target === back) helpClose();
  });
  document.body.append(back);
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && document.getElementById('helpSheet')) {
    event.preventDefault();
    event.stopPropagation();
    helpClose();
  } else if (event.key === 'F1') {
    event.preventDefault();
    helpOpen();
  }
}, true);

window.addEventListener('DOMContentLoaded', () => {
  const search = document.getElementById('searchBtn');
  if (!search || document.getElementById('helpBtn')) return;
  const button = h('button', { id: 'helpBtn', class: 'round', type: 'button', title: 'Help (F1)', html: '<b class="help-q-mark">?</b>' });
  button.addEventListener('click', helpOpen);
  search.after(button);
});
