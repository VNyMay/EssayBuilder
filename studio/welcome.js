const WELCOME_CHOICES = [
  { id: 'extended-essay', icon: 'bibliography', name: 'Extended Essay', note: '4,000 words, with cover, contents and references' },
  { id: 'tok-essay', icon: 'quote', name: 'TOK essay', note: '1,600 words on a prescribed title' },
  { id: 'ia', icon: 'chart', name: 'Internal Assessment', note: 'Sciences, Maths, Business, Computer Science, Digital Society and more' },
  { id: 'ia', icon: 'globe', name: 'Languages and CAS', note: 'English oral, French and Arabic writing, CAS reflections' },
  { id: '', icon: 'newFile', name: 'Something else', note: 'An essay, a report, or a blank page' },
];

function welcomeClose(then) {
  const back = document.getElementById('welcomeSheet');
  if (!back) return then && then();
  back.classList.add('leaving');
  setTimeout(() => {
    back.remove();
    if (then) then();
  }, 160);
}

function welcomeSheet() {
  if (document.getElementById('welcomeSheet')) return;
  const choices = WELCOME_CHOICES.map((item, index) => {
    const card = h(
      'button',
      { type: 'button', class: 'welcome-choice', style: `--i:${index}` },
      h('span', { class: 'welcome-choice-icon', html: icon(item.icon, 24) }),
      h('span', { class: 'welcome-choice-main' }, h('b', { text: item.name }), h('span', { text: item.note })),
      h('span', { class: 'welcome-choice-go', html: icon('chevron', 16) }),
    );
    card.addEventListener('click', () =>
      welcomeClose(() => {
        if (item.id === 'ia' || !item.id) openGallery();
        else createFrom({ id: item.id });
      }),
    );
    return card;
  });
  const sample = h('button', { type: 'button', class: 'welcome-link', html: `${icon('bibliography', 16)}<span>Look at a finished sample essay first</span>` });
  sample.addEventListener('click', () =>
    welcomeClose(async () => {
      const state = await api('/api/sample').catch((error) => ({ error: String(error) }));
      if (state.error) toast(state.error, true);
      else load(state);
    }),
  );
  const colours = h('button', { type: 'button', class: 'welcome-link quiet', text: 'Choose colours' });
  colours.addEventListener('click', () =>
    welcomeClose(() => {
      localStorage.removeItem('studio.themed');
      pickTheme();
    }),
  );
  const back = h(
    'div',
    { id: 'welcomeSheet', class: 'keys-back' },
    h(
      'div',
      { class: 'keys-card welcome-card' },
      h('div', { class: 'welcome-head' }, h('img', { class: 'welcome-logo', src: 'logo.svg', alt: '' }), h('div', {}, h('div', { class: 'welcome-title', text: 'Welcome to Essay Builder' }), h('div', { class: 'welcome-sub', text: 'Write on real pages and hand in a perfect PDF.' }))),
      h('div', { class: 'welcome-ask', text: 'What are you writing?' }),
      h('div', { class: 'welcome-choices' }, ...choices),
      h('div', { class: 'welcome-foot' }, sample, colours),
    ),
  );
  document.body.append(back);
  choices[0].focus({ preventScroll: true });
}

document.addEventListener(
  'keydown',
  (event) => {
    const back = document.getElementById('welcomeSheet');
    if (!back) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      welcomeClose();
      return;
    }
    const cards = [...back.querySelectorAll('.welcome-choice')];
    const at = cards.indexOf(document.activeElement);
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && cards.length) {
      event.preventDefault();
      const next = at < 0 ? 0 : (at + (event.key === 'ArrowDown' ? 1 : -1) + cards.length) % cards.length;
      cards[next].focus();
    }
  },
  true,
);
