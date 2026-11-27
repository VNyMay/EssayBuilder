const GALLERY = { items: null, busy: false };

function galleryNode() {
  let node = document.getElementById('gallery');
  if (node) return node;
  node = h('section', { id: 'gallery', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'New essay' });
  node.addEventListener('keydown', galleryKeys);
  document.body.append(node);
  return node;
}

function galleryCard(item) {
  const paper = item.id
    ? h('span', { class: 'g-paper' }, item.thumb ? h('img', { src: item.thumb, alt: '', draggable: 'false' }) : null)
    : h('span', { class: 'g-paper g-blank', html: `<span class="g-plus">${icon('plus', 26)}</span>` });
  const card = h(
    'button',
    {
      type: 'button',
      class: `g-card${item.mine ? ' mine' : ''}`,
      'data-template': item.id,
      'aria-label': item.note ? `${item.name}, ${item.note}` : item.name,
      onclick: () => createFrom(item),
    },
    paper,
    h('span', { class: 'g-name', text: item.name }),
    h('span', { class: 'g-note', text: item.note || '' }),
  );
  if (item.mine) {
    const drop = h('span', { class: 'g-drop', role: 'button', title: 'Remove template', html: icon('trash', 15) });
    drop.addEventListener('click', async (event) => {
      event.stopPropagation();
      await api('/api/remove_template', { id: item.id });
      GALLERY.items = null;
      openGallery();
      toast('Template removed');
    });
    card.append(drop);
  }
  return card;
}

function saveAsTemplate() {
  if (!S.name) return;
  const back = h('div', { id: 'templateSheet', class: 'keys-back' });
  const input = h('input', { type: 'text', class: 'fpop-input', placeholder: 'Template name', spellcheck: 'false' });
  input.value = String(S.title || S.name || '').replace(/\.txt$/i, '');
  const save = async () => {
    const name = input.value.trim();
    if (!name) return input.focus();
    await saveNow();
    const page = S.pages && S.pages[0] ? String(S.pages[0].url).split('/').pop() : '';
    const answer = await api('/api/save_template', { name, page });
    if (answer.error) {
      toast(answer.error, true);
      return;
    }
    GALLERY.items = null;
    back.remove();
    toast('Saved. It is in New essay now');
  };
  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') save();
    if (event.key === 'Escape') back.remove();
  });
  const card = h(
    'div',
    { class: 'keys-card tpl-card' },
    h('div', { class: 'keys-head' }, h('span', { text: 'Save as template' }), h('button', { type: 'button', class: 'round', html: icon('close', 16), title: 'Close', onclick: () => back.remove() })),
    input,
    h('div', { class: 'news-foot' }, h('button', { type: 'button', class: 'pill solid', text: 'Save', onclick: save })),
  );
  back.append(card);
  back.addEventListener('mousedown', (event) => {
    if (event.target === back) back.remove();
  });
  document.body.append(back);
  setTimeout(() => {
    input.focus();
    input.select();
  }, 20);
}

async function openGallery() {
  const node = galleryNode();
  if (!GALLERY.items) {
    try {
      GALLERY.items = (await api('/api/starters')).items || [];
    } catch (error) {
      GALLERY.items = [];
    }
  }
  const order = ['Mine', 'Core', 'Subjects', 'Languages', 'General'];
  const items = [{ id: '', name: 'Blank', note: '', group: 'General' }, ...GALLERY.items];
  const names = [...new Set([...order, ...items.map((item) => item.group || 'General')])].filter((name) => items.some((item) => (item.group || 'General') === name));
  const sections = names.map((name, index) => {
    const list = items.filter((item) => (item.group || 'General') === name);
    if (name === 'General') list.sort((a, b) => (a.id ? 1 : 0) - (b.id ? 1 : 0));
    return h('div', { class: 'g-section', style: `--g:${index}` }, h('h3', { class: 'g-group', text: name === 'Mine' ? 'My templates' : name }), h('div', { class: 'g-grid' }, list.map(galleryCard)));
  });
  const cards = sections.flatMap((section) => [...section.querySelectorAll('.g-card')]);
  node.replaceChildren(
    h(
      'div',
      { class: 'g-wrap' },
      h(
        'div',
        { class: 'g-head' },
        h('h2', { class: 'g-title', text: 'New essay' }),
        h('button', { type: 'button', class: 'round g-close', title: 'Close (Esc)', html: icon('close', 18), onclick: closeGallery }),
      ),
      ...sections,
    ),
  );
  GALLERY.busy = false;
  node.hidden = false;
  document.documentElement.classList.add('gallery-open');
  (cards.find((card) => card.dataset.template === '') || cards[0]).focus({ preventScroll: true });
}

function closeGallery() {
  const node = document.getElementById('gallery');
  if (!node || node.hidden) return;
  node.hidden = true;
  document.documentElement.classList.remove('gallery-open');
  const back = document.getElementById('newEssay');
  if (back && !back.closest('[hidden]')) back.focus({ preventScroll: true });
}

function galleryOpen() {
  const node = document.getElementById('gallery');
  return Boolean(node && !node.hidden);
}

async function createFrom(item) {
  if (GALLERY.busy) return;
  GALLERY.busy = true;
  const node = galleryNode();
  node.classList.add('busy');
  const card = node.querySelector(`.g-card[data-template="${item.id}"]`);
  if (card) card.classList.add('picked');
  try {
    const state = await api('/api/new', item.id ? { template: item.id } : {});
    if (state.error) throw new Error(state.error.replace(/^\w+: /, ''));
    node.hidden = true;
    document.documentElement.classList.remove('gallery-open');
    load(state);
  } catch (error) {
    toast(error.message || 'Could not create the essay', true);
  } finally {
    GALLERY.busy = false;
    node.classList.remove('busy');
    if (card) card.classList.remove('picked');
  }
}

function galleryBelow(cards, from, down) {
  const box = from.getBoundingClientRect();
  const row = cards
    .map((card) => ({ card, box: card.getBoundingClientRect() }))
    .filter((item) => (down ? item.box.top > box.bottom - 4 : item.box.bottom < box.top + 4));
  if (!row.length) return from;
  const edge = down ? Math.min(...row.map((item) => item.box.top)) : Math.max(...row.map((item) => item.box.top));
  const line = row.filter((item) => Math.abs(item.box.top - edge) < 4);
  const middle = box.left + box.width / 2;
  return line.reduce((best, item) => (Math.abs(item.box.left + item.box.width / 2 - middle) < Math.abs(best.box.left + best.box.width / 2 - middle) ? item : best)).card;
}

function galleryKeys(event) {
  const cards = [...event.currentTarget.querySelectorAll('.g-card')];
  const index = cards.indexOf(document.activeElement);
  if (index < 0) return;
  let next;
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') next = galleryBelow(cards, cards[index], event.key === 'ArrowDown');
  else {
    const step = { ArrowLeft: -1, ArrowRight: 1, Home: -index, End: cards.length - 1 - index }[event.key];
    if (step === undefined) return;
    next = cards[Math.max(0, Math.min(cards.length - 1, index + step))];
  }
  event.preventDefault();
  next.focus();
  next.scrollIntoView({ block: 'nearest' });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && galleryOpen()) {
    event.preventDefault();
    event.stopPropagation();
    closeGallery();
  }
}, true);
