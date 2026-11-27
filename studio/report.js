const REPORT = { errors: [], told: false };
const REPORT_ISSUES = 'https://github.com/VNyMay/EssayBuilder/issues/new';
const REPORT_QUIET = /ResizeObserver loop|Script error\.?$/i;

function reportNote(message, where) {
  if (REPORT_QUIET.test(message)) return;
  const time = new Date().toTimeString().slice(0, 8);
  REPORT.errors.push({ time, message: String(message).slice(0, 300), where: String(where || '').replace(location.origin + '/', '').slice(0, 120) });
  if (REPORT.errors.length > 15) REPORT.errors.shift();
  if (REPORT.told || typeof toast !== 'function' || !where || !String(where).startsWith(location.origin)) return;
  REPORT.told = true;
  setTimeout(() => toast('Something went wrong, but your work is saved.', true, [{ label: 'Report it', run: reportOpen }]), 300);
}

window.addEventListener('error', (event) => reportNote(event.message, event.filename ? `${event.filename}:${event.lineno}` : ''));
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const stack = reason && reason.stack ? String(reason.stack).split('\n')[1] || '' : '';
  const at = (stack.match(/\((https?:[^)]+)\)/) || stack.match(/at (https?:\S+)/) || [])[1] || '';
  reportNote(reason && reason.message ? reason.message : String(reason), at);
});

function reportText(words, details, short = false) {
  const view = typeof FLOW !== 'undefined' && FLOW.on ? 'Write view' : document.documentElement.classList.contains('home') ? 'Home' : 'Print preview';
  const lines = [
    '**What happened**',
    words.trim() || '(not described)',
    '',
    '**Details**',
    `Essay Builder ${details.version}${details.installed ? '' : ' (development copy)'} · ${details.system} · ${view} · window ${window.innerWidth}×${window.innerHeight}`,
  ];
  if (REPORT.errors.length) {
    lines.push('', '**Recent errors**', ...REPORT.errors.map((item) => `- ${item.time} ${item.message}${item.where ? ` (${item.where})` : ''}`));
  }
  if (!short && details.log && details.log.length) lines.push('', '**App log**', '```', ...details.log, '```');
  return lines.join('\n');
}

async function reportCopy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    const area = h('textarea', { style: 'position:fixed;opacity:0' });
    area.value = text;
    document.body.append(area);
    area.select();
    const done = document.execCommand('copy');
    area.remove();
    return done;
  }
}

function reportClose() {
  const back = document.getElementById('reportSheet');
  if (back) back.remove();
}

async function reportOpen() {
  reportClose();
  const details = await api('/api/report').catch(() => ({ version: '?', system: navigator.userAgent, log: [] }));
  const words = h('textarea', { class: 'report-words', rows: '4', placeholder: 'What happened? What did you click just before it?' });
  const preview = h('pre', { class: 'report-preview' });
  const paint = () => {
    preview.textContent = reportText(words.value, details);
  };
  words.addEventListener('input', paint);
  words.addEventListener('keydown', (event) => event.stopPropagation());
  paint();
  const copy = h('button', { type: 'button', class: 'pill ghost', text: 'Copy report' });
  copy.addEventListener('click', async () => {
    const done = await reportCopy(reportText(words.value, details));
    toast(done ? 'Report copied. Paste it into an email or message.' : 'Could not copy the report.', !done);
  });
  const send = h('button', { type: 'button', class: 'pill solid', text: 'Send on GitHub' });
  send.addEventListener('click', async () => {
    const full = reportText(words.value, details);
    let body = full;
    if (body.length > 5500) {
      await reportCopy(full);
      body = `${reportText(words.value, details, true)}\n\n(The full app log is on your clipboard. Paste it here.)`;
    }
    const title = (words.value.trim().split('\n')[0] || 'Problem report').slice(0, 80);
    api('/api/link', { url: `${REPORT_ISSUES}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}` });
    reportClose();
    toast('Your browser opened the report. Press Submit there to send it.');
  });
  const back = h('div', { id: 'reportSheet', class: 'keys-back' });
  back.append(
    h(
      'div',
      { class: 'keys-card storage-card' },
      h('div', { class: 'keys-head' }, h('span', { text: 'Report a problem' }), h('button', { type: 'button', class: 'round', html: icon('close', 16), title: 'Close', onclick: reportClose })),
      h('p', { class: 'storage-lead', text: 'Tell us what went wrong and we will fix it. Your essay text is never included.' }),
      words,
      h('details', { class: 'report-details' }, h('summary', { text: 'See exactly what is sent' }), preview),
      h('div', { class: 'storage-foot' }, copy, send),
    ),
  );
  back.addEventListener('mousedown', (event) => {
    if (event.target === back) reportClose();
  });
  document.body.append(back);
  words.focus();
}

document.addEventListener(
  'keydown',
  (event) => {
    if (event.key === 'Escape' && document.getElementById('reportSheet')) {
      event.preventDefault();
      event.stopPropagation();
      reportClose();
    }
  },
  true,
);
