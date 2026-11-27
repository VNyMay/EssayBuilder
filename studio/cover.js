const COVER_LABELS = [
  { value: 'classic', label: 'IB standard' },
  { value: 'formal', label: 'Formal' },
  { value: 'modern', label: 'Modern' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'banner', label: 'Banner' },
  { value: 'split', label: 'Split' },
  { value: 'image', label: 'Photo' },
  { value: 'free', label: 'Custom' },
];

const COVER_ART = {
  classic: art('<rect x="14" y="3" width="26" height="30" rx="2" style="stroke:var(--line-strong)"/><path d="M20 12h14M22 17h10M20 28h14" /><path d="M20 21h14" style="stroke:var(--green)"/>', 54, 36),
  formal: art('<rect x="14" y="3" width="26" height="30" rx="2" style="stroke:var(--line-strong)"/><rect x="17" y="6" width="20" height="24" rx="1" style="stroke:var(--line-strong)"/><path d="M21 15h12M23 20h8M22 26h10"/>', 54, 36),
  modern: art('<rect x="14" y="3" width="26" height="30" rx="2" style="stroke:var(--line-strong)"/><path d="M18 6v24" style="stroke:var(--green);stroke-width:2.5"/><path d="M22 13h13M22 18h9M22 27h12"/>', 54, 36),
  minimal: art('<rect x="14" y="3" width="26" height="30" rx="2" style="stroke:var(--line-strong)"/><path d="M18 8h9M18 28h7"/>', 54, 36),
  banner: art('<rect x="14" y="3" width="26" height="30" rx="2" style="stroke:var(--line-strong)"/><rect x="14" y="3" width="26" height="11" rx="2" style="fill:var(--green);stroke:none"/><path d="M19 22h16M21 27h12"/>', 54, 36),
  split: art('<rect x="14" y="3" width="26" height="30" rx="2" style="stroke:var(--line-strong)"/><rect x="14" y="3" width="11" height="30" rx="2" style="fill:var(--green);stroke:none"/><path d="M29 14h8M29 19h6M29 27h7"/>', 54, 36),
  free: art('<rect x="14" y="3" width="26" height="30" rx="2" style="stroke:var(--line-strong)"/><rect x="18" y="8" width="10" height="7" rx="1" style="stroke:var(--green)"/><path d="M20 21h14M25 26h9"/><circle cx="33" cy="11" r="2.5" style="stroke:var(--green)"/>', 54, 36),
  image: art('<rect x="14" y="3" width="26" height="30" rx="2" style="stroke:var(--line-strong)"/><rect x="14" y="3" width="26" height="15" rx="2" style="fill:var(--line);stroke:none"/><path d="M17 15l5-5 4 4 3-3 7 7" style="stroke:var(--green)"/><path d="M19 24h16M21 29h12"/>', 54, 36),
};

function coverText(label, key, placeholder = '') {
  const input = h('input', { type: 'text', spellcheck: 'false', placeholder });
  input.value = headerValue(key);
  input.addEventListener('input', () => setHeader(key, input.value));
  return line(label, h('div', { class: 'field' }, input));
}

function coverPicture(label, key) {
  const value = headerValue(key);
  const box = h('div', { class: 'cover-picture' }, fileChooser({
    value,
    accept: 'image/*',
    label: 'Choose picture',
    onPick: (path) => {
      setHeader(key, path);
      openCover();
    },
  }));
  if (value) {
    box.append(h('button', {
      type: 'button',
      class: 'mini',
      html: icon('trash', 14),
      title: 'Remove',
      onclick: () => {
        setHeader(key, '');
        openCover();
      },
    }));
  }
  return stackLine(label, box);
}

function openCover() {
  closeEditor(true);
  S.panel = null;
  S.sel = null;
  S.settingsOpen = true;
  S.coverOpen = true;
  const root = $('#panel');
  root.replaceChildren();
  root.classList.add('wide');
  root.hidden = false;
  const on = !/^(no|off|false)$/i.test(headerValue('cover') || S.settings.cover || 'yes');
  const style = headerValue('cover-style') || 'classic';
  const align = headerValue('cover-align') || 'center';
  const colour = headerValue('cover-color');
  const textColour = headerValue('cover-text');
  const wordCount = /^(no|off|false|none)$/i.test(headerValue('word-count')) ? 'off' : 'auto';
  const dateInput = h('input', { type: 'text', spellcheck: 'false', placeholder: 'Date' });
  dateInput.value = headerValue('date');
  dateInput.addEventListener('input', () => setHeader('date', dateInput.value));
  const today = h('button', {
    type: 'button',
    class: 'pill ghost small',
    text: 'Today',
    onclick: () => {
      dateInput.value = 'today';
      setHeader('date', 'today');
    },
  });
  const body = h(
    'div',
    { class: 'panel-body' },
    section(null, line('Cover', switchField(on, (checked) => {
      setHeader('cover', checked ? 'yes' : 'no');
    }))),
    section('Style', cards(COVER_LABELS.map((item) => ({ ...item, art: COVER_ART[item.value] })), style, (value) => {
      if (value === 'free') {
        openCoverFree();
        return;
      }
      setHeader('cover-style', value === 'classic' ? '' : value);
      openCover();
    }, 4), style === 'free'
      ? h('button', { type: 'button', class: 'pill solid', html: `${icon('shapes', 16)}<span>Edit on the page</span>`, onclick: () => openCoverFree() })
      : h('button', { type: 'button', class: 'pill solid', html: `${icon('shapes', 16)}<span>Customise this cover</span>`, onclick: () => openCoverFree(style) })),
    section(
      'Details',
      coverText('Title', 'title'),
      coverText('Research question', 'question', 'Your research question'),
      coverText('Subtitle', 'subtitle'),
      coverText('Subject', 'subject'),
      coverText('Category', 'category', 'Language essays only'),
      coverText('Author', 'author', style === 'classic' ? 'Not printed: IB covers are anonymous' : ''),
      coverText('Candidate', 'candidate', 'Candidate number'),
      coverText('School', 'school'),
      coverText('Supervisor', 'supervisor'),
      coverText('Session', 'session', 'May 2027'),
      coverText('Course', 'course'),
      line('Date', h('div', { class: 'inline-row' }, h('div', { class: 'field' }, dateInput), today)),
    ),
    section(
      'Colours',
      line('Colour', colourPicker(colour, (value) => setHeader('cover-color', value))),
      line('Text', colourPicker(textColour, (value) => setHeader('cover-text', value))),
      h('button', {
        type: 'button',
        class: 'pill ghost small reset',
        text: 'Reset colours',
        onclick: () => {
          setHeader('cover-color', '');
          setHeader('cover-text', '');
          openCover();
        },
      }),
    ),
    section('Align', segmented([
      { value: 'left', icon: 'alignLeft', label: 'Left', title: 'Align left' },
      { value: 'center', icon: 'alignCenter', label: 'Centre', title: 'Centre' },
      { value: 'right', icon: 'alignRight', label: 'Right', title: 'Align right' },
    ], align, (value) => setHeader('cover-align', value === 'center' ? '' : value))),
    section('Pictures', coverPicture(style === 'image' ? 'Photo' : 'Picture strip', 'cover-image'), coverPicture('Logo', 'cover-logo')),
    section('Word count', segmented([
      { value: 'auto', label: 'Auto' },
      { value: 'off', label: 'Off' },
    ], wordCount, (value) => setHeader('word-count', value === 'off' ? 'off' : ''))),
  );
  root.append(
    h(
      'div',
      { class: 'panel-head' },
      h('span', { text: 'Cover' }),
      h('button', { class: 'round', html: icon('close', 16), title: 'Close', onclick: closeSettings }),
    ),
    body,
  );
  placeOverlays();
}
