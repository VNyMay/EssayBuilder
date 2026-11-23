import atexit
import base64
import json
import shutil
import subprocess
import tempfile
import threading
import time
from pathlib import Path

from .setup import browser, browser_flags

TIMEOUT = 90


class Session:
    def __init__(self):
        self.process = None
        self.socket = None
        self.profile = None
        self.counter = 0
        self.target = None
        self.events = []
        self.lock = threading.Lock()

    def alive(self):
        return self.process is not None and self.process.poll() is None and self.socket is not None

    def start(self):
        from websockets.sync.client import connect

        self.profile = Path(tempfile.mkdtemp(prefix="essay-chrome-"))
        flags = [flag for flag in browser_flags() if flag != "--headless"]
        self.process = subprocess.Popen(
            [
                browser(),
                "--headless",
                *flags,
                "--remote-debugging-port=0",
                f"--user-data-dir={self.profile}",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-extensions",
                "--disable-background-networking",
                "--disable-component-update",
                "--allow-file-access-from-files",
                "about:blank",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        marker = self.profile / "DevToolsActivePort"
        deadline = time.time() + 15
        while not marker.exists() and time.time() < deadline:
            time.sleep(0.03)
        if not marker.exists():
            raise RuntimeError("Chrome did not start")
        port, path = marker.read_text(encoding="utf-8").split()[:2]
        self.socket = connect(f"ws://127.0.0.1:{port}{path}", max_size=None, open_timeout=10)
        created = self.send("Target.createTarget", {"url": "about:blank"}, session=False)
        attached = self.send(
            "Target.attachToTarget", {"targetId": created["targetId"], "flatten": True}, session=False
        )
        self.target = attached["sessionId"]
        self.send("Page.enable")
        self.send("Runtime.enable")

    def send(self, method, params=None, session=True):
        self.counter += 1
        ident = self.counter
        message = {"id": ident, "method": method, "params": params or {}}
        if session and self.target:
            message["sessionId"] = self.target
        self.socket.send(json.dumps(message))
        deadline = time.time() + TIMEOUT
        while time.time() < deadline:
            reply = json.loads(self.socket.recv(timeout=TIMEOUT))
            if reply.get("id") == ident:
                if "error" in reply:
                    raise RuntimeError(f"{method}: {reply['error'].get('message')}")
                return reply.get("result", {})
            if "method" in reply:
                self.events.append(reply["method"])
        raise RuntimeError(f"{method} timed out")

    def wait(self, name):
        deadline = time.time() + TIMEOUT
        while time.time() < deadline:
            if name in self.events:
                self.events.remove(name)
                return
            reply = json.loads(self.socket.recv(timeout=TIMEOUT))
            if "method" in reply:
                self.events.append(reply["method"])
        raise RuntimeError(f"{name} timed out")

    def print_pdf(self, uri, pdf):
        self.events.clear()
        self.send("Page.navigate", {"url": uri})
        self.wait("Page.loadEventFired")
        self.send("Runtime.evaluate", {"expression": "document.fonts.ready.then(() => true)", "awaitPromise": True})
        result = self.send(
            "Page.printToPDF",
            {
                "preferCSSPageSize": True,
                "printBackground": True,
                "displayHeaderFooter": False,
                "generateDocumentOutline": True,
                "transferMode": "ReturnAsBase64",
            },
        )
        Path(pdf).write_bytes(base64.b64decode(result["data"]))

    def stop(self):
        try:
            if self.socket is not None:
                self.socket.close()
        except Exception:
            pass
        if self.process is not None and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
        self.process = self.socket = self.target = None
        if self.profile is not None:
            shutil.rmtree(self.profile, ignore_errors=True)


SESSION = Session()
atexit.register(SESSION.stop)


def print_pdf(page, pdf):
    with SESSION.lock:
        for attempt in range(2):
            try:
                if not SESSION.alive():
                    SESSION.stop()
                    SESSION.start()
                SESSION.print_pdf(page.as_uri(), pdf)
                return
            except Exception:
                SESSION.stop()
                if attempt:
                    raise
