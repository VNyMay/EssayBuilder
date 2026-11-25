function registerKit(spec) {
  spec.kinds.forEach((kit) => {
    const options = kit.options || [];
    const keys = { ...SHARED, ...(kit.keys || {}) };
    options.forEach((option) => {
      if (option.type === 'header') return;
      keys[option.key] = option.type === 'switch' ? 'y' : option.type === 'number' ? 'n' : option.type === 'choice' ? option.choices.map((choice) => choice[0]) : 't';
    });
    BLOCKS[kit.kind] = { label: kit.label, keys, body: kit.bodyLabel || 'Content' };
    if (kit.iconPath) ICONS[kit.kind] = kit.iconPath;
    TEMPLATES.push({ group: spec.group, id: kit.kind, label: kit.label, icon: kit.iconPath ? kit.kind : kit.icon || 'diagram', kind: kit.kind, lines: kit.template });
    PANELS[kit.kind] = (model, body, range) => {
      if (kit.hasBody !== false) {
        if (isProse(range)) body.append(section(null, proseHint()));
        else body.append(section(kit.bodyTitle || 'Content', bodyArea(model, { label: '', placeholder: kit.hint || '', mono: kit.mono !== false, rows: kit.rows || 9 })));
      }
      const rows = options.map((option) => {
        const current = rowGet(model, option.key, option.value ?? '');
        if (option.type === 'header') {
          return stackLine(option.label, segmented(option.choices.map((choice) => ({ value: choice[0], label: choice[1] })), (headerValue(option.key) || option.value || '').toLowerCase(), (value) => (option.key === 'citations' ? setCitationStyle(value) : setHeader(option.key, value))));
        }
        if (option.type === 'switch') {
          return line(option.label, switchField(['yes', 'true', 'on'].includes(String(current).toLowerCase()), (on) => {
            rowSet(model, option.key, on ? 'yes' : 'no');
            commitPanel(150);
          }));
        }
        if (option.type === 'choice') {
          return stackLine(option.label, segmented(option.choices.map((choice) => ({ value: choice[0], label: choice[1] })), current, (value) => {
            rowSet(model, option.key, value);
            commitPanel(150);
          }));
        }
        if (option.type === 'number') {
          return line(option.label, stepper({ value: Number(current) || Number(option.value) || 0, min: option.min ?? 0, max: option.max ?? 99, onChange: (value) => {
            rowSet(model, option.key, String(value));
            commitPanel(250);
          } }));
        }
        return line(option.label, plainInput(current, (value) => {
          rowSet(model, option.key, value);
          commitPanel(500);
        }, option.placeholder || ''));
      });
      if (kit.argNumber) {
        const spec = kit.argNumber;
        rows.unshift(line(spec.label, stepper({ value: Number(String(model.args || '').trim()) || spec.min, min: spec.min, max: spec.max, onChange: (value) => {
          model.args = String(value);
          commitPanel(250);
        } })));
      }
      if (rows.length) body.append(section('Options', ...rows));
      if (kit.layout !== false) body.append(layoutSection(model, 'diagram', range));
      if (kit.caption !== false) body.append(captionSection(model));
      moreSection(body, model, kit.kind, ['caption', 'source', 'width', 'align', 'wrap', ...options.map((option) => option.key)]);
    };
  });
}
