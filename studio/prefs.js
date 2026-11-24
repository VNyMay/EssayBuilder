(() => {
  const saved = window.SAVED_PREFS || {};
  Object.keys(saved).forEach((key) => localStorage.setItem(key, saved[key]));
  const set = Storage.prototype.setItem;
  const remove = Storage.prototype.removeItem;
  let timer = 0;
  const push = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key.startsWith('studio.')) out[key] = localStorage.getItem(key);
      }
      fetch('/api/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(out), keepalive: true }).catch(() => null);
    }, 250);
  };
  Storage.prototype.setItem = function (key, value) {
    set.call(this, key, value);
    if (this === localStorage && String(key).startsWith('studio.')) push();
  };
  Storage.prototype.removeItem = function (key) {
    remove.call(this, key);
    if (this === localStorage && String(key).startsWith('studio.')) push();
  };
  if (Object.keys(saved).length === 0) push();
})();
