import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import traceback
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = Path(__file__).resolve().parents[1] / "sample" / "Demo Essay"
ESSAY_NAME = "Industrial Revolution Essay.txt"
VERSION = (ROOT / "studio" / "version.txt").read_text(encoding="utf-8").strip()
sys.path.insert(0, str(ROOT / "engine"))

from lib.cdp import Session

KEYS = {
    "ArrowLeft": 37,
    "ArrowUp": 38,
    "ArrowRight": 39,
    "ArrowDown": 40,
    "Home": 36,
    "End": 35,
    "Enter": 13,
    "Backspace": 8,
    "Tab": 9,
    "Escape": 27,
}

OUTSIDE_PAGES = """(() => {
  const sheets = [...document.querySelectorAll('.pg-sheet')].map((s) => s.getBoundingClientRect());
  const bad = [];
  const walker = document.createTreeWalker(document.querySelector('.flow-doc'), NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (!node.textContent.trim() || node.parentElement.closest('[contenteditable=false]')) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) {
      if (!rect.width) continue;
      const mid = (rect.top + rect.bottom) / 2;
      if (!sheets.some((s) => mid > s.top + 2 && mid < s.bottom - 2)) {
        bad.push(node.textContent.trim().slice(0, 40));
        break;
      }
    }
  }
  return bad;
})()"""

PAGE_STARTS = """(() => {
  const base = FLOW.sheet.getBoundingClientRect().top;
  const zoom = flowZoom();
  const out = [];
  const seen = new Set();
  let k = 0;
  FLOW.editor.state.doc.forEach((node, offset) => {
    if (!flowNodeLines(node).length) return;
    const rects = FLOW.lastRects[k] || [];
    k += 1;
    const dom = FLOW.editor.view.nodeDOM(offset);
    if (!dom || !rects.length || seen.has(rects[0].page)) return;
    seen.add(rects[0].page);
    const top = (dom.getBoundingClientRect().top - base) / zoom - flowPageTop(rects[0].page);
    out.push([rects[0].page, Math.round((top - rects[0].y0 * FLOW_L) * 10) / 10]);
  });
  return out;
})()"""


class Browser(Session):
    def js(self, code, tries=3):
        for attempt in range(tries):
            try:
                reply = self.send("Runtime.evaluate", {"expression": code, "awaitPromise": True, "returnByValue": True})
            except RuntimeError as error:
                if attempt + 1 < tries and "context" in str(error).lower():
                    time.sleep(0.5)
                    continue
                raise
            if "exceptionDetails" in reply:
                raise RuntimeError(json.dumps(reply["exceptionDetails"])[:600])
            return reply.get("result", {}).get("value")

    def go(self, url):
        self.events.clear()
        self.send("Page.navigate", {"url": url})
        self.wait("Page.loadEventFired")

    def key(self, key, mods=0):
        code = KEYS.get(key) or (ord(key.upper()) if len(key) == 1 else 0)
        base = {"key": key, "code": key, "modifiers": mods, "windowsVirtualKeyCode": code, "nativeVirtualKeyCode": code}
        self.send("Input.dispatchKeyEvent", dict(base, type="keyDown"))
        self.send("Input.dispatchKeyEvent", dict(base, type="keyUp"))

    def type(self, text):
        for char in text:
            self.send("Input.insertText", {"text": char})

    def click(self, x, y):
        for kind in ("mousePressed", "mouseReleased"):
            self.send("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, "button": "left", "clickCount": 1})


class App:
    def __init__(self):
        self.temp = Path(tempfile.mkdtemp(prefix="essay-builder-tests-"))
        self.essays = self.temp / "essays"
        self.data = self.temp / "data"
        self.data.mkdir(parents=True)
        self.folder = self.essays / FIXTURE.name
        self.essay = self.folder / ESSAY_NAME
        self.reset_essay()
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            self.port = probe.getsockname()[1]
        self.url = f"http://127.0.0.1:{self.port}/"
        env = dict(os.environ, ESSAY_BUILDER_DATA=str(self.data), ESSAY_BUILDER_ESSAYS=str(self.essays))
        self.server = subprocess.Popen(
            [sys.executable, str(ROOT / "studio" / "serve.py"), str(self.essay), "--port", str(self.port), "--no-window", "--keep-running"],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        for _ in range(120):
            try:
                urllib.request.urlopen(self.url, timeout=1)
                break
            except OSError:
                time.sleep(0.25)
        self.browser = Browser()
        self.browser.start()
        self.browser.send("Emulation.setDeviceMetricsOverride", {"width": 1280, "height": 760, "deviceScaleFactor": 1, "mobile": False})

    def reset_essay(self):
        for attempt in range(40):
            try:
                if self.folder.exists():
                    shutil.rmtree(self.folder)
                break
            except PermissionError as error:
                if os.environ.get("E2E_DEBUG"):
                    print("     locked:", attempt, error.filename)
                time.sleep(0.25)
        shutil.copytree(FIXTURE, self.folder, dirs_exist_ok=True)

    def js(self, code):
        return self.browser.js(code)

    def wait(self, code, timeout=30, what=None):
        end = time.time() + timeout
        while time.time() < end:
            try:
                if self.js(code):
                    return
            except RuntimeError:
                pass
            time.sleep(0.2)
        raise AssertionError(f"timed out waiting for {what or code}")

    def settled(self, timeout=30):
        self.wait("typeof FLOW !== 'undefined' && FLOW.on && FLOW.editor && S.pages.length && !S.dirty && S.lastSent === S.source && !!FLOW.lastRects", timeout, "the pages to settle")
        time.sleep(0.6)

    def fresh(self, view="write", keep_where=False):
        self.reset_essay()
        self.browser.go(self.url)
        where = "" if keep_where else "localStorage.removeItem('studio.where');"
        self.js(f"localStorage.setItem('studio.seen-version', '{VERSION}'); localStorage.setItem('studio.toured', '1'); localStorage.setItem('studio.themed', '1'); localStorage.setItem('studio.view', '{view}'); {where}")
        self.browser.go(self.url)
        self.js(f"openPath({json.dumps(str(self.essay))})")
        time.sleep(1)
        self.settled(60)
        self.js("window.__errors = []; window.addEventListener('error', (e) => __errors.push(String(e.message)))")

    def errors(self):
        return self.js("JSON.stringify(window.__errors || [])")

    def caret_to_paragraph(self, start):
        return self.js(
            f"""(() => {{ const ed = FLOW.editor; let at = null;
            ed.state.doc.descendants((n, p) => {{ if (at === null && n.type.name === 'paragraph' && n.textContent.startsWith({json.dumps(start)})) at = p + n.nodeSize - 1; }});
            if (at === null) return null;
            ed.commands.setTextSelection(at); ed.commands.focus();
            const s = document.querySelector('#scroll'); s.scrollTop += ed.view.coordsAtPos(at).top - s.getBoundingClientRect().top - 300;
            return at; }})()"""
        )

    def close(self):
        try:
            self.browser.stop()
        finally:
            self.server.terminate()
            try:
                self.server.wait(10)
            except subprocess.TimeoutExpired:
                self.server.kill()
            shutil.rmtree(self.temp, ignore_errors=True)


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def test_opens_in_write_view(app):
    app.fresh()
    check(app.js("FLOW.on"), "the essay should open in Write view")
    check(app.js("!document.querySelector('#pages').offsetParent"), "print preview should be hidden")
    check(app.errors() == "[]", f"page errors: {app.errors()}")


def test_pages_line_up_with_pdf(app):
    app.fresh()
    starts = app.js(PAGE_STARTS)
    check(len(starts) >= 3, f"expected several pages, got {starts}")
    off = [item for item in starts if abs(item[1]) > 2]
    check(not off, f"pages start in the wrong place (page, px off): {off}")
    outside = app.js(OUTSIDE_PAGES)
    check(not outside, f"text outside the pages: {outside}")


def test_typing_keeps_text_on_pages(app):
    app.fresh()
    check(app.caret_to_paragraph("Early mechanised"), "the test paragraph should exist")
    for _ in range(5):
        app.js("FLOW.editor.commands.insertContent(' Steam also changed how people experienced time, because factories ran on the clock.')")
        time.sleep(0.3)
    outside = app.js(OUTSIDE_PAGES)
    check(not outside, f"text outside the pages while typing: {outside}")
    app.settled()
    check("factories ran on the clock" in app.js("S.source"), "typed text should be saved to the essay")
    check(not app.js(OUTSIDE_PAGES), f"text outside the pages after settling: {app.js(OUTSIDE_PAGES)}")
    check(not [item for item in app.js(PAGE_STARTS) if abs(item[1]) > 2], f"pages out of line after typing: {app.js(PAGE_STARTS)}")


def test_reopens_where_you_left_off(app):
    app.fresh()
    pos = app.caret_to_paragraph("Newcomen")
    time.sleep(1)
    before = app.js("Math.round(FLOW.editor.view.coordsAtPos(FLOW.editor.state.selection.from).top - document.querySelector('#scroll').getBoundingClientRect().top)")
    app.browser.go(app.url)
    app.js(f"openPath({json.dumps(str(app.essay))})")
    time.sleep(1)
    app.settled()
    time.sleep(3)
    after = app.js("[FLOW.editor.state.selection.from, Math.round(FLOW.editor.view.coordsAtPos(FLOW.editor.state.selection.from).top - document.querySelector('#scroll').getBoundingClientRect().top)]")
    check(after[0] == pos, f"caret should come back to {pos}, got {after[0]}")
    check(abs(after[1] - before) <= 6, f"caret should be at the same height ({before}px), got {after[1]}px")


def test_add_menu_works_with_keyboard(app):
    app.fresh()
    app.browser.key("Tab")
    app.js("document.querySelector('#fbar .fpick.addmenu').focus()")
    app.browser.key("Enter")
    time.sleep(0.4)
    check(app.js("!!FLOW.pop"), "Enter on Add should open the menu")
    for _ in range(3):
        app.browser.key("ArrowDown")
    picked = app.js("[...FLOW.pop.querySelectorAll('.frow')][FLOW.pop.kbIndex].textContent.trim()")
    check(picked == "Footnote", f"arrow keys should reach Footnote, got {picked!r}")
    app.browser.key("Escape")
    time.sleep(0.3)
    check(app.js("!FLOW.pop"), "Escape should close the menu")


def test_design_menu_and_escape(app):
    app.fresh()
    app.js("document.querySelector('#designBtn').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))")
    time.sleep(0.4)
    items = app.js("[...FLOW.pop.querySelectorAll('.frow-main')].map((x) => x.textContent)")
    check(items == ["Cover page", "Fonts, margins and page", "App colours"], f"Design menu items: {items}")
    app.js("[...FLOW.pop.querySelectorAll('.frow')][1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))")
    time.sleep(1.2)
    check(app.js("!!S.settingsOpen && !document.querySelector('#panel').hidden"), "Fonts, margins and page should open Settings")
    app.js("FLOW.editor.commands.focus()")
    app.browser.key("Escape")
    time.sleep(0.6)
    check(app.js("document.querySelector('#panel').hidden"), "Escape should close Settings")


def test_slash_footnote_and_citation(app):
    app.fresh()
    app.caret_to_paragraph("Newcomen")
    before = app.js("(() => { let c = 0; FLOW.editor.state.doc.descendants((n) => { if (n.type.name === 'chip' && n.attrs.kind === 'note') c++; }); return c; })()")
    app.browser.type(" /foot")
    time.sleep(0.4)
    check(app.js("FLOW.slash && FLOW.slash.list[0].label") == "Footnote", "typing /foot should offer Footnote first")
    app.browser.key("Enter")
    time.sleep(0.5)
    check(app.js("!!document.querySelector('.finput')"), "choosing Footnote should open the footnote box")
    app.js("document.querySelector('.finput .fpop-input').value = 'From the 1851 census.'")
    app.js("document.querySelector('.finput .fpop-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))")
    time.sleep(0.5)
    after = app.js("(() => { let c = 0; FLOW.editor.state.doc.descendants((n) => { if (n.type.name === 'chip' && n.attrs.kind === 'note') c++; }); return c; })()")
    check(after == before + 1, f"a footnote should be added ({before} -> {after})")
    check("/foot" not in app.js("FLOW.editor.state.doc.textContent"), "the /foot text should be removed")
    app.browser.type(" /cite")
    time.sleep(0.4)
    check(app.js("FLOW.slash && FLOW.slash.list[0].label") == "Citation", "typing /cite should offer Citation first")


def test_all_blocks_palette(app):
    app.fresh()
    app.js("document.querySelector('#fbar .fpick.addmenu').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))")
    time.sleep(0.4)
    app.js("[...FLOW.pop.querySelectorAll('.frow')].find((x) => x.textContent.includes('All blocks')).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))")
    time.sleep(0.8)
    box = app.js("(() => { const r = document.querySelector('#palette').getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom, document.querySelector('#palette').hidden]; })()")
    check(not box[4], "All blocks should open the palette")
    check(box[0] >= 0 and box[1] <= 1280 and box[3] <= 760, f"palette should fit on screen: {box}")
    check(app.js("[...document.querySelectorAll('#palette .palette-action')].map((x) => x.title).join(',')") == "Citation,Footnote", "palette should offer Citation and Footnote")
    app.browser.key("Escape")
    time.sleep(0.5)
    check(app.js("document.querySelector('#palette').hidden"), "Escape should close the palette")


def test_preview_is_read_only(app):
    app.fresh()
    app.js("flowShow(false)")
    time.sleep(1.5)
    check(app.js("document.querySelector('.view-opt[data-view=preview]').classList.contains('on')"), "the switch should show Preview as active")
    app.js("document.querySelector('.view-opt[data-view=write]').click()")
    time.sleep(1)
    check(app.js("FLOW.on"), "pressing Write should go back to writing")
    app.js("document.querySelector('.view-opt[data-view=preview]').click()")
    time.sleep(1.5)
    check(app.js("!FLOW.on"), "pressing Preview should show the PDF pages")
    app.js("FLOW.previewClicks = 1; FLOW.previewAt = Date.now(); select(S.ranges.find((r) => r.kind === 'chart'))")
    time.sleep(0.8)
    check(app.js("!FLOW.on"), "a single click in preview should stay in preview")
    app.js("FLOW.previewClicks = 2; FLOW.previewAt = Date.now(); select(S.ranges.find((r) => r.kind === 'chart'))")
    time.sleep(1.2)
    check(app.js("FLOW.on"), "double-clicking a block in preview should open it in Write view")
    check(app.js("FLOW.editor.state.selection.node && FLOW.editor.state.selection.node.attrs.kind") == "chart", "the clicked chart should be selected")
    app.js("flowShow(false)")
    time.sleep(1)
    app.browser.key("Escape")
    time.sleep(1)
    check(app.js("FLOW.on"), "Escape in preview should go back to writing")


def test_panel_stays_open_while_editing(app):
    app.fresh()
    app.js("document.querySelector('.fb[data-kind=timeline]').scrollIntoView({ block: 'center' })")
    time.sleep(0.6)
    spot = app.js("(() => { const r = document.querySelector('.fb[data-kind=timeline]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
    app.browser.click(spot[0], spot[1])
    time.sleep(1)
    for title in ("Key dates A", "Key dates B"):
        app.js(f"(() => {{ const i = [...document.querySelectorAll('#panel input, #panel textarea')].find((i) => /^Key dates/.test(i.value)); i.value = {json.dumps(title)}; i.dispatchEvent(new Event('input', {{ bubbles: true }})); }})()")
        time.sleep(4)
        check(app.js("!!S.panel && !document.querySelector('#panel').hidden"), f"panel should stay open after editing to {title}")
        check(f"title: {title}" in app.js("S.source"), f"the edit {title} should reach the essay")


def test_panel_controls_slide(app):
    app.fresh()
    for _ in range(2):
        app.js("document.querySelector('.fb[data-kind=chart]').scrollIntoView({ block: 'center' })")
        time.sleep(1)
    spot = app.js("(() => { const r = document.querySelector('.fb[data-kind=chart]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
    app.browser.click(spot[0], spot[1])
    app.wait("!!S.panel && [...document.querySelectorAll('#panel .line.stack')].some((l) => /Align/.test(l.textContent))", 10, "the chart panel")
    time.sleep(0.6)
    trace = app.js("""new Promise((done) => {
      const line = () => [...document.querySelectorAll('#panel .line.stack')].find((l) => l.querySelector('label') && l.querySelector('label').textContent === 'Align');
      const target = [...line().querySelectorAll('button')].find((b) => !b.classList.contains('on') && !b.classList.contains('off'));
      const start = line().querySelector('.seg-thumb').getBoundingClientRect().left;
      target.click();
      const seen = [];
      const tick = () => {
        const thumb = line().querySelector('.seg-thumb');
        seen.push(thumb.getBoundingClientRect().left);
        if (seen.length < 30) requestAnimationFrame(tick);
        else done({ start, seen, end: target.isConnected ? target.getBoundingClientRect().left : line().querySelector('button.on').getBoundingClientRect().left });
      };
      requestAnimationFrame(tick);
    })""")
    between = [x for x in trace["seen"] if min(trace["start"], trace["end"]) + 3 < x < max(trace["start"], trace["end"]) - 3]
    check(abs(trace["end"] - trace["start"]) > 10, f"Align should move to another button: {trace}")
    check(len(between) >= 3, f"the Align highlight should slide, not jump: {trace['start']} -> {trace['seen'][:12]}")
    flip = app.js("""new Promise((done) => {
      const box = [...document.querySelectorAll('#panel .field input[type=checkbox]')][0];
      const knob = () => parseFloat(getComputedStyle(document.querySelectorAll('#panel .field input[type=checkbox]')[0], '::before').left);
      const start = knob();
      box.click();
      const seen = [];
      const tick = () => {
        seen.push(knob());
        if (seen.length < 20) requestAnimationFrame(tick);
        else done({ start, seen });
      };
      requestAnimationFrame(tick);
    })""")
    middle = [x for x in flip["seen"] if 4 < x < 18]
    check(len(middle) >= 2, f"the switch knob should slide: {flip}")


def test_check_shows_section_names(app):
    app.fresh()
    check(app.js("lineWhere(3)") == "Settings", "lines in the settings header should say Settings")
    label = app.js("lineWhere(40)")
    check(label and not label.startswith("L"), f"lines in the body should name a section, got {label!r}")


def test_undo_redo(app):
    app.fresh()
    app.caret_to_paragraph("Newcomen")
    app.browser.type(" Zebra")
    time.sleep(0.4)
    check("Zebra" in app.js("FLOW.editor.state.doc.textContent"), "typing should insert text")
    app.browser.key("z", mods=2)
    time.sleep(0.4)
    check("Zebra" not in app.js("FLOW.editor.state.doc.textContent"), "Ctrl+Z should undo typing")
    app.browser.key("y", mods=2)
    time.sleep(0.4)
    check("Zebra" in app.js("FLOW.editor.state.doc.textContent"), "Ctrl+Y should redo typing")


def test_changes_elsewhere_are_never_lost(app):
    app.fresh()
    text = app.essay.read_text(encoding="utf-8")
    app.essay.write_text(text.replace("# Introduction\n", "# Introduction\n\nAn edit made on another computer.\n", 1), encoding="utf-8")
    app.js("diskCheck()")
    app.wait("S.source.includes('An edit made on another computer.')", 15, "the outside edit to load")
    app.settled()
    text = app.essay.read_text(encoding="utf-8")
    app.essay.write_text(text.replace("An edit made on another computer.", "A second outside edit.", 1), encoding="utf-8")
    app.caret_to_paragraph("Newcomen")
    app.browser.type(" Mine")
    app.wait("!!document.getElementById('conflictSheet')", 15, "the conflict question")
    app.js("[...document.querySelectorAll('#conflictSheet button')].find((b) => b.textContent === 'Keep both').click()")
    time.sleep(1.5)
    copies = list(app.folder.glob("*(other version)*.txt"))
    check(copies, "keeping both should save the other version as its own essay")
    check("A second outside edit." in copies[0].read_text(encoding="utf-8"), "the other version should keep the outside edit")
    check("Mine" in app.essay.read_text(encoding="utf-8"), "the essay should keep the text typed here")
    app.settled()
    check(app.js("!document.getElementById('conflictSheet')"), "the question should not come back")


def test_report_a_problem(app):
    app.fresh()
    app.js("helpOpen()")
    time.sleep(0.4)
    app.js("[...document.querySelectorAll('#helpSheet .help-act')].find((b) => b.textContent.includes('Report a problem')).click()")
    app.wait("!!document.getElementById('reportSheet')", 10, "the report form")
    app.js("const w = document.querySelector('.report-words'); w.value = 'The chart vanished'; w.dispatchEvent(new Event('input'))")
    preview = app.js("document.querySelector('.report-preview').textContent")
    check("The chart vanished" in preview, "the report should include what the student wrote")
    check(f"Essay Builder {VERSION}" in preview, "the report should include the version")
    check("Newcomen's engine was used mainly" not in preview, "the report must never include essay text")
    check(str(Path.home()) not in preview, "the report must hide the home folder path")
    app.browser.key("Escape")
    time.sleep(0.3)
    check(app.js("!document.getElementById('reportSheet')"), "Escape should close the report form")
    app.js("reportNote('Test failure', location.origin + '/flow-pages.js:1')")
    time.sleep(0.8)
    check("Report it" in app.js("document.querySelector('#toast').textContent"), "an error should offer to report it")


def test_citation_page_numbers(app):
    app.fresh()
    CHIP = "(() => { let at = null; FLOW.editor.state.doc.descendants((n, p) => { if (at === null && n.type.name === 'chip' && n.attrs.kind === 'cite' && /^\\[@[^,;\\]]+\\]$/.test(n.attrs.src)) at = p; }); return at; })()"
    pos = app.js(CHIP)
    check(pos is not None, "the demo essay should have a citation")
    key = app.js(f"FLOW.editor.state.doc.nodeAt({pos}).attrs.src").strip("[]@")

    def click_chip():
        app.js(f"FLOW.editor.view.nodeDOM({pos}).scrollIntoView({{ block: 'center' }})")
        time.sleep(0.4)
        spot = app.js(f"(() => {{ const r = FLOW.editor.view.nodeDOM({pos}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }})()")
        app.browser.click(spot[0], spot[1])
        app.wait("!!document.querySelector('.fcite')", 10, "the citation card")

    click_chip()
    app.js("const i = document.querySelector('.fcite-page'); i.focus()")
    app.browser.type("45")
    app.browser.key("Enter")
    time.sleep(0.5)
    check(f"[@{key}, 45]" in app.js("FLOW.editor.getText ? S.source : S.source"), "the page should be added to the citation")
    app.settled()
    label = app.js(f"FLOW.editor.view.nodeDOM({pos}).textContent")
    check("p. 45" in label, f"the citation should show the page, got {label!r}")
    click_chip()
    app.js("[...document.querySelectorAll('.fcite-form')][1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))")
    time.sleep(0.5)
    app.browser.key("Escape")
    check(f"@{key} [45]" in app.js("S.source"), "switching to a sentence citation should keep the page")
    app.settled()
    label = app.js(f"FLOW.editor.view.nodeDOM({pos}).textContent")
    check(label.endswith("p. 45)") and not label.startswith("("), f"a sentence citation should read like Name (year, p. 45), got {label!r}")


def test_menus_fit_at_extra_large_size(app):
    app.fresh()
    app.js("UI.size = 1.4; applyAppearance()")
    time.sleep(0.6)
    try:
        for selector in ("#fbar .fpick.addmenu", "#designBtn", "#fbar .fpick.font"):
            app.js(f"document.querySelector('{selector}').dispatchEvent(new MouseEvent('mousedown', {{ bubbles: true, cancelable: true }}))")
            time.sleep(0.5)
            box = app.js(f"(() => {{ const m = FLOW.pop.getBoundingClientRect(); const b = document.querySelector('{selector}').getBoundingClientRect(); return [m.left, m.top, m.right, m.bottom, b.left, b.bottom, innerWidth, innerHeight]; }})()")
            check(box and box[0] >= 0 and box[2] <= box[6] + 1 and box[3] <= box[7] + 1, f"{selector} menu should be on screen at XL: {box}")
            check(abs(box[1] - box[5]) < 30 and abs(box[0] - box[4]) < 260, f"{selector} menu should open next to its button at XL: {box}")
            app.browser.key("Escape")
            time.sleep(0.4)
    finally:
        app.js("UI.size = 1; applyAppearance()")


def test_pages_stay_live_with_a_problem(app):
    app.fresh()
    pages = app.js("S.pages.length")
    app.caret_to_paragraph("Newcomen")
    app.browser.type(" See @fig:nothing here. Extra words to check the pages keep updating.")
    app.wait("S.issues.some((i) => i.level === 'error') && !S.dirty", 40, "the problem to be reported")
    time.sleep(1)
    check(app.js("S.pages.length") >= pages, "the pages should still be shown")
    check(app.js("S.lastSent === S.source"), "the pages should match what was typed, even with a problem")
    check(app.js("document.querySelector('#status').textContent") == "Fix needed", "the status should say Fix needed")
    check(not app.js(OUTSIDE_PAGES), "text should stay on the pages")
    app.wait("!!document.querySelector('.fchip.ref.missing')", 10, "the broken reference to be marked in red")
    check(app.js("document.querySelector('.check-alert') && document.querySelector('.check-alert').textContent") == "1", "the Check button should show 1 problem")
    answer = app.js("api('/api/export')")
    check(answer.get("problems") == 1 and "Fix this problem first" in answer.get("error", ""), f"export should explain what to do: {answer}")


def test_blocks_never_go_blank_while_updating(app):
    app.fresh()
    app.js("document.querySelector('.fb[data-kind=timeline]').scrollIntoView({ block: 'center' })")
    time.sleep(0.6)
    spot = app.js("(() => { const r = document.querySelector('.fb[data-kind=timeline]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
    app.browser.click(spot[0], spot[1])
    time.sleep(1)
    app.js("window.__looks = []; window.__watch = setInterval(() => { const v = document.querySelector('.fb[data-kind=timeline] .fb-view'); __looks.push(v ? v.className : 'gone'); }, 100)")
    app.js("(() => { const i = [...document.querySelectorAll('#panel input, #panel textarea')].find((i) => /^Key dates/.test(i.value)); i.value = 'Key dates in the revolution'; i.dispatchEvent(new Event('input', { bubbles: true })); })()")
    time.sleep(6)
    looks = app.js("clearInterval(__watch); __looks")
    blank = [look for look in looks if "fb-info" in look or "fb-wait" in look or look == "gone"]
    check(not blank, f"the timeline should keep showing a picture while it updates, saw {sorted(set(blank))}")


def test_new_source_from_at_keeps_sentence(app):
    app.fresh()
    app.js("api('/api/new', { template: 'tok-essay' }).then(load)")
    time.sleep(1)
    app.settled()
    first = app.js("(() => { let t = null; FLOW.editor.state.doc.descendants((n) => { if (t === null && n.type.name === 'paragraph' && n.textContent.length > 40) t = n.textContent.slice(0, 20); }); return t })()")
    app.caret_to_paragraph(first)
    for char in " Fission gave nations power @":
        app.browser.send("Input.insertText", {"text": char})
    time.sleep(0.5)
    check(app.js("FLOW.slash && FLOW.slash.list[FLOW.slash.list.length - 1].label") == "Add a new source", "the @ menu should offer to add a new source")
    app.js("flowSlashRun(FLOW.slash.list.length - 1)")
    app.wait("!!document.querySelector('.src-box')", 10, "the add source form")
    for name, value in (("title", "The Making of the Atomic Bomb"), ("author", "Rhodes, Richard")):
        app.js(f"(() => {{ const i = document.querySelector('.src-form input[data-name={name}]'); i.value = {json.dumps(value)}; i.dispatchEvent(new Event('input')); }})()")
    app.js("SRC.fields.type = 'book'; SRC.fields.year = '1986'; SRC.fields.publisher = 'Simon and Schuster'; srcSave(true)")
    app.wait("!document.querySelector('.src-box')", 15, "the source to be added")
    time.sleep(1)
    text = app.js(f"(() => {{ let t = ''; FLOW.editor.state.doc.descendants((n) => {{ if (n.type.name === 'paragraph' && n.textContent.startsWith({json.dumps(first)})) t = n.textContent; }}); return t; }})()")
    check("Fission gave nations power" in text, f"the sentence must survive adding a source, got {text!r}")
    check(app.js("(() => { let c = 0; FLOW.editor.state.doc.descendants((n) => { if (n.type.name === 'chip' && n.attrs.src.includes('rhodes')) c++; }); return c; })()") == 1, "the new source should be cited once")


def test_adding_a_table_keeps_other_blocks_right(app):
    app.fresh()
    app.js("api('/api/new', { template: 'tok-essay' }).then(load)")
    time.sleep(1)
    app.settled()
    first = app.js("(() => { let t = null; FLOW.editor.state.doc.descendants((n) => { if (t === null && n.type.name === 'paragraph' && n.textContent.length > 40) t = n.textContent.slice(0, 20); }); return t })()")
    app.caret_to_paragraph(first)
    app.js("flowInsertTemplate(TEMPLATES.find((t) => t.id === 'table'))")
    time.sleep(1)
    app.settled()
    looks = app.js("[...document.querySelectorAll('.fb')].map((d) => [d.dataset.kind, d.querySelector('.fb-view').className])")
    wrong = [look for look in looks if look[0] == "sources" and "fb-info" not in look[1]]
    check(not wrong, f"the sources box must keep its own look after a table is added: {looks}")
    check(not app.js(OUTSIDE_PAGES), "text should stay on the pages after adding a table")


def test_new_page_shortcut_and_heading_option(app):
    app.fresh()
    at = app.caret_to_paragraph("Newcomen's engine was used")
    check(at, "the paragraph should be found")
    app.js("(() => { const ed = FLOW.editor; let p = null; ed.state.doc.descendants((n, pos) => { if (p === null && n.type.name === 'paragraph' && n.textContent.startsWith(\"Newcomen's engine was used\")) p = pos; }); const text = ed.state.doc.nodeAt(p).textContent; ed.commands.setTextSelection(p + 1 + text.indexOf(' James Watt')); ed.commands.focus(); })()")
    time.sleep(0.3)
    for kind in ("keyDown", "keyUp"):
        app.browser.send("Input.dispatchKeyEvent", {"type": kind, "key": "Enter", "code": "Enter", "modifiers": 2, "windowsVirtualKeyCode": 13})
    time.sleep(0.3)
    app.browser.send("Input.insertText", {"text": "Z"})
    app.wait("S.source.includes(':::pagebreak')", 10, "the page break in the essay")
    source = app.js("S.source")
    before = source.index("almost free.")
    brk = source.index(":::pagebreak")
    after = source.index("Z James Watt")
    check(before < brk < after, "Ctrl+Enter should split the paragraph, put a page break in between, and keep typing on the new page")
    states = app.js("""(() => {
      let pos = null, node = null;
      FLOW.editor.state.doc.forEach((n, p) => { if (n.type.name === 'heading' && n.textContent.startsWith('Evaluation')) { pos = p; node = n; } });
      const first = flowHeadingItems(pos, node)[0];
      first.run();
      let again = null;
      FLOW.editor.state.doc.forEach((n, p) => { if (n.type.name === 'heading' && n.textContent.startsWith('Evaluation')) again = flowHeadingItems(p, n)[0]; });
      return [first.label, again.label];
    })()""")
    check(states[0].startswith("✓") != states[1].startswith("✓") and "Starts a new page" in states[1], f"the heading option should switch: {states}")
    app.wait("/# Evaluation: was steam the cause\\? \\{(newpage|samepage)\\}/.test(S.source)", 10, "the heading flag in the essay")


def test_insert_between_blocks(app):
    app.fresh()
    shown = "[...FLOW.editor.view.dom.children].some((el) => !el.classList.contains('pg-gap') && el.textContent.includes('Newcomen'))"
    for attempt in range(3):
        app.caret_to_paragraph("Newcomen")
        time.sleep(0.6)
        try:
            app.wait(shown, 10, "the paragraph to be on screen")
            break
        except AssertionError:
            if attempt == 2:
                raise
            app.fresh()
    spot = app.js("""(() => {
      const dom = [...FLOW.editor.view.dom.children].filter((el) => !el.classList.contains('pg-gap'));
      const i = dom.findIndex((el) => el.textContent.includes('Newcomen'));
      const a = dom[i].getBoundingClientRect(), b = dom[i + 1].getBoundingClientRect();
      return [a.left + a.width / 2, (a.bottom + b.top) / 2, dom.length];
    })()""")
    before = spot[2]
    app.js("flowPopClose(); flowSlashClose(); conceal(document.querySelector('#palette'))")
    for attempt in range(4):
        for dy in (6, 0):
            app.browser.send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": spot[0], "y": spot[1] + dy})
            time.sleep(0.25)
        if app.js("!!document.querySelector('.flow-between.on')"):
            break
    check(app.js("!!document.querySelector('.flow-between.on')"), "a + should appear between two blocks")
    box = app.js("(() => { const r = document.querySelector('.flow-between.on .flow-between-dot').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
    app.browser.click(box[0], box[1])
    time.sleep(0.6)
    check(app.js("!!FLOW.pop"), "clicking + should open the Add menu")
    check(app.js("[...FLOW.editor.view.dom.children].filter((el) => !el.classList.contains('pg-gap')).length") == before + 1, "clicking + should add a new line there")
    check(app.js("FLOW.editor.state.selection.$from.parent.textContent") == "", "the caret should be on the new empty line")
    app.browser.key("Escape")


def test_at_finds_blocks_by_name(app):
    app.fresh()
    app.caret_to_paragraph("Newcomen")
    charts = app.js("document.querySelectorAll('.fb[data-kind=chart]').length")
    app.browser.type(" @chart")
    time.sleep(0.5)
    labels = app.js("FLOW.slash ? FLOW.slash.list.map((x) => x.label + '|' + (x.group || '')) : []")
    check("Chart|Insert" in labels, f"@chart should offer to insert a chart, got {labels}")
    index = labels.index("Chart|Insert")
    app.js(f"flowSlashRun({index})")
    time.sleep(1)
    check(app.js("document.querySelectorAll('.fb[data-kind=chart]').length") == charts + 1, "a chart should be inserted")
    check("@chart" not in app.js("FLOW.editor.state.doc.textContent"), "the @chart text should be removed")


def test_text_size_shortcuts(app):
    app.fresh()
    app.caret_to_paragraph("Newcomen")
    app.js("(() => { const ed = FLOW.editor; const { from } = ed.state.selection; ed.commands.setTextSelection({ from: from - 20, to: from - 1 }); ed.commands.focus(); })()")
    for code, key in (("Period", ">"), ("Period", ">")):
        app.browser.send("Input.dispatchKeyEvent", {"type": "keyDown", "key": key, "code": code, "modifiers": 10, "windowsVirtualKeyCode": 190})
        app.browser.send("Input.dispatchKeyEvent", {"type": "keyUp", "key": key, "code": code, "modifiers": 10, "windowsVirtualKeyCode": 190})
        time.sleep(0.2)
    size = app.js("(flowFmtAt().find((item) => item.key === 'size') || {}).value")
    check(size == "14", f"two Ctrl+Shift+> presses from 11 should give 14, got {size}")
    app.browser.send("Input.dispatchKeyEvent", {"type": "keyDown", "key": "<", "code": "Comma", "modifiers": 10, "windowsVirtualKeyCode": 188})
    app.browser.send("Input.dispatchKeyEvent", {"type": "keyUp", "key": "<", "code": "Comma", "modifiers": 10, "windowsVirtualKeyCode": 188})
    time.sleep(0.2)
    size = app.js("(flowFmtAt().find((item) => item.key === 'size') || {}).value")
    check(size == "12", f"Ctrl+Shift+< should step back to 12, got {size}")


def test_first_run_welcome(app):
    app.fresh()
    app.js("localStorage.removeItem('studio.themed'); localStorage.removeItem('studio.welcomed')")
    app.js("goHome()")
    time.sleep(1)
    app.js("pickTheme()")
    app.wait("!!document.getElementById('welcomeSheet')", 10, "the welcome")
    names = app.js("[...document.querySelectorAll('.welcome-choice b')].map((b) => b.textContent)")
    check(names[:3] == ["Extended Essay", "TOK essay", "Internal Assessment"], f"welcome choices: {names}")
    check(app.js("!document.querySelector('.theme-pick')"), "the colour picker should not appear first")
    app.js("document.querySelector('.welcome-link').click()")
    app.wait("S.name === 'Industrial Revolution Essay.txt' && S.pages.length > 3", 60, "the sample essay to open")
    check((app.essays / "Sample essay" / ESSAY_NAME).is_file(), "the sample should be copied into the essays folder")
    app.js("goHome()")
    time.sleep(1)
    check(app.js("!(typeof TOUR !== 'undefined' && TOUR.root)"), "going home should end the tour")


def test_essays_folder_can_move(app):
    app.fresh()
    app.js("goHome()")
    time.sleep(1.5)
    line = app.js("(document.querySelector('#storageLine .storage-text') || {}).textContent || ''")
    check("computer" in line or "backed up" in line, f"home should say where essays are saved, got {line!r}")
    app.js("storageSheet()")
    time.sleep(0.5)
    check(app.js("document.querySelectorAll('#storageSheet .storage-option').length") >= 1, "the folder chooser should list places")
    app.browser.key("Escape")
    time.sleep(0.3)
    check(app.js("!document.getElementById('storageSheet')"), "Escape should close the folder chooser")
    target = app.temp / "moved essays"
    answer = app.js(f"api('/api/storage_set', {{ path: {json.dumps(str(target))}, move: true }})")
    check(not answer.get("error"), f"moving should work: {answer}")
    check((target / FIXTURE.name / ESSAY_NAME).is_file(), "the essay should be in the new folder")
    check(not app.essay.exists(), "the essay should no longer be in the old folder")
    library = app.js("api('/api/library').then((a) => a.items.map((x) => x.path))")
    check(any(str(target) in item for item in library), f"the library should list the moved essay: {library}")
    app.essays = target
    app.folder = target / FIXTURE.name
    app.essay = app.folder / ESSAY_NAME


def test_footnotes_not_counted():
    import build

    html = '<!--WC-START--><p>Alpha beta gamma delta epsilon.<sup class="fnr" data-n="1">1</sup></p><div class="notes"><div class="nh">Notes</div><div>Zeta eta theta</div></div><!--WC-END-->'
    check(build.word_count(html) == 5, f"footnotes should not count, got {build.word_count(html)}")


def test_update_download_is_verified():
    import hashlib

    sys.path.insert(0, str(ROOT / "studio"))
    import update

    with tempfile.TemporaryDirectory() as folder:
        folder = Path(folder)
        setup = folder / "EssayBuilder-Setup.exe"
        setup.write_bytes(os.urandom(700_000))
        good = {"url": setup.as_uri(), "size": setup.stat().st_size, "sha256": hashlib.sha256(setup.read_bytes()).hexdigest()}
        updater = update.Updater(folder / "updates", installed=False)
        updater.start(good, "v9.9.9")
        for _ in range(100):
            if updater.progress()["stage"] != "downloading":
                break
            time.sleep(0.05)
        check(updater.progress()["stage"] == "ready", f"a good download should be ready: {updater.progress()}")
        check(updater.file.read_bytes() == setup.read_bytes(), "the downloaded file should match")
        check("error" in updater.install(), "a non-installed copy must never run the installer")
        bad = dict(good, sha256="0" * 64)
        broken = update.Updater(folder / "updates2", installed=False)
        broken.start(bad, "v9.9.9")
        for _ in range(100):
            if broken.progress()["stage"] != "downloading":
                break
            time.sleep(0.05)
        check(broken.progress()["stage"] == "error", "a damaged download must be refused")
        check(not list((folder / "updates2").glob("*.exe")), "a damaged download must not be kept")


def test_arabic_reads_right_to_left():
    with tempfile.TemporaryDirectory() as folder:
        folder = Path(folder)
        essay = folder / "a.txt"
        essay.write_text(
            "\n".join(["title: T", "cover: no", "contents: no", "---", "# مقدمة", "", "نص عربي.", "", "- أول", "- ثاني", "", "# English", "", "Plain English.", ""]),
            encoding="utf-8",
        )
        run = subprocess.run([sys.executable, str(ROOT / "engine" / "build.py"), str(essay), str(folder / "a.pdf"), "--keep-html"], capture_output=True, text=True)
        check(run.returncode == 0, f"the Arabic essay should build: {run.stdout}{run.stderr}")
        html = next(folder.glob("*.html")).read_text(encoding="utf-8")
        check('<ul dir="auto"' in html and "<li dir" not in html, "lists should get an automatic direction, list items should inherit it")
        check('<p dir="auto"' in html, "paragraphs should get an automatic direction")
        check("'EB Arabic'" in html, "Arabic text should get an Arabic font")
        check("<h1 dir=\"auto\"" in html and "مقدمة" in html, "the Arabic heading should be kept")


def test_every_language_counts_words():
    import build
    from lib import checks
    from lib.parse import page_lang

    html = "<!--WC-START--><p>L'été est là. كَتَبَ الطالبُ مقالةً طويلة. Größe 2024.</p><!--WC-END-->"
    check(build.word_count(html) == 9, f"French, Arabic and German words should all count, got {build.word_count(html)}")
    check(checks.count_words("Élève très motivé.") == 3, "a word starting with an accent should count")
    check(page_lang({"language": "French"}) == "fr" and page_lang({"language": "ar"}) == "ar" and page_lang({}) == "en", "language should set the page language")


def test_every_template_is_detected():
    import contextlib
    import io

    from lib import checks

    names = {ident for ident in checks.TASKS}
    for file in sorted((ROOT / "studio" / "starters").glob("*.txt")):
        check(file.stem in names, f"{file.stem} has no Check criteria")
        check(file.with_suffix(".png").is_file(), f"{file.stem} has no thumbnail")
        with contextlib.redirect_stdout(io.StringIO()):
            result = checks.run(file, file.read_text(encoding="utf-8"))
        check(result["detected"] == file.stem, f"{file.stem} was detected as {result['detected']}")


def test_gallery_groups(app):
    app.fresh()
    app.js("goHome()")
    time.sleep(1)
    app.js("GALLERY.items = null; openGallery()")
    app.wait("document.querySelectorAll('#gallery .g-section').length >= 4", 10, "the gallery groups")
    groups = app.js("[...document.querySelectorAll('#gallery .g-group')].map((g) => g.textContent)")
    check(groups[:4] == ["Core", "Subjects", "Languages", "General"], f"gallery groups: {groups}")
    names = app.js("[...document.querySelectorAll('#gallery .g-name')].map((g) => g.textContent)")
    for name in ["Business Management IA", "Digital Society IA", "French Writing Task", "Arabic Writing Task", "CAS Reflection"]:
        check(name in names, f"{name} should be in the gallery")
    app.js("document.querySelector('#gallery .g-card').focus()")
    first = app.js("document.activeElement.dataset.template")
    app.browser.key("ArrowDown")
    time.sleep(0.1)
    below = app.js("document.activeElement.dataset.template")
    check(below and below != first, f"ArrowDown should move to the card below, stayed on {below}")
    app.browser.key("Escape")
    time.sleep(0.3)
    check(app.js("!galleryOpen()"), "Escape should close the gallery")


def test_science_graphs_have_error_bars():
    with tempfile.TemporaryDirectory() as folder:
        folder = Path(folder)
        (folder / "a.txt").write_text(
            "title: T\ncover: no\ncontents: no\n---\n# One\n\n:::chart\ntype: scatter\nx: L\ny: T\nyerr: U\ntrendline: linear\ncaption: Test.\n---\n| L | T | U |\n|--|--|--|\n| 1 | 2 | 0.2 |\n| 2 | 4 | 0.2 |\n| 3 | 6 | 0.3 |\n:::\n\n:::chart\ntype: bar\nx: G\ny: M\nyerr: 10%\ncaption: Bars.\n---\n| G | M |\n|--|--|\n| A | 5 |\n| B | 7 |\n:::\n",
            encoding="utf-8",
        )
        run = subprocess.run([sys.executable, str(ROOT / "engine" / "build.py"), str(folder / "a.txt"), str(folder / "a.pdf"), "--keep-html"], capture_output=True, text=True)
        check(run.returncode == 0, f"the graphs should build: {run.stdout}{run.stderr}")
        html = next(folder.glob("*.html")).read_text(encoding="utf-8")
        check("y = 2x + 0, R² = 1.000" in html, "the best-fit line should show its equation and R²")
        check(html.count('stroke-width="1" fill="none"') >= 3 and html.count('stroke-width="1.1" fill="none"') >= 2, "every point and bar should have an error bar")
        check(">U<" not in html, "the uncertainty column should not be drawn as its own series")


def test_chart_with_wrong_column_still_builds():
    with tempfile.TemporaryDirectory() as folder:
        folder = Path(folder)
        (folder / "d.csv").write_text("Item,Amount\nA,3\nB,5\n", encoding="utf-8")
        (folder / "a.txt").write_text(
            "title: Test\ncover: no\ncontents: no\n---\n# One\n\nAlpha beta.\n\n:::chart\ntype: bar\nsrc: d.csv\nx: Month\ny: Sales\ncaption: Test chart.\n:::\n",
            encoding="utf-8",
        )
        run = subprocess.run([sys.executable, str(ROOT / "engine" / "build.py"), str(folder / "a.txt"), "--check"], capture_output=True, text=True)
        check(run.returncode == 0, f"build should succeed:\n{run.stdout}{run.stderr}")
        check("another column was used" in run.stdout + run.stderr, "build should explain the column fallback")


APP_TESTS = [
    test_opens_in_write_view,
    test_pages_line_up_with_pdf,
    test_typing_keeps_text_on_pages,
    test_reopens_where_you_left_off,
    test_add_menu_works_with_keyboard,
    test_design_menu_and_escape,
    test_slash_footnote_and_citation,
    test_all_blocks_palette,
    test_preview_is_read_only,
    test_panel_stays_open_while_editing,
    test_panel_controls_slide,
    test_check_shows_section_names,
    test_undo_redo,
    test_changes_elsewhere_are_never_lost,
    test_report_a_problem,
    test_citation_page_numbers,
    test_menus_fit_at_extra_large_size,
    test_pages_stay_live_with_a_problem,
    test_blocks_never_go_blank_while_updating,
    test_new_source_from_at_keeps_sentence,
    test_adding_a_table_keeps_other_blocks_right,
    test_new_page_shortcut_and_heading_option,
    test_insert_between_blocks,
    test_at_finds_blocks_by_name,
    test_text_size_shortcuts,
    test_first_run_welcome,
    test_essays_folder_can_move,
    test_gallery_groups,
]
ENGINE_TESTS = [test_footnotes_not_counted, test_chart_with_wrong_column_still_builds, test_update_download_is_verified, test_arabic_reads_right_to_left, test_every_language_counts_words, test_every_template_is_detected, test_science_graphs_have_error_bars]


def main():
    only = sys.argv[1:]
    chosen = [test for test in ENGINE_TESTS + APP_TESTS if not only or any(word in test.__name__ for word in only)]
    failed = []
    app = None
    started = time.time()
    try:
        for test in chosen:
            began = time.time()
            try:
                if test in APP_TESTS:
                    app = app or App()
                    test(app)
                else:
                    test()
                print(f"  pass  {test.__name__[5:]}  ({time.time() - began:.1f}s)")
            except Exception as error:
                failed.append(test.__name__)
                detail = str(error) if isinstance(error, AssertionError) else traceback.format_exc(limit=3)
                print(f"  FAIL  {test.__name__[5:]}  {detail}")
    finally:
        if app:
            app.close()
    print(f"\n{len(chosen) - len(failed)} passed, {len(failed)} failed in {time.time() - started:.0f}s")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
