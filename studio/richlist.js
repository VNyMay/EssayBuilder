const LIST_LINE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const LIST_START = /^(\d+[.)]|[-*])[\s ]/;

function listItems(lines) {
  const items = [];
  const widths = [];
  lines.forEach((raw) => {
    const line = raw.replace(/\t/g, '    ');
    const match = line.match(LIST_LINE);
    if (match) {
      const indent = match[1].length;
      while (widths.length && indent < widths[widths.length - 1]) widths.pop();
      if (!widths.length || indent > widths[widths.length - 1]) widths.push(indent);
      items.push({ depth: widths.length - 1, ordered: /\d/.test(match[2]), text: match[3] });
    } else if (line.trim() && items.length) {
      items[items.length - 1].text += ` ${line.trim()}`;
    }
  });
  return items;
}

function listDom(items) {
  const root = document.createDocumentFragment();
  const stack = [];
  items.forEach((item) => {
    const tag = item.ordered ? 'OL' : 'UL';
    while (stack.length && stack[stack.length - 1].depth > item.depth) stack.pop();
    let top = stack[stack.length - 1];
    if (top && top.depth === item.depth && top.list.tagName !== tag) {
      stack.pop();
      top = stack[stack.length - 1];
      const list = document.createElement(tag);
      (top ? top.last : root).append(list);
      stack.push({ list, depth: item.depth, last: null });
    } else if (!top || top.depth < item.depth) {
      const list = document.createElement(tag);
      (top && top.last ? top.last : root).append(list);
      stack.push({ list, depth: item.depth, last: null });
    }
    const current = stack[stack.length - 1];
    const li = document.createElement('li');
    li.append(inlineNodes(item.text));
    if (!item.text) li.append(document.createElement('br'));
    current.list.append(li);
    current.last = li;
  });
  return root;
}

function itemText(li) {
  const holder = document.createElement('span');
  li.childNodes.forEach((node) => {
    if (!(node.nodeType === 1 && /^(UL|OL)$/.test(node.tagName))) holder.append(node.cloneNode(true));
  });
  return nodesToMd(holder).replace(/\\\\\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function listLines(list, depth, out) {
  let number = 0;
  [...list.childNodes].forEach((child) => {
    if (child.nodeType !== 1) {
      if (child.textContent.trim()) out.push(`${'    '.repeat(depth)}- ${escapeText(child.textContent.trim())}`);
      return;
    }
    if (/^(UL|OL)$/.test(child.tagName)) {
      listLines(child, depth + 1, out);
      return;
    }
    number += 1;
    const marker = list.tagName === 'OL' ? `${number}.` : '-';
    out.push(`${'    '.repeat(depth)}${marker} ${child.tagName === 'LI' ? itemText(child) : nodesToMd(child).trim()}`);
    [...child.children].filter((node) => /^(UL|OL)$/.test(node.tagName)).forEach((sub) => listLines(sub, depth + 1, out));
  });
}

function listMd(el) {
  if (!el.querySelector('ul, ol')) {
    S.edit.list = false;
    return bodyMd(el);
  }
  const out = [];
  [...el.childNodes].forEach((node) => {
    if (node.nodeType === 1 && /^(UL|OL)$/.test(node.tagName)) listLines(node, 0, out);
    else if (node.textContent.trim()) {
      const holder = document.createElement('span');
      holder.append(node.cloneNode(true));
      out.push(`- ${nodesToMd(holder).replace(/\\\\\n/g, ' ').trim()}`);
    }
  });
  return out.join('\n');
}

function caretItem(el) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return null;
  const node = selection.anchorNode;
  const start = node && (node.nodeType === 1 ? node : node.parentNode);
  const li = start && start.closest ? start.closest('li') : null;
  return li && el.contains(li) ? li : null;
}

function stripStart(container, count) {
  let left = count;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  while (left > 0 && walker.nextNode()) {
    const node = walker.currentNode;
    const take = Math.min(left, node.nodeValue.length);
    node.nodeValue = node.nodeValue.slice(take);
    left -= take;
  }
  const range = document.createRange();
  range.selectNodeContents(container);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function listAutoformat(el) {
  if (!S.edit || !S.edit.rich || S.edit.cover) return false;
  if (!S.edit.list) {
    if (S.edit.range.kind !== 'para') return false;
    const text = el.textContent;
    const match = text.match(LIST_START);
    if (!match || /\n/.test(text) || el.querySelector('br + *, br ~ br')) return false;
    stripStart(el, match[0].length);
    document.execCommand(/\d/.test(match[1]) ? 'insertOrderedList' : 'insertUnorderedList');
    S.edit.list = Boolean(el.querySelector('ul, ol'));
    return S.edit.list;
  }
  const li = caretItem(el);
  if (!li) return false;
  const match = li.textContent.match(LIST_START);
  if (!match) return false;
  const ordered = /\d/.test(match[1]);
  if ((li.parentNode.tagName === 'OL') === ordered) return false;
  stripStart(li, match[0].length);
  document.execCommand(ordered ? 'insertOrderedList' : 'insertUnorderedList');
  return true;
}

function listKeys(event) {
  const el = S.edit.ta;
  if (event.key === 'Tab') {
    event.preventDefault();
    const li = caretItem(el);
    if (!li) return true;
    if (event.shiftKey) {
      if (li.parentNode.parentNode !== el) document.execCommand('outdent');
    } else if (li.previousElementSibling) {
      document.execCommand('indent');
    }
    commitRich();
    return true;
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    const li = caretItem(el);
    if (!li || li.textContent.trim()) return true;
    event.preventDefault();
    if (li.parentNode.parentNode !== el) {
      document.execCommand('outdent');
      commitRich();
      return true;
    }
    const range = S.edit.range;
    const list = li.parentNode;
    li.remove();
    if (!list.children.length) list.remove();
    commitRich();
    S.target = { range, where: 'after' };
    insertLines(['New paragraph.'], 'para');
    return true;
  }
  return false;
}

function toggleList(ordered) {
  if (!S.edit || !S.edit.rich || !['para', 'list'].includes(S.edit.range.kind)) return;
  restoreSelection();
  document.execCommand(ordered ? 'insertOrderedList' : 'insertUnorderedList');
  S.edit.list = Boolean(S.edit.ta.querySelector('ul, ol'));
  commitRich();
}
