const CHECK = { open: false, root: null, body: null, data: null, seq: 0, timer: null, poll: null, seenSource: null, seenPages: -1, passed: false };

const CHECK_GROUPS = [
  { level: 'error', title: 'Errors' },
  { level: 'warn', title: 'Warnings' },
  { level: 'ok', title: 'Passed' },
];

function checkOpenEssay() {
  return Boolean(S.name) && !document.documentElement.classList.contains('home');
}

function checkButton() {
  return document.getElementById('checkBtn');
}

function checkBuild() {
  if (CHECK.root) return CHECK.root;
  CHECK.body = h('div', { class: 'check-body' });
  CHECK.root = h(
    'aside',
    { id: 'checkSheet', hidden: true },
    h(
      'div',
      { class: 'panel-head' },
      h('span', { text: 'Check' }),
      h(
        'span',
        { class: 'check-head-tools' },
        h('button', { type: 'button', class: 'round', title: 'Check again', html: icon('redo', 16), onclick: () => checkRefresh() }),
        h('button', { type: 'button', class: 'round', title: 'Close', html: icon('close', 16), onclick: () => checkClose() }),
      ),
    ),
    CHECK.body,
  );
  document.body.append(CHECK.root);
  return CHECK.root;
}

function checkOpen() {
  if (!checkOpenEssay()) return;
  checkBuild();
  if (typeof closeSettings === 'function' && S.settingsOpen) closeSettings();
  if (S.panel && typeof closePanel === 'function') closePanel();
  const issues = document.getElementById('issueList');
  if (issues && typeof conceal === 'function') conceal(issues);
  CHECK.open = true;
  CHECK.root.hidden = false;
  const button = checkButton();
  if (button) button.classList.add('on');
  if (!CHECK.data) checkDraw();
  CHECK.seenSource = S.source;
  CHECK.seenPages = S.pages ? S.pages.length : 0;
  clearInterval(CHECK.poll);
  CHECK.poll = setInterval(checkTick, 400);
  checkRefresh();
}

function checkClose() {
  CHECK.open = false;
  clearInterval(CHECK.poll);
  clearTimeout(CHECK.timer);
  CHECK.seq += 1;
  if (CHECK.root) CHECK.root.hidden = true;
  const button = checkButton();
  if (button) button.classList.remove('on');
}

function checkToggle() {
  if (CHECK.open) checkClose();
  else checkOpen();
}

function checkTick() {
  if (!CHECK.open) return;
  if (!checkOpenEssay()) {
    checkClose();
    CHECK.data = null;
    return;
  }
  const pages = S.pages ? S.pages.length : 0;
  if (S.source === CHECK.seenSource && pages === CHECK.seenPages) return;
  CHECK.seenSource = S.source;
  CHECK.seenPages = pages;
  clearTimeout(CHECK.timer);
  CHECK.timer = setTimeout(checkRefresh, 900);
}

async function checkRefresh() {
  if (!CHECK.open) return;
  clearTimeout(CHECK.timer);
  const seq = ++CHECK.seq;
  CHECK.root.classList.add('busy');
  let data;
  try {
    data = await api('/api/check', {
      source: S.source,
      pages: S.pages ? S.pages.length : 0,
      issues: (S.issues || []).map((item) => ({ level: item.level, text: item.text, line: item.line })),
    });
  } catch (error) {
    data = { findings: [{ level: 'error', text: 'Check could not run', line: null }], tasks: [], criteria: [], ticks: [] };
  }
  if (seq !== CHECK.seq || !CHECK.open) return;
  CHECK.root.classList.remove('busy');
  if (data.error) data = { findings: [{ level: 'error', text: 'Check could not run', line: null }], tasks: [], criteria: [], ticks: [] };
  CHECK.data = data;
  checkDraw();
}

function checkJump(line) {
  if (!line) return;
  scrollToRange({ start: line, end: line, kind: 'para' });
}

function checkRow(item) {
  const mark = item.level === 'ok' ? icon('check', 14) : item.level === 'error' ? icon('close', 13) : '';
  const row = h(
    item.line ? 'button' : 'div',
    { class: `check-row ${item.level}${item.line ? ' jump' : ''}`, type: item.line ? 'button' : undefined },
    h('span', { class: 'check-mark', html: mark }),
    h('span', { class: 'check-text', text: item.text }),
    item.line ? h('span', { class: 'check-line', text: `L${item.line}` }) : null,
  );
  if (item.line) row.addEventListener('click', () => checkJump(item.line));
  return row;
}

function checkScore(findings) {
  const errors = findings.filter((item) => item.level === 'error').length;
  const warns = findings.filter((item) => item.level === 'warn').length;
  const passed = findings.filter((item) => item.level === 'ok').length;
  const state = errors ? 'bad' : warns ? 'warn' : 'good';
  const big = errors ? String(errors) : warns ? String(warns) : '';
  const label = errors ? 'to fix' : warns ? 'to check' : 'Ready to hand in';
  const tally = [errors && warns ? `${warns} to check` : '', `${passed} passed`].filter(Boolean).join(' · ');
  return h(
    'div',
    { class: `check-score ${state}` },
    h('div', { class: 'check-stamp', html: state === 'good' ? icon('check', 26) : '' }, big ? h('b', { text: big }) : null),
    h('div', { class: 'check-score-text' }, h('div', { class: 'check-score-label', text: label }), h('div', { class: 'check-tally', text: tally })),
  );
}

function checkMeter(data) {
  if (!data.limit) return null;
  const share = Math.min(1, data.words / data.limit);
  const over = data.words > data.limit;
  return h(
    'div',
    { class: `check-meter${over ? ' over' : ''}` },
    h('div', { class: 'check-meter-head' }, h('span', { text: 'Words' }), h('span', { class: 'check-meter-num', text: `${Number(data.words).toLocaleString()} / ${Number(data.limit).toLocaleString()}` })),
    h('div', { class: 'check-rule' }, h('div', { class: 'check-fill', style: `width:${(share * 100).toFixed(1)}%` })),
  );
}

function checkGroup(title, count, kids, extra) {
  return h(
    'section',
    { class: 'check-group' },
    h('div', { class: 'check-group-title' }, h('span', { text: title }), count !== null ? h('span', { class: 'check-count', text: String(count) }) : null, extra || null),
    ...kids,
  );
}

function checkOwn(data) {
  const own = (data.own || []).slice();
  const ticks = new Set(data.ownTicks || []);
  const store = () => {
    data.own = own;
    data.ownTicks = [...ticks];
    api('/api/check_save', { own, ticks: { task: 'own', items: [...ticks] } });
  };
  const count = h('span', { class: 'check-crit-count' });
  const paint = () => {
    const done = own.filter((item) => ticks.has(item.id)).length;
    count.textContent = own.length ? `${done}/${own.length}` : '';
    count.classList.toggle('full', own.length > 0 && done === own.length);
  };
  const list = h('div', { class: 'check-own-list' });
  const row = (item) => {
    const box = h('input', { type: 'checkbox' });
    box.checked = ticks.has(item.id);
    box.addEventListener('change', () => {
      if (box.checked) ticks.add(item.id);
      else ticks.delete(item.id);
      paint();
      store();
    });
    const drop = h('button', { type: 'button', class: 'check-own-drop', html: icon('close', 13), title: 'Remove' });
    const line = h('div', { class: 'check-own-row' }, h('label', { class: 'check-tick' }, box, h('span', { class: 'check-box', html: icon('check', 13) }), h('span', { class: 'check-tick-text', text: item.text })), drop);
    drop.addEventListener('click', () => {
      const at = own.findIndex((entry) => entry.id === item.id);
      if (at >= 0) own.splice(at, 1);
      ticks.delete(item.id);
      line.remove();
      paint();
      store();
    });
    return line;
  };
  own.forEach((item) => list.append(row(item)));
  const input = h('input', { type: 'text', class: 'check-own-input', placeholder: 'Add your own, e.g. teacher feedback', spellcheck: 'true' });
  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key !== 'Enter' || !input.value.trim()) return;
    event.preventDefault();
    const item = { id: `own-${Date.now().toString(36)}`, text: input.value.trim() };
    own.push(item);
    list.append(row(item));
    input.value = '';
    paint();
    store();
  });
  paint();
  const head = h('div', { class: 'check-crit-head' }, h('span', { class: 'check-crit-name', text: 'My checklist' }), count);
  return checkGroup('Mine', null, [h('div', { class: 'check-crit check-own' }, head, list, input)]);
}

function checkCriteria(data) {
  const tasks = data.tasks || [];
  const choices = tasks.map((task) => ({ value: task.id, label: task.name }));
  const picker = dropdown({
    choices,
    value: data.task || '',
    label: data.task ? undefined : 'Pick task',
    keep: !data.task,
    className: 'check-task',
    onPick: async (value) => {
      await api('/api/check_save', { task: value });
      checkRefresh();
    },
  });
  const ticks = new Set(data.ticks || []);
  const save = () => api('/api/check_save', { ticks: { task: data.task, items: [...ticks] } });
  const kids = [h('div', { class: 'check-task-row' }, h('span', { text: 'Task' }), picker)];
  (data.criteria || []).forEach((criterion) => {
    const count = h('span', { class: 'check-crit-count' });
    const paint = () => {
      const done = criterion.items.filter((item) => ticks.has(item.id)).length;
      count.textContent = `${done}/${criterion.items.length}`;
      count.classList.toggle('full', done === criterion.items.length);
    };
    const items = criterion.items.map((item) => {
      const box = h('input', { type: 'checkbox' });
      box.checked = ticks.has(item.id);
      box.addEventListener('change', () => {
        if (box.checked) ticks.add(item.id);
        else ticks.delete(item.id);
        paint();
        save();
      });
      return h('label', { class: 'check-tick' }, box, h('span', { class: 'check-box', html: icon('check', 13) }), h('span', { class: 'check-tick-text', text: item.text }));
    });
    paint();
    kids.push(h('div', { class: 'check-crit' }, h('div', { class: 'check-crit-head' }, h('span', { class: 'check-crit-code', text: criterion.id }), h('span', { class: 'check-crit-name', text: criterion.name }), count), ...items));
  });
  return checkGroup('Criteria', null, kids);
}

function checkDraw() {
  if (!CHECK.body) return;
  const data = CHECK.data;
  const top = CHECK.body.scrollTop;
  if (!data) {
    CHECK.body.replaceChildren(h('div', { class: 'check-wait', text: 'Checking' }));
    return;
  }
  const findings = data.findings || [];
  const parts = [checkScore(findings), checkMeter(data)];
  CHECK_GROUPS.forEach((group) => {
    const rows = findings.filter((item) => item.level === group.level);
    if (!rows.length) return;
    if (group.level === 'ok') {
      const toggle = h('button', { type: 'button', class: 'check-fold', text: CHECK.passed ? 'Hide' : 'Show', onclick: () => {
        CHECK.passed = !CHECK.passed;
        checkDraw();
      } });
      parts.push(checkGroup(group.title, rows.length, CHECK.passed ? rows.map(checkRow) : [], toggle));
      return;
    }
    parts.push(checkGroup(group.title, rows.length, rows.map(checkRow)));
  });
  if (data.tasks && data.tasks.length) parts.push(checkCriteria(data));
  parts.push(checkOwn(data));
  CHECK.body.replaceChildren(...parts.filter(Boolean));
  CHECK.body.scrollTop = top;
}

window.addEventListener('DOMContentLoaded', () => {
  const button = checkButton();
  if (button) {
    button.innerHTML = `${icon('checklist', 17)}<span>Check</span>`;
    button.addEventListener('click', checkToggle);
  }
  const panel = document.getElementById('panel');
  if (panel) {
    new MutationObserver(() => {
      if (CHECK.open && !panel.hidden && !panel.classList.contains('leaving')) checkClose();
    }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !CHECK.open || document.querySelector('.menu, .cmd-back, .fmenu, .keys-back, #ffind:not([hidden])')) return;
    if (typeof FLOW !== 'undefined' && (FLOW.slash || FLOW.pop)) return;
    event.preventDefault();
    event.stopPropagation();
    checkClose();
  }, true);
});
