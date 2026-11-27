const STORE = { info: null };

const STORE_ICONS = { onedrive: 'cloud', gdrive: 'cloud', dropbox: 'cloud', icloud: 'cloud', local: 'laptop', other: 'folder' };

async function storageLine() {
  const hero = document.querySelector('#start .hero');
  if (!hero) return;
  let line = document.getElementById('storageLine');
  if (!line) {
    line = h('div', { id: 'storageLine', class: 'storage-line' });
    hero.querySelector('.tiles').after(line);
  }
  const info = await api('/api/storage').catch(() => null);
  if (!info || info.error) {
    line.hidden = true;
    return;
  }
  STORE.info = info;
  const best = info.options.find((item) => item.kind !== 'local');
  line.hidden = false;
  line.className = `storage-line ${info.cloud ? 'safe' : best ? 'nudge' : 'plain'}`;
  const text = info.cloud ? `Your essays are backed up in <b>${info.service}</b>` : 'Your essays are saved only on this computer';
  line.replaceChildren(
    h('span', { class: 'storage-icon', html: icon(info.cloud ? 'cloud' : 'laptop', 16) }),
    h('span', { class: 'storage-text', html: text }),
    !info.cloud && best
      ? h('button', { type: 'button', class: 'pill solid small', text: `Back up with ${best.name}`, onclick: () => storageSheet(best.path) })
      : h('button', { type: 'button', class: 'storage-link', text: 'Change', onclick: () => storageSheet() }),
  );
}

function storageClose() {
  const back = document.getElementById('storageSheet');
  if (back) back.remove();
}

function storageSheet(preferred) {
  const info = STORE.info;
  if (!info) return;
  storageClose();
  let picked = preferred || info.current;
  const options = [...info.options];
  if (!options.some((item) => item.path === info.current)) options.unshift({ kind: info.cloud || 'other', name: info.service || 'Current folder', path: info.current, exists: true });
  const list = h('div', { class: 'storage-list' });
  const move = h('input', { type: 'checkbox', checked: true });
  const moveRow = h('label', { class: 'storage-move' }, move, h('span', { text: `Move my ${info.count} ${info.count === 1 ? 'essay' : 'essays'} there too` }));
  const go = h('button', { type: 'button', class: 'pill solid', text: 'Use this folder' });
  const paint = () => {
    list.replaceChildren(
      ...options.map((item) => {
        const row = h(
          'button',
          { type: 'button', class: `storage-option${item.path === picked ? ' on' : ''}` },
          h('span', { class: 'storage-option-icon', html: icon(STORE_ICONS[item.kind] || 'folder', 20) }),
          h('span', { class: 'storage-option-main' }, h('b', { text: item.name }), h('span', { text: item.path })),
          h('span', { class: 'storage-option-tag', text: item.path === info.current ? 'Now' : item.kind === 'local' ? 'No backup' : 'Backed up' }),
        );
        row.addEventListener('click', () => {
          picked = item.path;
          paint();
        });
        return row;
      }),
    );
    const native = typeof nativeApi === 'function' && nativeApi();
    if (native && native.choose_folder) {
      const other = h('button', { type: 'button', class: 'storage-option other' }, h('span', { class: 'storage-option-icon', html: icon('folder', 20) }), h('span', { class: 'storage-option-main' }, h('b', { text: 'Choose another folder…' }), h('span', { text: 'Any folder, for example a USB stick' })));
      other.addEventListener('click', async () => {
        const folder = await native.choose_folder();
        if (!folder) return;
        options.push({ kind: 'other', name: folder.split(/[\\/]/).pop() || folder, path: folder, exists: true });
        picked = folder;
        paint();
      });
      list.append(other);
    }
    const same = picked === info.current;
    moveRow.hidden = same || !info.count;
    go.disabled = same;
  };
  go.addEventListener('click', async () => {
    go.disabled = true;
    go.textContent = 'Moving…';
    const answer = await api('/api/storage_set', { path: picked, move: !moveRow.hidden && move.checked }).catch((error) => ({ error: String(error) }));
    if (answer.error) {
      toast(answer.error, true);
      go.disabled = false;
      go.textContent = 'Use this folder';
      return;
    }
    storageClose();
    STORE.info = answer;
    toast(answer.cloud ? `Your essays are now backed up in ${answer.service}` : 'Your essays are now saved in the new folder');
    const state = await (await fetch('/api/state')).json();
    if (!state.open) showStart(state);
  });
  paint();
  const back = h('div', { id: 'storageSheet', class: 'keys-back' });
  const card = h(
    'div',
    { class: 'keys-card storage-card' },
    h('div', { class: 'keys-head' }, h('span', { text: 'Where your essays are saved' }), h('button', { type: 'button', class: 'round', html: icon('close', 16), title: 'Close', onclick: storageClose })),
    h('p', { class: 'storage-lead', text: 'Pick a folder that OneDrive, Google Drive or Dropbox backs up, and your essays are safe even if this computer breaks. You can open them on any computer with Essay Builder.' }),
    list,
    moveRow,
    h('div', { class: 'storage-foot' }, h('button', { type: 'button', class: 'pill ghost', text: 'Cancel', onclick: storageClose }), go),
  );
  back.append(card);
  back.addEventListener('mousedown', (event) => {
    if (event.target === back) storageClose();
  });
  document.body.append(back);
}

document.addEventListener(
  'keydown',
  (event) => {
    if (event.key === 'Escape' && document.getElementById('storageSheet')) {
      event.preventDefault();
      event.stopPropagation();
      storageClose();
    }
  },
  true,
);

function conflictFolder() {
  const path = String(S.path || '');
  return path.slice(0, Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/')) + 1);
}

function conflictAsk() {
  if (STORE.asking || !S.name) return;
  STORE.asking = true;
  const done = () => {
    STORE.asking = false;
    back.remove();
  };
  const both = h('button', { type: 'button', class: 'pill solid', text: 'Keep both' });
  const theirs = h('button', { type: 'button', class: 'pill ghost', text: 'Use the other version' });
  both.addEventListener('click', async () => {
    const answer = await api('/api/resolve', { mode: 'both', source: S.source }).catch(() => ({}));
    savedSource = S.source;
    done();
    const copy = answer.copy;
    toast(copy ? `Saved both. The other version is the essay “${copy}”.` : 'Saved.', false, copy ? [{ label: 'Open it', run: () => openPath(`${conflictFolder()}${copy}.txt`) }] : []);
  });
  theirs.addEventListener('click', async () => {
    await api('/api/resolve', { mode: 'theirs', source: S.source }).catch(() => ({}));
    done();
    savedSource = null;
    await openPath(S.path);
    toast('Switched to the other version. Yours is kept in Saved versions.', false, [{ label: 'Versions', run: () => openVersions() }]);
  });
  const back = h('div', { id: 'conflictSheet', class: 'keys-back' });
  back.append(
    h(
      'div',
      { class: 'keys-card storage-card' },
      h('div', { class: 'keys-head' }, h('span', { text: 'This essay was changed somewhere else' })),
      h('p', { class: 'storage-lead', text: 'While it was open here, it was also edited somewhere else, for example on another computer through OneDrive. Nothing has been lost.' }),
      h('div', { class: 'conflict-choices' },
        h('div', {}, h('b', { text: 'Keep both' }), h('span', { text: 'Your version stays here. The other version is saved next to it as its own essay.' })),
        h('div', {}, h('b', { text: 'Use the other version' }), h('span', { text: 'Your version is kept in Saved versions, so you can bring it back.' })),
      ),
      h('div', { class: 'storage-foot' }, theirs, both),
    ),
  );
  document.body.append(back);
}

async function diskCheck() {
  if (!S.name || document.documentElement.classList.contains('home') || STORE.asking || STORE.checking) return;
  if (S.dirty || S.source !== savedSource || (typeof FLOW !== 'undefined' && FLOW.pop)) return;
  STORE.checking = true;
  try {
    const answer = await api('/api/disk');
    if (answer && answer.changed && S.source === savedSource && !S.dirty) {
      await openPath(S.path);
      toast('Updated with changes made somewhere else.');
    }
  } catch (error) {
    return;
  } finally {
    STORE.checking = false;
  }
}

window.addEventListener('focus', diskCheck);
setInterval(diskCheck, 20000);
