const RECENT_COLOURS = 'studio.colours';
let colourPop = null;
let fontPop = null;
let fontData = null;
const PREVIEWED = new Set();
const POPULAR_FONTS = [
  'Cambria', 'Times New Roman', 'Georgia', 'Garamond', 'Book Antiqua', 'Palatino Linotype', 'Constantia', 'Calibri', 'Arial', 'Segoe UI',
  'Aptos', 'Candara', 'EB Garamond', 'Lora', 'Merriweather', 'Libre Baskerville', 'Crimson Pro', 'Source Serif 4', 'PT Serif', 'Noto Serif',
  'Playfair Display', 'Cormorant Garamond', 'Spectral', 'Alegreya', 'Fraunces', 'Bitter', 'Roboto Slab', 'IBM Plex Serif', 'Inter', 'Roboto',
  'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Nunito', 'Raleway', 'Source Sans 3', 'Work Sans', 'IBM Plex Sans', 'DM Sans',
  'Manrope', 'Rubik', 'Karla', 'Noto Sans', 'Libre Franklin', 'Space Grotesk', 'Oswald', 'Caveat', 'Patrick Hand', 'Dancing Script',
  'JetBrains Mono', 'Fira Code', 'Source Code Pro', 'IBM Plex Mono',
];

function hexToHsv(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let hue = 0;
  if (d) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return [hue, max ? d / max : 0, max];
}

function hsvToHex(hue, sat, val) {
  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map((part) => Math.round((part + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function recentColours() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_COLOURS) || '[]').filter((item) => /^#[0-9a-f]{6}$/i.test(item));
  } catch {
    return [];
  }
}

function rememberColour(colour) {
  if (!/^#[0-9a-f]{6}$/i.test(colour)) return;
  localStorage.setItem(RECENT_COLOURS, JSON.stringify([colour, ...recentColours().filter((item) => item !== colour)].slice(0, 10)));
}

function placePop(node, anchor) {
  const k = typeof UI !== 'undefined' && UI.size ? UI.size : 1;
  const rect = anchor.getBoundingClientRect();
  const box = { width: node.offsetWidth * k, height: node.offsetHeight * k };
  const below = window.innerHeight - rect.bottom > box.height + 12 || rect.top < box.height + 12;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - box.width - 8));
  const top = below ? rect.bottom + 8 : rect.top - box.height - 8;
  node.style.left = `${left / k}px`;
  node.style.top = `${Math.max(8, top) / k}px`;
  node.classList.toggle('up', !below);
}

function closeColourPop() {
  if (!colourPop) return;
  const { node, outside, keys, finish } = colourPop;
  colourPop = null;
  document.removeEventListener('pointerdown', outside, true);
  document.removeEventListener('keydown', keys, true);
  finish();
  node.classList.add('leaving');
  setTimeout(() => node.remove(), 160);
}

function openColourPop(anchor, value, onPick) {
  closeColourPop();
  if (typeof closeMenu === 'function') closeMenu();
  let [hue, sat, val] = hexToHsv(/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#1f4e79');
  let current = /^#[0-9a-f]{6}$/i.test(value || '') ? value.toLowerCase() : '';
  let frame = 0;
  const knob = h('span', { class: 'cpop-knob' });
  const area = h('div', { class: 'cpop-area' }, knob);
  const thumb = h('span', { class: 'cpop-thumb' });
  const strip = h('div', { class: 'cpop-hue' }, thumb);
  const chip = h('span', { class: 'cpop-chip' });
  const hex = h('input', { type: 'text', class: 'cpop-hex', spellcheck: 'false', maxlength: '7' });
  const swatches = h('div', { class: 'cpop-swatches' });
  const recent = h('div', { class: 'cpop-swatches recent' });
  const node = h('div', { class: 'cpop' });
  const paint = (fromInput = false) => {
    const colour = hsvToHex(hue, sat, val);
    area.style.setProperty('--hue', hsvToHex(hue, 1, 1));
    knob.style.left = `${sat * 100}%`;
    knob.style.top = `${(1 - val) * 100}%`;
    knob.style.background = colour;
    thumb.style.left = `${(hue / 360) * 100}%`;
    thumb.style.background = hsvToHex(hue, 1, 1);
    chip.style.background = colour;
    if (!fromInput) hex.value = colour;
    current = colour;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => onPick(colour));
  };
  const drag = (target, move) => {
    target.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      target.setPointerCapture(event.pointerId);
      move(event);
      const onMove = (e) => move(e);
      const onUp = () => {
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', onUp);
        target.classList.remove('dragging');
      };
      target.classList.add('dragging');
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onUp);
    });
  };
  drag(area, (event) => {
    const rect = area.getBoundingClientRect();
    sat = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    val = 1 - Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    paint();
  });
  drag(strip, (event) => {
    const rect = strip.getBoundingClientRect();
    hue = Math.min(359.9, Math.max(0, ((event.clientX - rect.left) / rect.width) * 360));
    paint();
  });
  hex.addEventListener('input', () => {
    const text = hex.value.trim().replace(/^([^#])/, '#$1');
    if (/^#[0-9a-f]{6}$/i.test(text)) {
      [hue, sat, val] = hexToHsv(text.toLowerCase());
      paint(true);
    }
  });
  hex.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') closeColourPop();
  });
  const pick = (colour) => {
    [hue, sat, val] = hexToHsv(colour);
    paint();
  };
  (typeof SWATCHES !== 'undefined' ? SWATCHES : []).forEach((colour) => {
    swatches.append(h('button', { type: 'button', class: 'cpop-dot', title: colour, style: `background:${colour}`, onclick: () => pick(colour) }));
  });
  recentColours().forEach((colour) => {
    recent.append(h('button', { type: 'button', class: 'cpop-dot', title: colour, style: `background:${colour}`, onclick: () => pick(colour) }));
  });
  const row = h('div', { class: 'cpop-row' }, chip, hex);
  if (window.EyeDropper) {
    row.prepend(h('button', {
      type: 'button',
      class: 'cpop-drop',
      title: 'Pick a colour from the screen',
      html: icon('pipette', 16),
      onclick: async () => {
        try {
          const result = await new window.EyeDropper().open();
          if (result && result.sRGBHex) pick(result.sRGBHex.toLowerCase());
        } catch {
          return;
        }
      },
    }));
  }
  node.append(area, strip, row, swatches);
  if (recent.children.length) node.append(h('div', { class: 'cpop-label', text: 'Recent' }), recent);
  node.addEventListener('pointerdown', (event) => event.stopPropagation());
  node.addEventListener('mousedown', (event) => {
    if (event.target.tagName !== 'INPUT') event.preventDefault();
  });
  document.body.append(node);
  placePop(node, anchor);
  [hue, sat, val] = hexToHsv(current || '#1f4e79');
  area.style.setProperty('--hue', hsvToHex(hue, 1, 1));
  knob.style.left = `${sat * 100}%`;
  knob.style.top = `${(1 - val) * 100}%`;
  knob.style.background = current || '#1f4e79';
  thumb.style.left = `${(hue / 360) * 100}%`;
  thumb.style.background = hsvToHex(hue, 1, 1);
  chip.style.background = current || 'transparent';
  hex.value = current;
  const start = current;
  const outside = (event) => {
    if (!node.contains(event.target) && !anchor.contains(event.target)) closeColourPop();
  };
  const keys = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeColourPop();
    }
  };
  colourPop = { node, outside, keys, finish: () => current !== start && rememberColour(current) };
  setTimeout(() => {
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', keys, true);
  }, 0);
}

function colourButton(value, onPick, allowAuto = true) {
  const box = h('div', { class: 'colour-field' });
  const swatch = h('button', { type: 'button', class: 'colour-swatch', title: 'Choose colour' });
  const text = h('span', { class: 'colour-name' });
  const paint = () => {
    swatch.style.setProperty('--c', value || 'transparent');
    swatch.classList.toggle('auto', !value);
    text.textContent = value || 'Automatic';
  };
  swatch.addEventListener('click', () => openColourPop(swatch, value, (colour) => {
    value = colour;
    paint();
    onPick(colour);
  }));
  box.append(swatch, text);
  if (allowAuto) {
    box.append(h('button', { type: 'button', class: 'colour-reset', title: 'Automatic', html: icon('close', 13), onclick: () => {
      value = '';
      paint();
      onPick('');
    } }));
  }
  paint();
  return box;
}

function googleCss(family) {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}&text=${encodeURIComponent(family)}&display=swap`;
}

function previewFont(family) {
  if (!family || PREVIEWED.has(family) || !fontData || !fontData.googleSet.has(family)) return;
  PREVIEWED.add(family);
  document.head.append(h('link', { rel: 'stylesheet', href: googleCss(family) }));
}

async function loadFonts() {
  if (fontData) return fontData;
  const answer = await api('/api/fonts');
  const system = (answer.system || []).map((family) => ({ family, group: 'pc', category: 'On this PC' }));
  const google = (answer.google || []).map(([family, category]) => ({ family, group: 'google', category: category || 'other' }));
  const seen = new Set(system.map((item) => item.family.toLowerCase()));
  fontData = { all: [...system, ...google.filter((item) => !seen.has(item.family.toLowerCase()))], googleSet: new Set(google.map((item) => item.family)) };
  return fontData;
}

function closeFontPop() {
  if (!fontPop) return;
  const { node, outside, keys } = fontPop;
  fontPop = null;
  document.removeEventListener('pointerdown', outside, true);
  document.removeEventListener('keydown', keys, true);
  node.classList.add('leaving');
  setTimeout(() => node.remove(), 160);
}

async function openFontPop(anchor, value, onPick, options = {}) {
  closeFontPop();
  closeColourPop();
  if (typeof closeMenu === 'function') closeMenu();
  const node = h('div', { class: 'fpop' });
  const search = h('input', { type: 'text', class: 'fpop-search', placeholder: 'Search fonts', spellcheck: 'false' });
  const groups = [['all', 'Popular'], ['pc', 'On this PC'], ['serif', 'Serif'], ['sans-serif', 'Sans'], ['handwriting', 'Handwriting'], ['display', 'Display'], ['monospace', 'Mono']];
  let group = 'all';
  const chips = h('div', { class: 'fpop-chips' });
  const list = h('div', { class: 'fpop-list' });
  const count = h('div', { class: 'fpop-count' });
  node.append(search, chips, count, list);
  node.addEventListener('pointerdown', (event) => event.stopPropagation());
  node.addEventListener('mousedown', (event) => {
    if (event.target.tagName !== 'INPUT') event.preventDefault();
  });
  document.body.append(node);
  list.append(h('div', { class: 'fpop-empty', text: 'Loading fonts' }));
  placePop(node, anchor);
  const watcher = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      previewFont(entry.target.dataset.family);
      watcher.unobserve(entry.target);
    });
  }, { root: list });
  const choose = (family) => {
    closeFontPop();
    onPick(family);
  };
  let matches = [];
  let shown = 0;
  const more = () => {
    const end = Math.min(matches.length, shown + 60);
    for (; shown < end; shown += 1) {
      const item = matches[shown];
      const button = h('button', {
        type: 'button',
        class: `fpop-item${item.family === value ? ' on' : ''}`,
        'data-family': item.family,
        html: `<span class="fpop-name"></span><span class="fpop-tag">${item.group === 'pc' ? 'PC' : item.category.replace('-', ' ')}</span>`,
        onclick: () => choose(item.family),
      });
      const name = button.querySelector('.fpop-name');
      name.textContent = item.family;
      name.style.fontFamily = `"${item.family}", system-ui`;
      list.append(button);
      if (item.group === 'google') watcher.observe(button);
    }
  };
  const fill = () => {
    if (!fontData) return;
    const term = search.value.trim().toLowerCase();
    if (group === 'all' && !term) {
      const known = new Map(fontData.all.map((item) => [item.family.toLowerCase(), item]));
      matches = POPULAR_FONTS.map((family) => known.get(family.toLowerCase())).filter(Boolean);
    } else {
      matches = fontData.all.filter((item) => (group === 'all' || (group === 'pc' ? item.group === 'pc' : item.category === group)) && (!term || item.family.toLowerCase().includes(term)));
    }
    const total = fontData.all.length.toLocaleString();
    count.textContent = group === 'all' && !term ? `Popular fonts · ${total} in total` : `${matches.length.toLocaleString()} ${matches.length === 1 ? 'font' : 'fonts'}`;
    if (term) matches.sort((a, b) => (a.family.toLowerCase().startsWith(term) ? 0 : 1) - (b.family.toLowerCase().startsWith(term) ? 0 : 1));
    const standard = options.empty && !term ? String(options.empty).replace(/\s*\(default\)\s*$/i, '') : '';
    if (standard && standard !== options.empty) matches = matches.filter((item) => item.family !== standard);
    list.replaceChildren();
    list.scrollTop = 0;
    shown = 0;
    if (options.empty && !term) list.append(h('button', { type: 'button', class: `fpop-item${!value ? ' on' : ''}`, html: `<span class="fpop-name">${options.empty}</span>`, onclick: () => choose('') }));
    if (!matches.length) list.append(h('div', { class: 'fpop-empty', text: 'No fonts found' }));
    more();
  };
  groups.forEach(([key, label]) => {
    const chip = h('button', { type: 'button', class: `fpop-chip${key === group ? ' on' : ''}`, text: label, onclick: () => {
      group = key;
      chips.querySelectorAll('.fpop-chip').forEach((item) => item.classList.toggle('on', item === chip));
      fill();
    } });
    chips.append(chip);
  });
  list.addEventListener('scroll', () => {
    if (list.scrollTop + list.clientHeight > list.scrollHeight - 300) more();
  });
  search.addEventListener('input', fill);
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && matches[0]) choose(matches[0].family);
  });
  const outside = (event) => {
    if (!node.contains(event.target) && !anchor.contains(event.target)) closeFontPop();
  };
  const keys = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeFontPop();
    }
  };
  fontPop = { node, outside, keys };
  setTimeout(() => {
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', keys, true);
  }, 0);
  search.focus();
  try {
    await loadFonts();
  } catch {
    fontData = { all: [], googleSet: new Set() };
  }
  if (fontPop && fontPop.node === node) {
    search.placeholder = `Search ${fontData.all.length.toLocaleString()} fonts`;
    fill();
  }
}

function fontPicker(value, onPick, options = {}) {
  const button = h('button', { type: 'button', class: `drop font-drop ${options.className || ''}`.trim(), title: 'Choose font' });
  const paint = () => {
    button.innerHTML = `<span class="drop-text"></span>${icon('chevron', 14)}`;
    const text = button.querySelector('.drop-text');
    text.textContent = value || options.empty || 'Default';
    text.style.fontFamily = value ? `"${value}", system-ui` : '';
    if (value) loadFonts().then(() => previewFont(value)).catch(() => null);
  };
  if (options.keep) button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', () => openFontPop(button, value, (family) => {
    value = family;
    paint();
    onPick(family);
  }, options));
  paint();
  return button;
}
