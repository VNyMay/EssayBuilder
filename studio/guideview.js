function templateFor(kind) {
  return TEMPLATES.find((template) => template.id === kind) || TEMPLATES.find((template) => template.kind === kind) || null;
}

function guideFor(id) {
  return typeof GUIDE === 'object' && GUIDE[id] ? GUIDE[id] : null;
}

function openLink(url) {
  if (!/^https?:\/\//i.test(url)) return;
  api('/api/link', { url }).catch(() => window.open(url, '_blank', 'noopener'));
}

function overlay(className, build) {
  const close = () => {
    view.remove();
    document.removeEventListener('keydown', keys, true);
  };
  const keys = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };
  const view = h('div', { class: `help-view ${className}` });
  view.append(build(close));
  view.addEventListener('mousedown', (event) => {
    event.stopPropagation();
    if (event.target === view) close();
  });
  document.addEventListener('keydown', keys, true);
  document.body.append(view);
  return close;
}

function openGuide(id) {
  const guide = guideFor(id);
  const template = templateFor(id);
  if (!guide || !template) return;
  const [what] = HELP[template.id] || HELP[template.kind] || [''];
  overlay('guide-view', (close) => {
    const copy = h('button', { type: 'button', class: 'pill ghost small', html: `${icon('copy', 14)}<span>Copy</span>` });
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(guide.example);
        copy.querySelector('span').textContent = 'Copied';
      } catch (error) {
        copy.querySelector('span').textContent = 'Select and copy';
      }
    });
    return h(
      'div',
      { class: 'guide-card' },
      h(
        'div',
        { class: 'guide-head' },
        h('div', { class: 'help-title', html: `${icon(template.icon, 24)}<span>${template.label}</span>` }),
        h('button', { type: 'button', class: 'round', title: 'Close', html: icon('close', 16), onclick: close }),
      ),
      h(
        'div',
        { class: 'guide-body' },
        h(
          'div',
          { class: 'guide-main' },
          what ? h('p', { class: 'guide-what', text: what }) : null,
          guide.intro ? h('p', { class: 'guide-intro', text: guide.intro }) : null,
          guide.items && guide.items.length
            ? h(
                'div',
                { class: 'guide-section' },
                h('div', { class: 'help-tag', text: 'What you can write' }),
                h('div', { class: 'guide-items' }, ...guide.items.flatMap(([code, meaning]) => [h('code', { text: code }), h('span', { text: meaning })])),
              )
            : null,
          guide.tips && guide.tips.length
            ? h('div', { class: 'guide-section' }, h('div', { class: 'help-tag', text: 'Tips' }), h('ul', { class: 'guide-tips' }, ...guide.tips.map((tip) => h('li', { text: tip }))))
            : null,
        ),
        h(
          'div',
          { class: 'guide-side' },
          guide.example
            ? h(
                'div',
                { class: 'guide-section' },
                h('div', { class: 'guide-example-head' }, h('div', { class: 'help-tag', text: 'Example' }), copy),
                h('pre', { class: 'guide-example', text: guide.example }),
              )
            : null,
          h('div', { class: 'help-sample guide-sample' }, h('img', { src: `previews/${template.id}.webp`, alt: '', draggable: 'false', onerror: (event) => event.target.parentNode.remove() })),
          guide.links && guide.links.length
            ? h(
                'div',
                { class: 'guide-section' },
                h('div', { class: 'help-tag', text: 'Learn more' }),
                h(
                  'div',
                  { class: 'guide-links' },
                  ...guide.links.map(([label, url]) =>
                    h('button', {
                      type: 'button',
                      class: 'guide-link',
                      title: url,
                      html: `${icon('link', 15)}<span></span>`,
                      onclick: () => openLink(url),
                    }),
                  ),
                ),
              )
            : null,
        ),
      ),
    );
  });
  const links = document.querySelectorAll('.guide-view .guide-link span');
  (guide.links || []).forEach(([label], index) => {
    if (links[index]) links[index].textContent = label;
  });
}

function moreHelpButton(id, before) {
  if (!guideFor(id)) return null;
  return h('button', {
    type: 'button',
    class: 'pill ghost small more-help',
    html: `${icon('braces', 15)}<span>More help</span>`,
    onclick: () => {
      if (before) before();
      openGuide(id);
    },
  });
}

function panelHelpButton(kind) {
  const template = templateFor({ tree: 'mindmap', grid: 'swot', figures: 'image', pipetable: 'table', fence: 'code' }[kind] || kind);
  if (!template || (!guideFor(template.id) && !HELP[template.id])) return null;
  return h('button', {
    type: 'button',
    class: 'round panel-help labelled',
    title: 'Open the guide for this block',
    html: `${icon('info', 15)}<span>Help</span>`,
    onclick: () => {
      if (guideFor(template.id)) return openGuide(template.id);
      const [what, how] = HELP[template.id];
      openHelpView(template, what, how);
    },
  });
}
