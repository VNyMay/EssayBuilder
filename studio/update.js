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
  if (!info || !info.newer) return;
  let note = document.getElementById('updateNote');
  if (!note) {
    note = h('div', { id: 'updateNote' });
    document.body.append(note);
  }
  const progress = UPDATE.progress || info.progress || { stage: 'idle' };
  const button = (text, run, solid = true) => h('button', { type: 'button', class: `pill ${solid ? 'solid' : 'ghost'} small`, text, onclick: run });
  if (!info.canInstall) {
    note.replaceChildren(h('span', { class: 'update-dot' }), h('span', { text: `Version ${info.latest} is available` }), button('Download', () => api('/api/link', { url: info.url })));
  } else if (progress.stage === 'downloading') {
    const share = progress.total ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;
    note.replaceChildren(h('span', { class: 'update-spin' }), h('span', { text: `Downloading version ${info.latest}` }), h('span', { class: 'update-bar', style: `--p:${share}%` }, h('i')), h('span', { class: 'update-share', text: `${share}%` }));
  } else if (progress.stage === 'ready') {
    note.replaceChildren(h('span', { class: 'update-dot' }), h('span', { text: `Version ${info.latest} is ready` }), button('Restart to update', updateInstall));
  } else if (progress.stage === 'error') {
    note.replaceChildren(h('span', { class: 'update-dot bad' }), h('span', { text: progress.error || 'The update could not be downloaded.' }), button('Try again', updateStart));
  } else {
    note.replaceChildren(h('span', { class: 'update-dot' }), h('span', { text: `Version ${info.latest} is available` }), button('Update', updateStart));
  }
}

async function updateStart() {
  UPDATE.progress = await api('/api/update_download').catch(() => ({ stage: 'error' }));
  updateNote();
  clearInterval(UPDATE.timer);
  UPDATE.timer = setInterval(async () => {
    UPDATE.progress = await api('/api/update_progress').catch(() => UPDATE.progress);
    updateNote();
    if (!UPDATE.progress || UPDATE.progress.stage !== 'downloading') clearInterval(UPDATE.timer);
  }, 500);
}

async function updateInstall() {
  if (typeof saveNow === 'function') await saveNow();
  const answer = await api('/api/update_install').catch((error) => ({ error: String(error) }));
  if (answer.error) {
    toast(answer.error, true);
    return;
  }
  const back = h('div', { id: 'updatingSheet' }, h('div', { class: 'updating-card' }, h('span', { class: 'update-spin big' }), h('b', { text: `Updating to version ${UPDATE.info.latest}` }), h('span', { text: 'Essay Builder will close and open again by itself in about a minute. Your work is saved.' })));
  document.body.append(back);
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
