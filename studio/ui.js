const THEMES = [
  { id: 'light', name: 'Daylight', mat: '#eceff1', paper: '#ffffff', ink: '#188038' },
  { id: 'docs', name: 'Sky', mat: '#f0f4f9', paper: '#ffffff', ink: '#0b57d0' },
  { id: 'aqua', name: 'Cloud', mat: '#f5f5f7', paper: '#ffffff', ink: '#007aff' },
  { id: 'notebook', name: 'Notebook', mat: '#e6ebf3', paper: '#fbfcff', ink: '#2848a8' },
  { id: 'periwinkle', name: 'Periwinkle', mat: '#6271bb', paper: '#ffffff', ink: '#ffe45c' },
  { id: 'paper', name: 'Kraft', mat: '#cdb48c', paper: '#fffaf0', ink: '#2f6b45' },
  { id: 'dark', name: 'Graphite', mat: '#111113', paper: '#2c2c2e', ink: '#0a84ff' },
  { id: 'ink', name: 'Midnight', mat: '#080c14', paper: '#111a29', ink: '#94b2ff' },
  { id: 'contrast', name: 'High contrast', mat: '#ffffff', paper: '#ffffff', ink: '#005c3f' },
];

const SIZES = [
  { value: 1, label: 'S' },
  { value: 1.12, label: 'M' },
  { value: 1.25, label: 'L' },
  { value: 1.4, label: 'XL' },
];

const UI = {
  theme: localStorage.getItem('studio.theme') || 'light',
  size: Number(localStorage.getItem('studio.size')) || 1.12,
};

if (!THEMES.some((theme) => theme.id === UI.theme)) UI.theme = 'light';

let openMenu = null;

function reveal(node) {
  if (!node) return;
  clearTimeout(node.leaveTimer);
  node.classList.remove('leaving');
  node.hidden = false;
}

function conceal(node, remove = false) {
  if (!node) return;
  if (node.hidden || node.classList.contains('leaving')) {
    if (remove && !node.classList.contains('leaving')) node.remove();
    return;
  }
  node.classList.add('leaving');
  clearTimeout(node.leaveTimer);
  node.leaveTimer = setTimeout(() => {
    node.classList.remove('leaving');
    if (remove) node.remove();
    else node.hidden = true;
  }, 130);
}

function toggleShown(node) {
  if (node.hidden || node.classList.contains('leaving')) reveal(node);
  else conceal(node);
}

function applyAppearance() {
  const root = document.documentElement;
  if (root.dataset.theme && root.dataset.theme !== UI.theme) {
    root.classList.add('theming');
    clearTimeout(applyAppearance.timer);
    applyAppearance.timer = setTimeout(() => root.classList.remove('theming'), 360);
  }
  document.documentElement.dataset.theme = UI.theme;
  document.documentElement.style.setProperty('--ui', UI.size);
  localStorage.setItem('studio.theme', UI.theme);
  localStorage.setItem('studio.size', String(UI.size));
}

function closeMenu() {
  if (!openMenu) return;
  conceal(openMenu.node, true);
  openMenu.button.classList.remove('open');
  openMenu = null;
}

function menuItems(choices) {
  return choices.map((choice) => (typeof choice === 'object' ? choice : { value: choice, label: choice === '' ? 'auto' : choice }));
}

function showMenu(button, choices, current, onPick, up) {
  closeMenu();
  const items = menuItems(choices);
  const node = h('div', { class: 'menu' });
  const list = h('div', { class: 'menu-list' });
  let active = Math.max(0, items.findIndex((item) => item.value === current));
  const buttons = items.map((item, index) => {
    const entry = h(
      'button',
      {
        type: 'button',
        class: item.value === current ? 'on' : '',
        html: `<span style="${item.style || ''}">${item.label}</span><span class="tick">${icon('check', 15)}</span>`,
        onclick: () => {
          closeMenu();
          onPick(item.value);
        },
        onmouseenter: () => highlight(index),
      },
    );
    return entry;
  });
  const highlight = (index) => {
    active = index;
    buttons.forEach((entry, i) => entry.classList.toggle('active', i === index));
    buttons[index].scrollIntoView({ block: 'nearest' });
  };
  let search = null;
  if (items.length > 24) {
    search = h('input', { type: 'text', class: 'menu-search', spellcheck: 'false', placeholder: 'Search' });
    search.addEventListener('input', () => {
      const term = search.value.trim().toLowerCase();
      buttons.forEach((entry, i) => {
        entry.hidden = term !== '' && !items[i].label.toLowerCase().includes(term);
      });
      const first = buttons.findIndex((entry) => !entry.hidden);
      if (buttons[active].hidden && first >= 0) highlight(first);
    });
    node.append(search);
  }
  list.append(...buttons);
  node.append(list);
  node.addEventListener('mousedown', (event) => {
    if (event.target.tagName !== 'INPUT') event.preventDefault();
  });
  document.body.append(node);
  const k = UI.size;
  const rect = button.getBoundingClientRect();
  node.style.minWidth = `${Math.max(rect.width / k, 150)}px`;
  const height = node.getBoundingClientRect().height;
  const room = window.innerHeight - rect.bottom;
  const above = up || (room < height + 16 && rect.top > room);
  node.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - node.getBoundingClientRect().width - 8)) / k}px`;
  node.style.top = `${(above ? Math.max(8, rect.top - height - 8) : rect.bottom + 8) / k}px`;
  button.classList.add('open');
  openMenu = { node, button };
  buttons[active].classList.add('active');
  const move = (event) => {
    const visible = buttons.map((entry, i) => (entry.hidden ? -1 : i)).filter((i) => i >= 0);
    if (!visible.length) return;
    const at = Math.max(0, visible.indexOf(active));
    if (event.key === 'ArrowDown') highlight(visible[Math.min(visible.length - 1, at + 1)]);
    else if (event.key === 'ArrowUp') highlight(visible[Math.max(0, at - 1)]);
    else if (event.key === 'Enter') buttons[buttons[active].hidden ? visible[0] : active].click();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  node.addEventListener('keydown', move);
  button.addEventListener('keydown', move);
  if (search) search.focus();
}

function dropdown({ choices, value, onPick, label, className = '', keep = false, up = false, leading = '' }) {
  const text = h('span', { class: 'drop-text' });
  const button = h('button', { type: 'button', class: `drop ${className}`.trim() });
  let current = value;
  const caption = () => {
    if (label !== undefined && keep) return label;
    const hit = menuItems(choices).find((item) => item.value === current);
    return hit ? hit.label : String(current || 'auto');
  };
  const paint = () => {
    text.textContent = caption();
  };
  button.append(leading ? h('span', { class: 'drop-icon', html: leading }) : '', text, h('span', { class: 'drop-chevron', html: icon('chevron', 16) }));
  button.addEventListener('click', () => {
    if (openMenu && openMenu.button === button) closeMenu();
    else {
      showMenu(button, choices, current, (picked) => {
        current = picked;
        paint();
        onPick(picked);
      }, up);
    }
  });
  button.addEventListener('keydown', (event) => {
    if (!openMenu && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      button.click();
    }
  });
  button.setLabel = (next) => {
    label = next;
    paint();
  };
  paint();
  return button;
}

function tweenSize(target) {
  const from = UI.size;
  UI.size = target;
  localStorage.setItem('studio.size', String(target));
  const root = document.documentElement;
  const begin = performance.now();
  const span = 320;
  cancelAnimationFrame(tweenSize.frame);
  const step = (now) => {
    const t = Math.min(1, (now - begin) / span);
    const eased = 1 - (1 - t) ** 4;
    root.style.setProperty('--ui', String(from + (target - from) * eased));
    if (t < 1) tweenSize.frame = requestAnimationFrame(step);
    else {
      applyAppearance();
      if (typeof layout === 'function' && S.pages.length) layout();
    }
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    applyAppearance();
    if (typeof layout === 'function' && S.pages.length) layout();
    return;
  }
  tweenSize.frame = requestAnimationFrame(step);
}

function buildAppearance() {
  const box = h('div', { id: 'appearance', hidden: true });
  const render = () => {
    box.replaceChildren(
      h('div', { class: 'panel-head' }, h('span', { text: 'Appearance' }), h('button', { class: 'round', html: icon('close', 16), title: 'Close', onclick: () => conceal(box) })),
      h(
        'div',
        { class: 'panel-body' },
        h('div', { class: 'group-title', text: 'Theme' }),
        h(
          'div',
          { class: 'themes' },
          THEMES.map((theme) =>
            h(
              'button',
              {
                class: `theme${theme.id === UI.theme ? ' on' : ''}`,
                title: theme.name,
                onclick: (event) => {
                  UI.theme = theme.id;
                  applyAppearance();
                  box.querySelectorAll('.theme').forEach((card) => card.classList.toggle('on', card === event.currentTarget));
                },
              },
              h('span', { class: 'scene', style: `--m:${theme.mat};--p:${theme.paper};--k:${theme.ink}` }, h('i'), h('b')),
              h('span', { text: theme.name }),
            ),
          ),
        ),
        h('div', { class: 'group-title', text: 'Interface size' }),
        segmented(
          SIZES.map((size) => ({ value: size.value, label: size.label, title: `Interface size ${size.label}` })),
          UI.size,
          (value) => tweenSize(value),
        ),
      ),
    );
  };
  render();
  document.body.append(box);
  document.addEventListener('mousedown', (event) => {
    if (!event.target.closest('#appearance, #themeBtn')) conceal(box);
    if (openMenu && !event.target.closest('.menu') && !openMenu.button.contains(event.target)) closeMenu();
  });
  return box;
}

applyAppearance();
