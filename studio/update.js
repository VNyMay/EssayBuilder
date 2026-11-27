const UPDATE = { info: null };

async function updateCheck() {
  try {
    UPDATE.info = await (await fetch('/api/update')).json();
  } catch (error) {
    return;
  }
  updateNote();
  whatsNew();
}

function updateNote() {
  const info = UPDATE.info;
  if (!info || !info.newer || document.getElementById('updateNote')) return;
  const note = h(
    'div',
    { id: 'updateNote' },
    h('span', { class: 'update-dot' }),
    h('span', { text: `Version ${info.latest} is available` }),
    h('button', { type: 'button', class: 'pill solid small', text: 'Download', onclick: () => api('/api/link', { url: info.url }) }),
  );
  document.body.append(note);
}

function whatsNew(force = false) {
  const info = UPDATE.info;
  if (!info || !info.news || !info.news.items) return;
  const seen = localStorage.getItem('studio.seen-version');
  if (!force && !localStorage.getItem('studio.toured')) {
    localStorage.setItem('studio.seen-version', info.current);
    return;
  }
  if (!force && (seen === info.current || info.news.version !== info.current)) return;
  localStorage.setItem('studio.seen-version', info.current);
  const back = h('div', { id: 'newsSheet', class: 'keys-back' });
  const card = h('div', { class: 'keys-card news-card' });
  card.append(
    h('div', { class: 'keys-head' }, h('span', { text: `What's new in ${info.current}` }), h('button', { type: 'button', class: 'round', html: icon('close', 16), title: 'Close', onclick: () => back.remove() })),
    h('div', { class: 'news-list' }, ...info.news.items.map(([title, text]) => h('div', { class: 'news-item' }, h('b', { text: title }), h('span', { text })))),
    h('div', { class: 'news-foot' }, h('button', { type: 'button', class: 'pill solid', text: 'Start writing', onclick: () => back.remove() })),
  );
  back.append(card);
  back.addEventListener('mousedown', (event) => {
    if (event.target === back) back.remove();
  });
  document.body.append(back);
}

document.addEventListener('keydown', (event) => {
  const sheet = document.getElementById('newsSheet');
  if (sheet && event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    sheet.remove();
  }
}, true);

window.addEventListener('load', () => setTimeout(updateCheck, 1500));
