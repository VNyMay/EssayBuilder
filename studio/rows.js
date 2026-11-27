const ROWS_AS_TEXT = new Set();
let rowsListId = 0;

function rowsDepth(spec, item) {
  if (spec.outline) return item.depth || 0;
  const shape = spec.types[item.type];
  return shape && shape.depth ? shape.depth : 0;
}

function rowsShape(spec, item) {
  return spec.types[item.type] || RAW_TYPE;
}

function rowsEnd(spec, items, index) {
  const depth = rowsDepth(spec, items[index]);
  let end = index + 1;
  if (!spec.outline && !rowsShape(spec, items[index]).group) return end;
  while (end < items.length && rowsDepth(spec, items[end]) > depth) end += 1;
  return end;
}

function rowsFilled(item) {
  return Object.entries(item).some(([key, value]) => !['type', 'depth', 'mark', 'style', 'chain', 'way', 'reply', 'word', 'done'].includes(key) && String(value ?? '').trim() !== '');
}

function rowsInput(item, field, ctx) {
  const value = item[field.key] ?? '';
  if (field.kind === 'check') {
    const box = h('input', { type: 'checkbox', 'data-k': field.key });
    box.checked = Boolean(value);
    box.addEventListener('change', () => {
      item[field.key] = box.checked;
      ctx.changed(true);
    });
    return h('div', { class: 'field rw-check' }, box);
  }
  if (field.kind === 'choice') {
    const choices = field.choices.map(([v, label]) => ({ value: v, label }));
    if (!choices.some((choice) => choice.value.toLowerCase() === String(value).toLowerCase())) choices.push({ value, label: value || '—' });
    const hit = choices.find((choice) => choice.value.toLowerCase() === String(value).toLowerCase());
    const pick = dropdown({
      choices,
      value: hit ? hit.value : value,
      onPick: (picked) => {
        item[field.key] = picked;
        ctx.changed(true);
      },
    });
    pick.dataset.k = field.key;
    return h('div', { class: `field rw-choice${field.size ? ` rw-${field.size}` : ''}`, style: field.grow ? `flex-grow:${field.grow}` : '' }, pick);
  }
  if (field.kind === 'file') {
    const url = value && typeof fileUrl === 'function' ? fileUrl(value) : '';
    const thumb = h('span', { class: 'rw-thumb' });
    if (url && /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(value)) thumb.append(h('img', { src: url, alt: '' }));
    else thumb.innerHTML = icon('image', 16);
    const choose = h('button', {
      type: 'button',
      class: 'rw-file',
      title: value || 'Choose image',
      html: `${thumb.outerHTML}<span>${value ? value.split(/[\\/]/).pop().replace(/</g, '&lt;') : 'Choose image'}</span>`,
      onclick: async () => {
        const file = await pickFile(field.accept || '');
        if (!file) return;
        const path = await upload(file);
        if (!path) return;
        item[field.key] = path;
        ctx.changed(true);
        ctx.render();
      },
    });
    return h('div', { class: 'field rw-filefield', style: field.grow ? `flex-grow:${field.grow}` : '' }, choose);
  }
  const input = h('input', {
    type: field.kind === 'number' ? 'number' : 'text',
    spellcheck: 'false',
    placeholder: field.placeholder || '',
    'data-k': field.key,
    class: `${field.mono ? 'mono' : ''}${field.kind === 'number' ? ' rw-num' : ''}`.trim(),
  });
  if (field.kind === 'number') input.step = 'any';
  input.value = value;
  const suggest = typeof field.suggest === 'function' ? field.suggest(ctx.model) : field.suggest;
  if (suggest && suggest.length) {
    rowsListId += 1;
    const list = h('datalist', { id: `rw-list-${rowsListId}` }, suggest.map((text) => h('option', { value: text })));
    input.setAttribute('list', list.id);
    ctx.lists.append(list);
  }
  if (field.size === 'auto') {
    const fit = () => {
      input.style.width = `${Math.max(2.4, input.value.length + 1.2)}ch`;
    };
    fit();
    input.addEventListener('input', fit);
  }
  input.addEventListener('input', () => {
    item[field.key] = input.value;
    ctx.changed(false);
  });
  const cls = `field${field.size ? ` rw-${field.size}` : ''}${field.cls ? ` rw-${field.cls}` : ''}${field.line ? ' rw-line' : ''}`;
  return h('div', { class: cls, style: `${field.grow ? `flex-grow:${field.grow};` : ''}${field.min ? `min-width:${field.min}px` : ''}` }, input);
}

function rowsEditor({ items, spec, model, onChange }) {
  const box = h('div', { class: `rw${spec.inline ? ' rw-inline' : ''}${spec.outline ? ' rw-outline' : ''}${spec.lead ? ' rw-boxes' : ''}` });
  const list = h('div', { class: 'rw-list' });
  const lists = h('div', { hidden: true });
  const foot = h('div', { class: 'rw-foot' });
  box.append(list, foot, lists);
  const changed = (structural) => onChange(structural);
  const focusRow = (index, which = 0, atEnd = true) => {
    const row = list.querySelector(`.rw-row[data-i="${index}"]`);
    if (!row) return;
    const inputs = [...row.querySelectorAll('input[type=text],input[type=number],button.drop,button.rw-file')];
    const blank = which === 'empty' ? inputs.find((input) => input.tagName === 'INPUT' && !input.value && !input.closest('.rw-arrow')) : null;
    const target = blank || inputs[which === -1 ? inputs.length - 1 : which === 'empty' ? 0 : Math.min(which, inputs.length - 1)];
    if (!target) return;
    target.focus();
    if (target.setSelectionRange && target.type === 'text') {
      const at = atEnd ? target.value.length : 0;
      target.setSelectionRange(at, at);
    }
  };
  const insert = (index, type, prev) => {
    const item = rowBlank(spec, type, prev, items);
    if (spec.outline) item.depth = prev ? prev.depth || 0 : 0;
    items.splice(index, 0, item);
    changed(true);
    render();
    focusRow(index, 'empty', false);
  };
  const moveBlock = (start, end, slot) => {
    if (slot >= start && slot <= end) return false;
    const block = items.splice(start, end - start);
    const at = slot > start ? slot - block.length : slot;
    if (spec.outline) {
      const before = at > 0 ? items[at - 1] : null;
      const limit = before ? (before.depth || 0) + 1 : 0;
      const shift = Math.min(0, limit - (block[0].depth || 0));
      if (shift) block.forEach((item) => { item.depth = Math.max(0, (item.depth || 0) + shift); });
    }
    items.splice(at, 0, ...block);
    changed(true);
    render();
    focusRow(at);
    return true;
  };
  const sibling = (index, direction) => {
    const depth = rowsDepth(spec, items[index]);
    if (direction < 0) {
      for (let j = index - 1; j >= 0; j -= 1) {
        const d = rowsDepth(spec, items[j]);
        if (d < depth) return -1;
        if (d === depth) return j;
      }
      return -1;
    }
    const end = rowsEnd(spec, items, index);
    if (end >= items.length || rowsDepth(spec, items[end]) !== depth) return -1;
    return rowsEnd(spec, items, end);
  };
  const shiftDepth = (index, delta) => {
    if (!spec.outline) return;
    const item = items[index];
    const depth = item.depth || 0;
    if (delta > 0 && (index === 0 || depth > (items[index - 1].depth || 0))) return;
    if (delta < 0 && depth === 0) return;
    const end = rowsEnd(spec, items, index);
    for (let j = index; j < end; j += 1) items[j].depth = Math.max(0, (items[j].depth || 0) + delta);
    changed(true);
    render();
  };
  const remove = (index) => {
    const end = rowsShape(spec, items[index]).group ? rowsEnd(spec, items, index) : index + 1;
    items.splice(index, end - index);
    changed(true);
    render();
    focusRow(Math.max(0, index - 1), -1);
  };
  const keys = (event, index, which) => {
    const target = event.target;
    const text = target.tagName === 'INPUT';
    const item = items[index];
    const shape = rowsShape(spec, item);
    if (event.key === 'Enter' && text && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      const type = shape.enter || item.type;
      insert(index + 1, type === 'raw' ? Object.keys(spec.types)[0] : type, item);
      return;
    }
    const single = shape.fields.filter((field) => field.key).length === 1;
    const nudge = (event.key === 'Tab' && single && !event.ctrlKey && !event.altKey) || ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && event.altKey);
    if (spec.outline && nudge) {
      event.preventDefault();
      shiftDepth(index, event.shiftKey || event.key === 'ArrowLeft' ? -1 : 1);
      focusRow(index, which);
      return;
    }
    if (event.key === 'Backspace' && text && target.selectionStart === 0 && target.selectionEnd === 0 && which === 0 && !rowsFilled(item)) {
      event.preventDefault();
      remove(index);
      return;
    }
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && event.altKey) {
      event.preventDefault();
      const end = rowsEnd(spec, items, index);
      const slot = event.key === 'ArrowUp' ? sibling(index, -1) : sibling(index, 1);
      if (slot >= 0) moveBlock(index, end, slot);
      return;
    }
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && text && target.type === 'text' && !event.shiftKey && !event.ctrlKey && !spec.inline) {
      event.preventDefault();
      focusRow(index + (event.key === 'ArrowUp' ? -1 : 1), which);
    }
  };
  const drag = (event, index) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const grip = event.currentTarget;
    grip.setPointerCapture(event.pointerId);
    const end = rowsEnd(spec, items, index);
    const rows = [...list.querySelectorAll('.rw-row[data-i]')];
    rows.slice(index, end).forEach((row) => row.classList.add('rw-dragging'));
    box.classList.add('rw-sorting');
    const marker = h('div', { class: `rw-drop${spec.inline ? ' rw-drop-v' : ''}` });
    list.append(marker);
    let slot = -1;
    const move = (e) => {
      slot = items.length;
      for (let j = 0; j < rows.length; j += 1) {
        const rect = rows[j].getBoundingClientRect();
        const before = spec.inline ? e.clientY < rect.top || (e.clientY < rect.bottom && e.clientX < rect.left + rect.width / 2) : e.clientY < rect.top + rect.height / 2;
        if (before) {
          slot = j;
          break;
        }
      }
      if (spec.lead && slot === 0 && items[index].type !== spec.lead) slot = 1;
      const inside = slot > index && slot < end;
      marker.hidden = inside || slot === index || slot === end;
      const ref = rows[slot] || rows[rows.length - 1];
      if (spec.inline) {
        marker.style.left = `${rows[slot] ? ref.offsetLeft - 4 : ref.offsetLeft + ref.offsetWidth + 2}px`;
        marker.style.top = `${ref.offsetTop}px`;
        marker.style.height = `${ref.offsetHeight}px`;
      } else marker.style.top = `${rows[slot] ? ref.offsetTop - 2 : ref.offsetTop + ref.offsetHeight + 1}px`;
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      box.classList.remove('rw-sorting');
      marker.remove();
      rows.forEach((row) => row.classList.remove('rw-dragging'));
      if (slot >= 0 && !(slot >= index && slot <= end)) moveBlock(index, end, slot);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  };
  const ctx = { model, lists, changed, render: () => render() };
  const row = (item, index) => {
    const shape = rowsShape(spec, item);
    const depth = rowsDepth(spec, item);
    const node = h('div', { class: `rw-row${shape.cls ? ` rw-${shape.cls}` : ''}`, 'data-i': String(index), style: `--d:${depth}` });
    const grip = h('span', { class: 'rw-grip', title: 'Drag to move', html: icon('grip', 14) });
    grip.addEventListener('pointerdown', (event) => drag(event, index));
    const cells = h('div', { class: 'rw-cells' });
    let which = 0;
    shape.fields.forEach((field) => {
      if (field.sep) {
        cells.append(h('span', { class: 'rw-sep', text: field.sep }));
        return;
      }
      const cell = rowsInput(item, field, ctx);
      const at = which;
      cell.addEventListener('keydown', (event) => keys(event, index, at));
      cells.append(cell);
      which += 1;
    });
    const tools = h('span', { class: 'rw-tools' });
    node.addEventListener('focusin', () => {
      current = index;
    });
    tools.append(h('button', { type: 'button', class: 'rw-tool rw-cut', tabindex: '-1', title: shape.group ? 'Remove with its items' : 'Remove', html: icon('close', 12), onclick: () => remove(index) }));
    node.append(grip, cells, tools);
    return node;
  };
  const heads = () => {
    const shape = spec.types.item;
    if (spec.inline || !shape || !items.length || !shape.fields.some((field) => field.label)) return null;
    const cells = h('div', { class: 'rw-cells' });
    shape.fields.forEach((field) => {
      if (field.line) return;
      if (field.sep) cells.append(h('span', { class: 'rw-sep', text: field.sep }));
      else cells.append(h('span', { class: `field${field.size ? ` rw-${field.size}` : ''}${field.kind === 'check' ? ' rw-check' : ''}`, style: field.grow ? `flex-grow:${field.grow}` : '', text: field.label || '' }));
    });
    return h('div', { class: 'rw-row rw-labels', style: '--d:0' }, h('span', { class: 'rw-grip' }), cells, h('span', { class: 'rw-tools' }, h('span', { class: 'rw-tool' })));
  };
  const render = () => {
    lists.replaceChildren();
    list.replaceChildren();
    const top = heads();
    if (top) list.append(top);
    items.forEach((item, index) => {
      list.append(row(item, index));
      if (!spec.lead) return;
      const owner = rowsOwner(index);
      if (owner < 0) return;
      const shape = rowsShape(spec, items[owner]);
      const end = rowsEnd(spec, items, owner);
      if (!shape.child || index !== end - 1) return;
      list.append(h('button', {
        type: 'button',
        class: 'rw-addin',
        style: '--d:1',
        html: `${icon('plus', 13)}<span>${shape.childLabel || 'Item'}</span>`,
        onclick: () => insert(end, shape.child, items[end - 1]),
      }));
    });
    if (!items.length) list.append(h('div', { class: 'rw-empty', text: 'Nothing yet' }));
  };
  const rowsOwner = (index) => {
    for (let j = index; j >= 0; j -= 1) if (rowsShape(spec, items[j]).group) return j;
    return -1;
  };
  let current = -1;
  if (spec.outline) {
    const nudge = (delta) => {
      const at = current >= 0 && current < items.length ? current : items.length - 1;
      if (at < 0) return;
      shiftDepth(at, delta);
      focusRow(at);
    };
    foot.append(h('span', { class: 'rw-nudge' },
      h('button', { type: 'button', class: 'rw-tool', 'data-dir': 'out', title: 'Move out (Alt+Left)', html: icon('chevron', 14), onmousedown: (event) => event.preventDefault(), onclick: () => nudge(-1) }),
      h('button', { type: 'button', class: 'rw-tool', 'data-dir': 'in', title: 'Move in (Alt+Right)', html: icon('chevron', 14), onmousedown: (event) => event.preventDefault(), onclick: () => nudge(1) }),
    ));
  }
  (spec.add || []).forEach((entry) => {
    foot.append(h('button', {
      type: 'button',
      class: 'pill ghost small',
      html: `${icon('plus', 14)}<span>${entry.label}</span>`,
      onclick: () => {
        const last = [...items].reverse().find((item) => item.type === entry.type) || items[items.length - 1];
        insert(items.length, entry.type, last && last.type === entry.type ? last : null);
        if (spec.lead && rowsShape(spec, items[items.length - 1]).child) {
          const owner = items.length - 1;
          items.push(rowBlank(spec, rowsShape(spec, items[owner]).child, null, items));
          changed(true);
          render();
          focusRow(owner + 1, 0);
        }
      },
    }));
  });
  render();
  return box;
}

function rowsForm(spec, items, model, onChange) {
  const values = items.form || (items.form = {});
  return spec.form.map((field) => {
    const input = h('input', { type: field.kind === 'number' ? 'number' : 'text', spellcheck: 'false', placeholder: field.placeholder || '', step: 'any' });
    input.value = values[field.key] ?? '';
    input.addEventListener('input', () => {
      values[field.key] = input.value;
      onChange(false);
    });
    return line(field.label, h('div', { class: 'field' }, input));
  });
}

function rowsSection(model, kind, title, { placeholder = '', rows = 9, mono = true } = {}) {
  const spec = rowSpec(kind);
  const holder = h('div', { class: 'sec rw-sec' });
  const items = spec && !ROWS_AS_TEXT.has(kind) ? rowItems(kind, model.body) : null;
  const toggle = spec ? h('button', {
    type: 'button',
    class: `rw-mode${items ? '' : ' on'}`,
    title: items ? 'Edit as text' : 'Edit as a list',
    html: `${icon(items ? 'code' : 'list', 14)}<span>${items ? 'Text' : 'List'}</span>`,
    onclick: () => {
      if (ROWS_AS_TEXT.has(kind)) ROWS_AS_TEXT.delete(kind);
      else ROWS_AS_TEXT.add(kind);
      renderPanel();
    },
  }) : null;
  if (spec && !items && !ROWS_AS_TEXT.has(kind)) toggle.hidden = true;
  holder.append(h('div', { class: 'rw-head' }, h('div', { class: 'group-title', text: title }), toggle));
  if (!items) {
    holder.append(bodyArea(model, { label: '', placeholder, mono, rows }));
    return holder;
  }
  if (spec.grid) {
    const width = Math.max(...items.map((cells) => cells.length));
    const pipe = items.map((cells) => `| ${[...cells, ...Array(width - cells.length).fill('')].join(' | ')} |`);
    pipe.splice(1, 0, `|${Array(width).fill(' --- ').join('|')}|`);
    holder.append(dataGrid(pipe, (lines) => {
      const rows = lines.filter((text, index) => index !== 1).map((text) => splitPipeLine(text));
      model.body = rowLines(kind, rows);
      commitPanel(600);
    }));
    return holder;
  }
  const save = (structural) => {
    model.body = rowLines(kind, items);
    commitPanel(structural ? 200 : 600);
  };
  if (spec.form) holder.append(...rowsForm(spec, items, model, save));
  if (!spec.form || (spec.add && spec.add.length) || items.length) holder.append(rowsEditor({ items, spec, model, onChange: save }));
  return holder;
}
