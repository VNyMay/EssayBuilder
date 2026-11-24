const PLACES = { countries: [], regions: [], loaded: false };
const openLayers = new WeakSet();
let moreOpen = false;

async function loadPlaces() {
  if (PLACES.loaded) return;
  try {
    const data = await (await fetch('/api/places')).json();
    PLACES.countries = data.countries || [];
    PLACES.regions = data.regions || [];
    PLACES.loaded = true;
    if (S.panel && S.panel.range.kind === 'map') renderPanel();
  } catch (error) {
    PLACES.loaded = false;
  }
}

function textLine(label, model, key, { placeholder = '', delay = 700, stack = false } = {}) {
  const input = h('input', { type: 'text', spellcheck: 'false', placeholder });
  input.value = rowGet(model, key);
  input.addEventListener('input', () => {
    rowSet(model, key, input.value);
    commitPanel(delay);
  });
  const field = h('div', { class: 'field' }, input);
  return stack ? stackLine(label, field) : line(label, field);
}

function plainInput(value, onInput, placeholder = '') {
  const input = h('input', { type: 'text', spellcheck: 'false', placeholder });
  input.value = value;
  input.addEventListener('input', () => onInput(input.value));
  return h('div', { class: 'field' }, input);
}

function bodyArea(model, { label, placeholder = '', mono = false, rows = 7 }) {
  const area = h('textarea', { spellcheck: 'false', placeholder, rows, class: mono ? 'mono' : '' });
  area.value = model.body.join('\n');
  area.addEventListener('input', () => {
    model.body = area.value.split('\n');
    commitPanel(700);
  });
  return stackLine(label, area);
}

function yesNoLine(label, model, key, { defaultOn = false, title = '' } = {}) {
  const value = rowGet(model, key).toLowerCase();
  const on = value ? !['no', 'off', 'false', 'none'].includes(value) : defaultOn;
  return line(label, switchField(on, (checked) => {
    if (defaultOn) rowSet(model, key, checked ? '' : 'no');
    else rowSet(model, key, checked ? 'yes' : '');
    commitPanel(150);
  }, title));
}

function captionSection(model) {
  return section(null, textLine('Caption', model, 'caption'), textLine('Source', model, 'source'));
}

function moreSection(body, model, kind, shown) {
  const holder = h('div', { class: 'more' });
  const content = h('div', { class: 'more-body' });
  content.hidden = !moreOpen;
  const head = h('button', {
    type: 'button',
    class: `more-head${moreOpen ? ' open' : ''}`,
    html: `<span>More options</span>${icon('chevron', 16)}`,
    onclick: () => {
      moreOpen = !moreOpen;
      content.hidden = !moreOpen;
      head.classList.toggle('open', moreOpen);
    },
  });
  genericEditor(content, model, schemaOf(kind === 'pipetable' ? 'table' : kind), new Set(shown), false);
  holder.append(head, content);
  body.append(holder);
}

function imagePanel(model, body, range) {
  body.append(
    section('Image', fileChooser({
      value: rowGet(model, 'src'),
      accept: 'image/*',
      onPick: (path) => {
        rowSet(model, 'src', path);
        commitPanel(150);
        renderPanel();
      },
    })),
    layoutSection(model, 'figure', range),
    captionSection(model),
    section(null, yesNoLine('Border', model, 'border')),
  );
  moreSection(body, model, 'figure', ['src', 'caption', 'source', 'border', 'width', 'align', 'wrap']);
}

function tablePanel(model, body, range) {
  const src = rowGet(model, 'src');
  const looks = [
    { value: 'classic', label: 'Classic', art: LOOK_ART.classic },
    { value: 'grid', label: 'Grid', art: LOOK_ART.grid },
    { value: 'striped', label: 'Striped', art: LOOK_ART.striped },
    { value: 'minimal', label: 'Minimal', art: LOOK_ART.minimal },
  ];
  body.append(section('Look', cards(looks, rowGet(model, 'style') || 'classic', (value) => {
    rowSet(model, 'style', value === 'classic' ? '' : value, range);
    commitPanel(150);
  }, 4)));
  if (src) {
    body.append(section('Data', fileChooser({
      value: src,
      accept: '.csv,.tsv,.xlsx,.json',
      onPick: (path) => {
        rowSet(model, 'src', path);
        commitPanel(150);
        renderPanel();
      },
    })));
  }
  const decimals = rowGet(model, 'decimals');
  const numeric = decimals === '' || /^\d+$/.test(decimals);
  const align = rowGet(model, 'align');
  const alignChoices = [
    { value: '', label: 'Auto', title: 'Numbers right, text left' },
    { value: 'left', icon: 'alignLeft', title: 'Left' },
    { value: 'center', icon: 'alignCenter', title: 'Centre' },
    { value: 'right', icon: 'alignRight', title: 'Right' },
  ];
  body.append(
    section(
      'Options',
      yesNoLine('Header row', model, 'header', { defaultOn: true }),
      yesNoLine('Total row', model, 'total'),
      yesNoLine('Swap rows and columns', model, 'transpose'),
      line('Decimal places', numeric
        ? stepper({ value: decimals, min: 0, max: 8, onChange: (value) => {
          rowSet(model, 'decimals', String(value), range);
          commitPanel(250);
        } })
        : plainInput(decimals, (value) => {
          rowSet(model, 'decimals', value, range);
          commitPanel(500);
        })),
      stackLine('Number alignment', /\s/.test(align.trim()) ? plainInput(align, (value) => {
        rowSet(model, 'align', value, range);
        commitPanel(500);
      }) : segmented(alignChoices, align, (value) => {
        rowSet(model, 'align', value, range);
        commitPanel(150);
      })),
      stackLine('Size', segmented([
        { value: '', label: 'Normal' },
        { value: 'small', label: 'Small' },
        { value: 'tiny', label: 'Tiny' },
      ], rowGet(model, 'size'), (value) => {
        rowSet(model, 'size', value, range);
        commitPanel(150);
      })),
    ),
    layoutSection(model, 'table', range),
    captionSection(model),
  );
  moreSection(body, model, 'table', ['src', 'style', 'header', 'total', 'transpose', 'decimals', 'align', 'size', 'width', 'place', 'wrap', 'caption', 'source']);
}

function bodyHeader(model) {
  const first = model.body.find((item) => item.trim());
  if (!first) return [];
  return parseGrid([first]).rows[0].filter(Boolean);
}

function yPicker(model, header, xcol) {
  const current = rowGet(model, 'y');
  const names = header.filter((name) => name !== xcol);
  if (/=/.test(current) || !names.length) return plainInput(current, (value) => {
    rowSet(model, 'y', value);
    commitPanel(500);
  });
  const picked = current ? current.split(',').map((part) => part.trim()).filter(Boolean) : [];
  const box = h('div', { class: 'chips wide' });
  names.forEach((name) => {
    const on = picked.length ? picked.includes(name) : true;
    box.append(h('button', {
      type: 'button',
      class: `chip${on ? ' on' : ''}`,
      text: name,
      onclick: () => {
        let next = picked.length ? picked.slice() : names.slice();
        next = next.includes(name) ? next.filter((item) => item !== name) : [...next, name];
        if (!next.length) return;
        rowSet(model, 'y', next.length === names.length ? '' : next.join(', '));
        commitPanel(250);
        renderPanel();
      },
    }));
  });
  return box;
}

function chartPanel(model, body, range) {
  const type = rowGet(model, 'type') || 'line';
  const types = ['line', 'scatter', 'bar', 'hbar', 'hist', 'pie', 'donut', 'function'].map((value) => ({
    value,
    label: { hbar: 'Bars (side)', hist: 'Histogram', function: 'Formula' }[value] || value.charAt(0).toUpperCase() + value.slice(1),
    art: CHART_ART[value],
  }));
  body.append(section('Type', cards(types, type, (value) => {
    rowSet(model, 'type', value === 'line' ? '' : value);
    commitPanel(150);
    renderPanel();
  }, 4)));
  const src = rowGet(model, 'src');
  if (type === 'function') {
    const formulas = model.rows.filter((row) => row.key === 'f');
    const list = h('div', { class: 'stackcol' });
    formulas.forEach((row) => {
      list.append(h(
        'div',
        { class: 'inline-row' },
        plainInput(row.value, (value) => {
          row.value = value;
          commitPanel(700);
        }, 'sin(x)'),
        h('button', { type: 'button', class: 'mini', html: icon('close', 13), title: 'Remove formula', onclick: () => {
          model.rows.splice(model.rows.indexOf(row), 1);
          commitPanel(250);
          renderPanel();
        } }),
      ));
    });
    list.append(h('button', { type: 'button', class: 'pill ghost small', html: `${icon('plus', 14)}<span>Formula</span>`, onclick: () => {
      model.rows.push({ key: 'f', value: 'x^2' });
      commitPanel(250);
      renderPanel();
    } }));
    body.append(section('Formulas', list, textLine('Range of x', model, 'domain', { placeholder: '-6..6' })));
  } else {
    const dataBody = [];
    if (src) {
      dataBody.push(fileChooser({
        value: src,
        accept: '.csv,.tsv,.xlsx,.json',
        onPick: (path) => {
          rowSet(model, 'src', path);
          commitPanel(150);
          renderPanel();
        },
      }));
    } else if (model.body.some((item) => item.trim())) {
      dataBody.push(dataGrid(model.body, (lines) => {
        model.body = lines;
        commitPanel(700);
      }));
    } else {
      dataBody.push(h('div', { class: 'inline-row' },
        fileChooser({ value: '', accept: '.csv,.tsv,.xlsx,.json', label: 'Choose data file', onPick: (path) => {
          rowSet(model, 'src', path);
          commitPanel(150);
          renderPanel();
        } }),
        h('button', { type: 'button', class: 'pill ghost small', html: `${icon('table', 14)}<span>Type data</span>`, onclick: () => {
          model.body = ['| x | y |', '|---|---|', '| 1 | 2 |', '| 2 | 4 |'];
          commitPanel(250);
          renderPanel();
        } }),
      ));
    }
    body.append(section('Data', ...dataBody));
    const holder = h('div', { class: 'stackcol' });
    body.append(section('Columns', holder));
    const paint = (header) => {
      const xcol = rowGet(model, 'x');
      const xField = header.length
        ? dropdown({
          choices: [{ value: '', label: 'First column' }, ...header.map((name) => ({ value: name, label: name }))],
          value: xcol,
          onPick: (value) => {
            rowSet(model, 'x', value);
            commitPanel(250);
            renderPanel();
          },
        })
        : plainInput(xcol, (value) => {
          rowSet(model, 'x', value);
          commitPanel(500);
        });
      holder.replaceChildren(line('X axis', h('div', { class: 'field' }, xField)), stackLine('Values', yPicker(model, header, xcol || header[0])));
    };
    if (src) {
      paint([]);
      headerOf(src).then((header) => {
        if (header.length) paint(header);
      });
    } else paint(bodyHeader(model));
  }
  const legend = rowGet(model, 'legend');
  const showValues = ['bar', 'hbar', 'hist'].includes(type);
  const show = [
    textLine('X title', model, 'xlabel'),
    textLine('Y title', model, 'ylabel'),
    yesNoLine('Grid lines', model, 'grid', { defaultOn: true }),
    stackLine('Legend', segmented([
      { value: '', label: 'Auto' },
      { value: 'show', label: 'Show' },
      { value: 'none', label: 'Hide' },
    ], legend, (value) => {
      rowSet(model, 'legend', value);
      commitPanel(150);
    })),
  ];
  if (showValues) show.push(yesNoLine('Value labels', model, 'labels'));
  if (type === 'pie' || type === 'donut') {
    show.push(stackLine('Labels', segmented([
      { value: '', label: 'Percent' },
      { value: 'value', label: 'Value' },
    ], rowGet(model, 'labels'), (value) => {
      rowSet(model, 'labels', value);
      commitPanel(150);
    })));
  }
  body.append(
    section('Labels', ...show),
    section('Shape', segmented([
      { value: '', label: 'Auto' },
      { value: '16:9', label: 'Wide' },
      { value: '4:3', label: 'Standard' },
      { value: '1:1', label: 'Square' },
    ], rowGet(model, 'ratio'), (value) => {
      rowSet(model, 'ratio', value);
      commitPanel(150);
    })),
    layoutSection(model, 'chart', range),
    captionSection(model),
  );
  moreSection(body, model, 'chart', ['type', 'src', 'x', 'y', 'xlabel', 'ylabel', 'grid', 'legend', 'labels', 'f', 'domain', 'ratio', 'width', 'align', 'wrap', 'caption', 'source']);
}

const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'star', 'cross'];
const LABEL_SIDES = [
  { value: '', label: 'Automatic' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'top', label: 'Above' },
  { value: 'bottom', label: 'Below' },
  { value: 'none', label: 'Hidden' },
];
const METHODS = [
  { value: '', label: 'Equal count' },
  { value: 'equal', label: 'Equal steps' },
  { value: 'jenks', label: 'Natural breaks' },
  { value: 'log', label: 'Logarithmic' },
];
const PALETTES = [
  { value: '', label: 'Document', art: ['#eef3f7', '#1f4e79'] },
  { value: 'blues', label: 'Blues', art: ['#eff3ff', '#08519c'] },
  { value: 'greens', label: 'Greens', art: ['#edf8e9', '#006d2c'] },
  { value: 'oranges', label: 'Oranges', art: ['#feedde', '#a63603'] },
  { value: 'reds', label: 'Reds', art: ['#fee5d9', '#a50f15'] },
  { value: 'purples', label: 'Purples', art: ['#f2f0f7', '#54278f'] },
  { value: 'greys', label: 'Greys', art: ['#f7f7f7', '#252525'] },
  { value: 'blue-green', label: 'Teal', art: ['#ffffcc', '#0c2c84'] },
  { value: 'heat', label: 'Heat', art: ['#ffffb2', '#bd0026'] },
  { value: 'red-blue', label: 'Red-blue', art: ['#b2182b', '#2166ac'] },
  { value: 'red-green', label: 'Red-green', art: ['#d73027', '#1a9850'] },
  { value: 'brown-teal', label: 'Brown-teal', art: ['#8c510a', '#01665e'] },
  { value: 'orange-purple', label: 'Orange-purple', art: ['#b35806', '#542788'] },
];
const LAYER_TYPES = {
  point: { name: 'Marker', icon: 'pin' },
  points: { name: 'Markers from a table', icon: 'table' },
  route: { name: 'Route', icon: 'route' },
  line: { name: 'Line', icon: 'minus' },
  area: { name: 'Study area', icon: 'area' },
  circle: { name: 'Radius circle', icon: 'circleIcon' },
  label: { name: 'Text label', icon: 'textIcon' },
  shade: { name: 'Colour by data', icon: 'shade' },
  highlight: { name: 'Highlight countries', icon: 'highlight' },
  flows: { name: 'Flow arrows', icon: 'flows' },
  geojson: { name: 'Shapes file', icon: 'shapes' },
};
const LAYER_KEYS = Object.keys(LAYER_TYPES);
const LAYER_TEMPLATES = {
  point: 'Cairo | Cairo',
  route: 'Cairo -> Alexandria | Route',
  line: '30.0, 31.0; 30.1, 31.2 | Line',
  area: '30.0, 31.0; 30.0, 31.3; 30.2, 31.2 | Study area',
  circle: 'Cairo | 50 km | Zone',
  label: '30.0, 31.0 | Label text',
  highlight: 'Egypt | color=#c0392b',
};
const FILE_LAYERS = { points: 'classes=5', shade: 'classes=5', flows: '', geojson: '' };

function splitFields(text) {
  const parts = [];
  let current = '';
  let quote = '';
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = '';
      current += c;
    } else if ((c === '"' || c === "'") && text[i - 1] === '=') {
      quote = c;
      current += c;
    } else if (c === '|') {
      parts.push(current);
      current = '';
    } else current += c;
  }
  parts.push(current);
  return parts.map((part) => part.trim());
}

const PAIR = /([A-Za-z][\w-]*)=("[^"]*"|'[^']*'|[^\s"']+)/g;

function parseLayer(kind, value) {
  const parts = splitFields(value);
  let target = parts[0];
  const fields = [];
  const style = [];
  const take = (part) => {
    for (const match of part.matchAll(PAIR)) style.push([match[1].toLowerCase().replace(/_/g, '-'), match[2].replace(/^["']|["']$/g, '')]);
    return part.replace(PAIR, '').trim();
  };
  if (['shade', 'points', 'flows'].includes(kind) && /[A-Za-z][\w-]*=/.test(target)) target = take(target);
  parts.slice(1).forEach((part) => {
    const rest = take(part);
    if (rest) fields.push(rest);
  });
  return { kind, target, fields, style };
}

function serializeLayer(layer) {
  const parts = [layer.target, ...layer.fields];
  if (layer.style.length) parts.push(layer.style.map(([key, value]) => (/\s/.test(value) || value === '' ? `${key}="${value}"` : `${key}=${value}`)).join(' '));
  return parts.filter((part, index) => index === 0 || part !== '').join(' | ');
}

const styleGet = (layer, key, fallback = '') => {
  const hit = layer.style.find((pair) => pair[0] === key);
  return hit ? hit[1] : fallback;
};

function styleSet(layer, key, value) {
  const index = layer.style.findIndex((pair) => pair[0] === key);
  if (value === '' || value === null || value === undefined) {
    if (index >= 0) layer.style.splice(index, 1);
  } else if (index >= 0) layer.style[index][1] = String(value);
  else layer.style.push([key, String(value)]);
}

function shapeIcons() {
  return SHAPES.map((shape) => ({ value: shape, icon: `shape${shape.charAt(0).toUpperCase()}${shape.slice(1)}`, title: shape.charAt(0).toUpperCase() + shape.slice(1) }));
}

function layerFields(layer, ctx) {
  const { save, again, model } = ctx;
  const style = (key, fallback) => styleGet(layer, key, fallback);
  const put = (key, value) => {
    styleSet(layer, key, value);
    save(500);
  };
  const colour = (label = 'Colour', key = 'color') => line(label, colourPicker(style(key), (value) => put(key, value)));
  const dashed = () => yesNoToggle('Dashed', Boolean(style('dash')), (on) => put('dash', on ? '6 3' : ''));
  const nameField = (index, label = 'Name') => line(label, plainInput(layer.fields[index] || '', (value) => {
    layer.fields[index] = value;
    while (layer.fields.length && layer.fields[layer.fields.length - 1] === '') layer.fields.pop();
    save(600);
  }));
  const targetField = (label, placeholder = '') => line(label, plainInput(layer.target, (value) => {
    layer.target = value;
    save(700);
  }, placeholder));
  const dataFile = (accept) => {
    if (layer.target.toLowerCase() === 'here') {
      return stackLine('Typed table', dataGrid(model.body.length ? model.body : ['| Name | Value |', '|---|---|', '| A | 1 |'], (lines) => {
        model.body = lines;
        save(700);
      }));
    }
    return stackLine('Data', fileChooser({
      value: layer.target,
      accept,
      onPick: (path) => {
        layer.target = path;
        save(150);
        again();
      },
    }));
  };
  const column = (label, key, none = 'Automatic', extra = []) => {
    const holder = h('div', { class: 'field' });
    const text = plainInput(style(key), (value) => put(key, value));
    holder.append(text);
    headerOf(layer.target).then((header) => {
      if (!header.length) return;
      const choices = [{ value: '', label: none }, ...extra, ...header.map((name) => ({ value: name, label: name }))];
      const current = style(key);
      if (current && !choices.some((item) => item.value === current)) choices.push({ value: current, label: current });
      holder.replaceChildren(dropdown({ choices, value: current, onPick: (value) => put(key, value) }));
    });
    return line(label, holder);
  };
  switch (layer.kind) {
    case 'point':
      return [
        targetField('Place', 'Cairo or 30.04, 31.23'),
        nameField(0),
        colour(),
        line('Size', slider({ min: 3, max: 14, value: Number(style('size', 5)), onInput: (value) => put('size', value) })),
        stackLine('Shape', segmented(shapeIcons(), style('shape', 'circle'), (value) => put('shape', value === 'circle' ? '' : value))),
        line('Label', dropdown({ choices: LABEL_SIDES, value: style('label'), onPick: (value) => put('label', value) })),
      ];
    case 'points':
      return [
        dataFile('.csv,.tsv,.xlsx,.json'),
        column('Name', 'label', 'Automatic', [{ value: 'none', label: 'No labels' }]),
        column('Size by', 'size', 'Same size'),
        line('Colour', colourPicker(/^#/.test(style('color')) ? style('color') : '', (value) => put('color', value))),
        column('Colour by', 'color', 'One colour'),
        stackLine('Shape', segmented(shapeIcons(), style('shape', 'circle'), (value) => put('shape', value === 'circle' ? '' : value))),
        line('Key title', plainInput(style('legend'), (value) => put('legend', value))),
      ];
    case 'route': {
      const stops = layer.target.split(/\s*(?:->|→|=>)\s*/).filter((item) => item !== '');
      const list = h('div', { class: 'stackcol' });
      const write = () => {
        layer.target = stops.join(' -> ');
        save(600);
      };
      stops.forEach((stop, index) => {
        list.append(h(
          'div',
          { class: 'inline-row' },
          plainInput(stop, (value) => {
            stops[index] = value;
            write();
          }, 'Place'),
          h('button', { type: 'button', class: 'mini', html: icon('close', 13), title: 'Remove stop', disabled: stops.length < 3, onclick: () => {
            stops.splice(index, 1);
            write();
            again();
          } }),
        ));
      });
      list.append(h('button', { type: 'button', class: 'pill ghost small', html: `${icon('plus', 14)}<span>Stop</span>`, onclick: () => {
        stops.push('');
        write();
        again();
      } }));
      return [
        stackLine('Stops', list),
        nameField(0),
        colour(),
        line('Width', slider({ min: 1, max: 6, step: 0.5, value: Number(style('width', 2)), decimals: 1, onInput: (value) => put('width', value) })),
        dashed(),
        yesNoToggle('Arrow', style('arrow') !== 'no', (on) => put('arrow', on ? '' : 'no')),
        yesNoToggle('Mark stops', style('stops') === 'yes', (on) => put('stops', on ? 'yes' : '')),
      ];
    }
    case 'line':
      return [
        targetField('Points', 'lat, lon; lat, lon'),
        nameField(0),
        colour(),
        line('Width', slider({ min: 1, max: 6, step: 0.5, value: Number(style('width', 2)), decimals: 1, onInput: (value) => put('width', value) })),
        dashed(),
      ];
    case 'area':
      return [
        targetField('Corners', 'lat, lon; lat, lon; ...'),
        nameField(0),
        colour(),
        line('Fill', slider({ min: 0.05, max: 0.8, step: 0.05, value: Number(style('opacity', 0.22)), decimals: 2, onInput: (value) => put('opacity', value) })),
      ];
    case 'circle': {
      const match = (layer.fields[0] || '').match(/^(\d+(?:\.\d+)?)\s*(km|mi|m)?$/i);
      const radius = { value: match ? Number(match[1]) : 50, unit: match && match[2] ? match[2].toLowerCase() : 'km' };
      const write = () => {
        layer.fields[0] = `${radius.value} ${radius.unit}`;
        save(500);
      };
      return [
        targetField('Place', 'Cairo'),
        line('Radius', h('div', { class: 'inline-row' }, stepper({ value: radius.value, min: 1, max: 5000, step: 5, onChange: (value) => {
          radius.value = value;
          write();
        } }), segmented([{ value: 'km', label: 'km' }, { value: 'mi', label: 'mi' }], radius.unit, (value) => {
          radius.unit = value;
          write();
        }))),
        nameField(1),
        colour(),
      ];
    }
    case 'label':
      return [
        targetField('Position', 'lat, lon or a place'),
        nameField(0, 'Text'),
        colour('Colour'),
        line('Size', slider({ min: 8, max: 22, value: Number(style('size', 11)), onInput: (value) => put('size', value) })),
        yesNoToggle('Italic', style('italic') !== 'no', (on) => put('italic', on ? '' : 'no')),
        line('Angle', slider({ min: -90, max: 90, step: 5, value: Number(style('angle', 0)), unit: '°', onInput: (value) => put('angle', value || '') })),
      ];
    case 'shade': {
      const palette = style('palette');
      return [
        dataFile('.csv,.tsv,.xlsx,.json'),
        column('Value', 'value'),
        column('Names', 'join'),
        line('Classes', stepper({ value: Number(style('classes', 5)), min: 2, max: 9, onChange: (value) => put('classes', value) })),
        line('Method', dropdown({ choices: METHODS, value: style('method'), onPick: (value) => put('method', value) })),
        stackLine('Colours', cards(PALETTES.map((item) => ({
          value: item.value,
          label: item.label,
          art: `<i class="ramp" style="background:linear-gradient(90deg,${item.art[0]},${item.art[1]})"></i>`,
        })), palette, (value) => put('palette', value), 3)),
        yesNoToggle('Reverse colours', style('reverse') === 'yes', (on) => put('reverse', on ? 'yes' : '')),
        line('Key title', plainInput(style('legend'), (value) => put('legend', value))),
      ];
    }
    case 'highlight':
      return [
        stackLine('Countries', tagPicker(layer.target, [...PLACES.regions.map((r) => r.charAt(0).toUpperCase() + r.slice(1)), ...PLACES.countries], (value) => {
          layer.target = value;
          save(250);
          again();
        })),
        colour(),
        line('Key text', plainInput(style('legend') || layer.fields[0] || '', (value) => {
          layer.fields = [];
          put('legend', value);
        })),
      ];
    case 'flows':
      return [
        dataFile('.csv,.tsv,.xlsx,.json'),
        column('From', 'from'),
        column('To', 'to'),
        column('Value', 'value'),
        colour(),
        line('Key title', plainInput(style('legend'), (value) => put('legend', value))),
      ];
    case 'geojson':
      return [
        dataFile('.geojson,.json'),
        line('Names from', plainInput(style('label'), (value) => put('label', value), 'property')),
        line('Shade by', plainInput(style('value'), (value) => put('value', value), 'property')),
        colour(),
      ];
    default:
      return [];
  }
}

function yesNoToggle(label, on, onChange) {
  return line(label, switchField(on, onChange));
}

function layerSummary(layer) {
  const target = layer.target.toLowerCase() === 'here' ? 'Typed table' : layer.target.split(/[\\/]/).pop();
  return layer.fields[0] ? `${layer.fields[0]}` : target;
}

function layerCard(model, row, index) {
  const layer = parseLayer(row.key, row.value);
  const type = LAYER_TYPES[row.key];
  const card = h('div', { class: 'layer' });
  const open = openLayers.has(row);
  const save = (delay) => {
    row.value = serializeLayer(layer);
    commitPanel(delay);
  };
  const again = () => renderPanel();
  const head = h(
    'div',
    { class: `layer-head${open ? ' open' : ''}` },
    h('button', {
      type: 'button',
      class: 'layer-title',
      html: `<span class="layer-icon">${icon(type.icon, 16)}</span><span class="layer-name">${type.name}</span><span class="layer-sub">${layerSummary(layer).replace(/</g, '&lt;')}</span>${icon('chevron', 15)}`,
      onclick: () => {
        if (openLayers.has(row)) openLayers.delete(row);
        else openLayers.add(row);
        again();
      },
    }),
    h('button', { type: 'button', class: 'mini', html: icon('trash', 14), title: 'Remove layer', onclick: () => {
      model.rows.splice(model.rows.indexOf(row), 1);
      commitPanel(250);
      again();
    } }),
  );
  card.append(head);
  if (open) card.append(h('div', { class: 'layer-body' }, ...layerFields(layer, { save, again, model })));
  return card;
}

async function addLayer(model, kind) {
  let value = LAYER_TEMPLATES[kind];
  if (value === undefined) {
    const accept = kind === 'geojson' ? '.geojson,.json' : '.csv,.tsv,.xlsx,.json';
    const file = await pickFile(accept);
    if (!file) return;
    const path = await upload(file);
    if (!path) return;
    value = FILE_LAYERS[kind] ? `${path} | ${FILE_LAYERS[kind]}` : path;
  }
  const row = { key: kind, value };
  model.rows.push(row);
  openLayers.add(row);
  commitPanel(250);
  renderPanel();
}

function mapPanel(model, body, range) {
  loadPlaces();
  const focus = rowGet(model, 'focus');
  const choices = [...PLACES.regions.map((r) => r.charAt(0).toUpperCase() + r.slice(1)), ...PLACES.countries];
  body.append(
    section(
      'Where',
      tagPicker(focus, choices, (value) => {
        rowSet(model, 'focus', value);
        commitPanel(250);
        renderPanel();
      }),
      line('Zoom to', plainInput(rowGet(model, 'center'), (value) => {
        rowSet(model, 'center', value);
        commitPanel(700);
      }, 'a place')),
      line('Area width', plainInput(rowGet(model, 'span'), (value) => {
        rowSet(model, 'span', value);
        commitPanel(700);
      }, '3 km')),
    ),
  );
  const bases = [
    { value: 'world', label: 'Countries', art: BASE_ART.world },
    { value: 'none', label: 'Blank', art: BASE_ART.none },
    { value: 'osm', label: 'Street', art: BASE_ART.osm },
    { value: 'topo', label: 'Terrain', art: BASE_ART.topo },
    { value: 'light', label: 'Light', art: BASE_ART.light },
  ];
  body.append(section('Base map', cards(bases, rowGet(model, 'basemap') || 'world', (value) => {
    rowSet(model, 'basemap', value === 'world' ? '' : value);
    commitPanel(150);
  }, 3)));
  const level = rowGet(model, 'level');
  body.append(
    section(
      'Detail',
      segmented([
        { value: '', label: 'Countries' },
        { value: '1', label: 'Provinces', disabled: !focus, title: focus ? 'Provinces, states or governorates' : 'Pick a country first' },
        { value: '2', label: 'Districts', disabled: !focus, title: focus ? 'Smaller districts' : 'Pick a country first' },
      ], ['states'].includes(level) ? '1' : ['counties'].includes(level) ? '2' : level, (value) => {
        rowSet(model, 'level', value);
        commitPanel(150);
      }),
      line('Projection', dropdown({
        choices: PROJECTION_CHOICES,
        value: rowGet(model, 'projection'),
        onPick: (value) => {
          rowSet(model, 'projection', value);
          commitPanel(150);
        },
      })),
    ),
  );
  const cities = rowGet(model, 'cities');
  const names = rowGet(model, 'names');
  const showRows = [
    line('City names', switchField(cities !== '' && cities !== '0', (on) => {
      rowSet(model, 'cities', on ? '8' : '');
      commitPanel(150);
      renderPanel();
    })),
  ];
  if (cities !== '' && cities !== '0') {
    showRows.push(line('How many', stepper({ value: Number(cities), min: 1, max: 30, onChange: (value) => {
      rowSet(model, 'cities', String(value));
      commitPanel(300);
    } })));
  }
  showRows.push(
    yesNoLine('Capitals', model, 'capitals'),
    line('Country names', switchField(names !== 'none', (on) => {
      rowSet(model, 'names', on ? '' : 'none');
      commitPanel(150);
    })),
    yesNoLine('Scale bar', model, 'scale', { defaultOn: true }),
    yesNoLine('North arrow', model, 'north', { defaultOn: true }),
    yesNoLine('Locator map', model, 'inset'),
    yesNoLine('Grid lines', model, 'graticule'),
    yesNoLine('Numbered markers', model, 'numbered'),
    yesNoLine('Key', model, 'legend', { defaultOn: true }),
  );
  body.append(section('Show', ...showRows));
  const layerRows = model.rows.filter((row) => LAYER_KEYS.includes(row.key));
  const layers = h('div', { class: 'layers' });
  layerRows.forEach((row, index) => layers.append(layerCard(model, row, index)));
  layers.append(dropdown({
    choices: LAYER_KEYS.map((key) => ({ value: key, label: LAYER_TYPES[key].name })),
    value: '',
    label: 'Add layer',
    keep: true,
    className: 'add',
    leading: icon('plus', 15),
    onPick: (key) => addLayer(model, key),
  }));
  body.append(section('Layers', layers));
  body.append(
    section('Shape', segmented([
      { value: '', label: 'Auto' },
      { value: '16:9', label: 'Wide' },
      { value: '4:3', label: 'Standard' },
      { value: '1:1', label: 'Square' },
    ], rowGet(model, 'ratio'), (value) => {
      rowSet(model, 'ratio', value);
      commitPanel(150);
    })),
    layoutSection(model, 'map', range),
    captionSection(model),
  );
  const shown = ['focus', 'center', 'span', 'basemap', 'level', 'projection', 'cities', 'capitals', 'names', 'scale', 'north', 'inset', 'graticule', 'numbered', 'legend', 'ratio', 'width', 'align', 'wrap', 'caption', 'source', ...LAYER_KEYS];
  moreSection(body, model, 'map', shown);
}

const PROJECTION_CHOICES = [
  { value: '', label: 'Automatic' },
  { value: 'natural-earth', label: 'World, balanced' },
  { value: 'equal-earth', label: 'World, equal area' },
  { value: 'mercator', label: 'Web map (Mercator)' },
  { value: 'orthographic', label: 'Globe' },
  { value: 'robinson', label: 'Robinson' },
  { value: 'winkel-tripel', label: 'Winkel tripel' },
  { value: 'mollweide', label: 'Mollweide' },
  { value: 'conic', label: 'Conic, equal area' },
  { value: 'conic-conformal', label: 'Conic, true shape' },
  { value: 'albers', label: 'Albers' },
  { value: 'albers-usa', label: 'United States' },
  { value: 'azimuthal', label: 'Polar view' },
  { value: 'stereographic', label: 'Stereographic' },
  { value: 'equirectangular', label: 'Plain grid' },
  { value: 'transverse-mercator', label: 'Transverse Mercator' },
];

const DIAGRAM_HINTS = {
  flow: 'Start -> Step -> End',
  tree: 'Root\n  Branch\n    Leaf',
  mindmap: 'Centre\n  Idea\n  Idea',
  timeline: '2000: Event\n2010: Event',
  diagram: 'graph TD\n  A --> B',
};

function diagramPanel(model, body, range) {
  const kind = range.kind;
  const hint = DIAGRAM_HINTS[kind] || 'Mermaid notation';
  body.append(section('Content', bodyArea(model, { label: '', placeholder: hint, mono: true, rows: 9 })));
  if (['flow', 'tree'].includes(kind)) {
    body.append(section('Direction', segmented([
      { value: '', label: 'Top to bottom' },
      { value: 'LR', label: 'Left to right' },
    ], rowGet(model, 'direction').toUpperCase() === 'LR' ? 'LR' : '', (value) => {
      rowSet(model, 'direction', value);
      commitPanel(150);
    })));
  }
  body.append(layoutSection(model, 'diagram', range), captionSection(model));
  moreSection(body, model, kind, ['caption', 'source', 'width', 'align', 'wrap', 'direction']);
}

function gridPanel(model, body, range) {
  const kind = range.kind;
  const names = { grid: 'Boxes', swot: 'Boxes', figures: 'Images' };
  const hints = { grid: 'Title:\n- point', swot: 'Strengths:\n- point\nWeaknesses:\n- point', figures: 'images/one.png | First\nimages/two.png | Second' };
  body.append(
    section('Content', bodyArea(model, { label: names[kind], placeholder: hints[kind], mono: true, rows: 8 })),
    section('Columns', stepper({ value: Number(rowGet(model, 'cols', kind === 'figures' ? 2 : 2)), min: 1, max: 4, onChange: (value) => {
      rowSet(model, 'cols', String(value));
      commitPanel(250);
    } })),
    layoutSection(model, 'diagram', range),
    captionSection(model),
  );
  moreSection(body, model, kind, ['cols', 'caption', 'source', 'width', 'align', 'wrap']);
}

function moleculePanel(model, body, range) {
  const area = h('textarea', { spellcheck: 'false', rows: 3, class: 'mono', placeholder: 'CC(=O)Oc1ccccc1C(=O)O' });
  area.value = rowGet(model, 'smiles');
  area.addEventListener('input', () => {
    rowSet(model, 'smiles', area.value.replace(/\s+/g, ''));
    commitPanel(700);
  });
  const colour = rowGet(model, 'color', 'yes');
  const stereo = rowGet(model, 'stereo', 'no');
  body.append(
    section(
      'Structure',
      stackLine('', area),
      line('Colours', switchField(!/^(no|off|false)$/i.test(colour), (on) => {
        rowSet(model, 'color', on ? '' : 'no');
        commitPanel(150);
      })),
      line('R / S labels', switchField(/^(yes|on|true)$/i.test(stereo), (on) => {
        rowSet(model, 'stereo', on ? 'yes' : '');
        commitPanel(150);
      })),
    ),
    layoutSection(model, 'figure', range),
    captionSection(model),
  );
  moreSection(body, model, 'molecule', ['smiles', 'color', 'stereo', 'caption', 'source', 'width', 'align', 'wrap']);
}

function musicPanel(model, body, range) {
  const src = rowGet(model, 'src');
  if (src) {
    body.append(section('Score', fileChooser({
      value: src,
      accept: '.abc,.txt',
      onPick: (path) => {
        rowSet(model, 'src', path);
        commitPanel(150);
        renderPanel();
      },
    })));
  } else body.append(section('Score', bodyArea(model, { label: '', placeholder: 'X:1\nK:C\nCDEF|GABc|', mono: true, rows: 8 })));
  body.append(layoutSection(model, 'diagram', range), captionSection(model));
  moreSection(body, model, 'music', ['src', 'caption', 'source', 'width', 'align', 'wrap']);
}

function mathPanel(model, body, range) {
  const numbered = rowGet(model, 'n') === 'yes' || rowGet(model, 'numbered') === 'yes';
  body.append(
    section('Equation', bodyArea(model, { label: '', placeholder: 'E = mc^2', mono: true, rows: 5 })),
    section(
      null,
      line('Numbered', switchField(numbered, (on) => {
        rowSet(model, 'n', on ? 'yes' : '');
        rowSet(model, 'numbered', '');
        commitPanel(150);
      })),
      textLine('Label', model, 'id', { placeholder: 'einstein' }),
    ),
  );
  moreSection(body, model, 'math', ['n', 'numbered', 'id']);
}

const LANGUAGES = ['python', 'javascript', 'java', 'c', 'cpp', 'csharp', 'html', 'css', 'sql', 'bash', 'json', 'r', 'matlab', 'text'];

function codePanel(model, body, range) {
  const language = (model.args || '').split(/\s+/)[0] || '';
  const choices = [{ value: '', label: 'Auto' }, ...LANGUAGES.map((name) => ({ value: name, label: name }))];
  if (language && !LANGUAGES.includes(language)) choices.push({ value: language, label: language });
  const src = rowGet(model, 'src');
  const parts = [line('Language', dropdown({
    choices,
    value: language,
    onPick: (value) => {
      model.args = value;
      commitPanel(150);
    },
  }))];
  if (range.kind === 'code') parts.push(yesNoLine('Line numbers', model, 'numbers', { defaultOn: true }));
  parts.push(textLine('Highlight lines', model, 'highlight', { placeholder: '3, 7-9' }), textLine('Caption', model, 'caption'));
  body.append(section('Code', ...parts));
  if (src) {
    body.append(section('File', fileChooser({
      value: src,
      accept: '.py,.js,.java,.c,.cpp,.html,.css,.sql,.sh,.json,.txt',
      onPick: (path) => {
        rowSet(model, 'src', path);
        commitPanel(150);
        renderPanel();
      },
    })));
  } else body.append(section(null, bodyArea(model, { label: '', placeholder: 'print("hello")', mono: true, rows: 10 })));
  moreSection(body, model, range.kind, ['numbers', 'highlight', 'caption', 'src']);
}

const TITLED = new Set(['definition', 'theorem', 'lemma', 'proposition', 'corollary', 'example', 'remark']);

function calloutPanel(model, body, range) {
  if (TITLED.has(range.kind)) {
    const arg = h('input', { type: 'text', spellcheck: 'false', placeholder: 'Term or name' });
    arg.value = model.args || '';
    arg.addEventListener('input', () => {
      model.args = arg.value;
      commitPanel(600);
    });
    body.append(section(null, line('Title', h('div', { class: 'field' }, arg))));
  }
  body.append(section('Text', bodyArea(model, { label: '', placeholder: 'Write it here', rows: 7 })));
}

const PANELS = {
  figure: imagePanel,
  image: imagePanel,
  table: tablePanel,
  pipetable: tablePanel,
  chart: chartPanel,
  map: mapPanel,
  flow: diagramPanel,
  tree: diagramPanel,
  mindmap: diagramPanel,
  timeline: diagramPanel,
  diagram: diagramPanel,
  grid: gridPanel,
  swot: gridPanel,
  figures: gridPanel,
  molecule: moleculePanel,
  music: musicPanel,
  math: mathPanel,
  code: codePanel,
  fence: codePanel,
};
MERMAID_KINDS.forEach((name) => {
  PANELS[name] = diagramPanel;
});
['box', 'note', 'proof', 'question', ...TITLED].forEach((name) => {
  PANELS[name] = calloutPanel;
});

function curatedPanel(kind, model, body, range) {
  const make = PANELS[kind];
  if (!make) return false;
  $('#panel').classList.add('wide');
  make(model, body, range);
  return true;
}
