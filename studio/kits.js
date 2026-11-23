function registerKit(spec) {
  spec.kinds.forEach((kit) => {
    const options = kit.options || [];
    const keys = { ...SHARED, ...(kit.keys || {}) };
    options.forEach((option) => {
      keys[option.key] = option.type === 'switch' ? 'y' : option.type === 'number' ? 'n' : option.type === 'choice' ? option.choices.map((choice) => choice[0]) : 't';
    });
    BLOCKS[kit.kind] = { label: kit.label, keys, body: kit.bodyLabel || 'Content' };
    if (kit.iconPath) ICONS[kit.kind] = kit.iconPath;
    TEMPLATES.push({ group: spec.group, id: kit.kind, label: kit.label, icon: kit.iconPath ? kit.kind : kit.icon || 'diagram', kind: kit.kind, lines: kit.template });
    PANELS[kit.kind] = (model, body, range) => {
      if (kit.hasBody !== false) {
        body.append(section(kit.bodyTitle || 'Content', bodyArea(model, { label: '', placeholder: kit.hint || '', mono: kit.mono !== false, rows: kit.rows || 9 })));
      }
      options.forEach((option) => {
        const current = rowGet(model, option.key, option.value ?? '');
        let control;
        if (option.type === 'switch') {
          control = switchField(['yes', 'true', 'on'].includes(String(current).toLowerCase()), (on) => {
            rowSet(model, option.key, on ? 'yes' : 'no');
            commitPanel(150);
          });
        } else if (option.type === 'choice') {
          control = segmented(option.choices.map((choice) => ({ value: choice[0], label: choice[1] })), current, (value) => {
            rowSet(model, option.key, value);
            commitPanel(150);
          });
        } else if (option.type === 'number') {
          control = stepper({ value: Number(current) || Number(option.value) || 0, min: option.min ?? 0, max: option.max ?? 99, onChange: (value) => {
            rowSet(model, option.key, String(value));
            commitPanel(250);
          } });
        } else {
          const input = h('input', { type: 'text', spellcheck: 'false', placeholder: option.placeholder || '' });
          input.value = current;
          input.addEventListener('input', () => {
            rowSet(model, option.key, input.value);
            commitPanel(500);
          });
          control = stackLine('', input);
        }
        body.append(section(option.label, control));
      });
      if (kit.layout !== false) body.append(layoutSection(model, 'diagram', range));
      if (kit.caption !== false) body.append(captionSection(model));
      moreSection(body, model, kit.kind, ['caption', 'source', 'width', 'align', 'wrap', ...options.map((option) => option.key)]);
    };
  });
}
