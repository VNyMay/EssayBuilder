import json
import os
import subprocess
import sys
import threading
import time
import tkinter as tk
import urllib.request
from pathlib import Path
from tkinter import messagebox

ROOT = Path(__file__).resolve().parent
STUDIO = ROOT / "studio"
ENGINE = ROOT / "engine"
INSTALLED = (ROOT / "installed.flag").is_file()
if INSTALLED:
    os.environ.setdefault("ESSAY_BUILDER_DATA", str(Path(os.environ.get("LOCALAPPDATA") or Path.home()) / "Essay Builder"))
    os.environ.setdefault("ESSAY_BUILDER_ESSAYS", str(Path.home() / "Documents" / "Essay Builder"))
    os.environ["PATH"] = str(ROOT / "node") + os.pathsep + os.environ.get("PATH", "")
DATA = Path(os.environ.get("ESSAY_BUILDER_DATA") or STUDIO)
DATA.mkdir(parents=True, exist_ok=True)
LOG = DATA / "studio.log"
LOCK = DATA / "running.json"
CONFIG = DATA / "launcher.json"
GREEN = "#027554"

if sys.platform == "win32":
    original = subprocess.Popen.__init__

    def quiet(self, *args, **kwargs):
        kwargs["creationflags"] = kwargs.get("creationflags", 0) | 0x08000000
        original(self, *args, **kwargs)

    subprocess.Popen.__init__ = quiet

sys.stdout = sys.stderr = LOG.open("a", encoding="utf-8", errors="replace")
sys.path.insert(0, str(ENGINE))
sys.path.insert(0, str(STUDIO))


def alive(port):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/ping", timeout=1.5):
            return True
    except OSError:
        return False


def running():
    if not LOCK.exists():
        return None
    try:
        port = json.loads(LOCK.read_text(encoding="utf-8"))["port"]
    except (ValueError, KeyError):
        return None
    return port if alive(port) else None


def send(port, route, body):
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}{route}",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    urllib.request.urlopen(request, timeout=10).read()


def make_shortcut():
    pythonw = Path(sys.executable).with_name("pythonw.exe")
    runner = pythonw if pythonw.exists() else Path(sys.executable)
    script = (
        "$d=[Environment]::GetFolderPath('Desktop');"
        "$s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d 'Essay Builder.lnk'));"
        "$s.TargetPath='{target}';$s.Arguments='\"{launcher}\"';"
        "$s.WorkingDirectory='{root}';$s.IconLocation='{icon}';$s.Save()"
    ).format(
        target=runner,
        launcher=ROOT / "Essay Builder.pyw",
        root=ROOT,
        icon=STUDIO / "icon.ico",
    )
    subprocess.run(["powershell", "-NoProfile", "-Command", script], capture_output=True)


def offer_shortcut(root):
    config = json.loads(CONFIG.read_text(encoding="utf-8")) if CONFIG.exists() else {}
    if config.get("asked") or sys.platform != "win32" or INSTALLED:
        return
    config["asked"] = True
    CONFIG.write_text(json.dumps(config), encoding="utf-8")
    if messagebox.askyesno("Essay Builder", "Add Essay Builder to your desktop?", parent=root):
        make_shortcut()


KEY = (1, 2, 3)


class Note:
    def __init__(self, canvas, item):
        self.canvas = canvas
        self.item = item

    def config(self, text):
        self.canvas.itemconfig(self.item, text=text)


def splash():
    if sys.platform == "win32":
        try:
            import ctypes

            ctypes.windll.shcore.SetProcessDpiAwareness(2)
        except Exception:
            pass
    root = tk.Tk()
    root.overrideredirect(True)
    root.attributes("-topmost", True)
    scale = max(1.0, root.winfo_fpixels("1i") / 96)
    width, height = round(380 * scale), round(240 * scale)
    x = (root.winfo_screenwidth() - width) // 2
    y = (root.winfo_screenheight() - height) // 2
    root.geometry(f"{width}x{height}+{x}+{y}")
    key = "#%02x%02x%02x" % KEY
    canvas = tk.Canvas(root, width=width, height=height, highlightthickness=0, bd=0, bg=key)
    canvas.pack()
    try:
        from PIL import Image, ImageTk

        picture = Image.open(STUDIO / "splash.png").convert("RGBA").resize((width, height), Image.LANCZOS)
        edge = picture.getchannel("A")
        flat = Image.new("RGB", picture.size, "white")
        flat.paste(picture, mask=edge)
        base = Image.new("RGB", picture.size, KEY)
        base.paste(flat, mask=edge.point(lambda value: 255 if value >= 128 else 0))
        photo = ImageTk.PhotoImage(base)
        canvas.image = photo
        canvas.create_image(0, 0, image=photo, anchor="nw")
        root.wm_attributes("-transparentcolor", key)
    except Exception:
        canvas.configure(bg="white")
        canvas.create_text(width // 2, round(110 * scale), text="Essay Builder", font=("Segoe UI", 18, "bold"), fill="#0c1f18")
    left, right, line = round(80 * scale), round(300 * scale), round(188 * scale)
    thick = max(4, round(5 * scale))
    canvas.create_line(left, line, right, line, width=thick, capstyle="round", fill="#dbe9e2")
    moving = canvas.create_line(left, line, left, line, width=thick, capstyle="round", fill=GREEN)
    note = canvas.create_text(width // 2, round(214 * scale), text="Starting", font=("Segoe UI", 10), fill="#56695f")
    started = time.time()
    reach = right - left
    block = reach * 0.34

    def tick():
        phase = ((time.time() - started) * 0.85) % 1.0
        eased = phase * phase * (3 - 2 * phase)
        head = left + (reach + block) * eased
        tail = head - block
        canvas.coords(moving, max(left, tail), line, min(right, head), line)
        canvas.itemconfig(moving, state="normal" if head > left and tail < right else "hidden")
        root.after(16, tick)

    tick()
    return root, Note(canvas, note)


def main():
    essay = sys.argv[1] if len(sys.argv) > 1 else None
    import serve

    port = running()
    if port:
        if essay:
            send(port, "/api/open", {"path": str(Path(essay).resolve())})
        serve.launch(f"http://127.0.0.1:{port}/")
        return
    root, status = splash()
    outcome = {"note": "Starting"}

    def start():
        try:
            from lib import setup

            outcome["note"] = "Preparing, the first start can take a minute"
            setup.ensure()
            outcome["note"] = "Opening"
            server, url = serve.create(essay)
            LOCK.write_text(json.dumps({"port": server.server_address[1]}), encoding="utf-8")
            outcome["worker"] = threading.Thread(target=server.serve_forever, daemon=True)
            outcome["worker"].start()
            serve.launch(url)
            time.sleep(1.2)
        except BaseException as error:
            outcome["error"] = f"{type(error).__name__}: {error}"
        outcome["done"] = True

    def poll():
        status.config(text=outcome["note"])
        if outcome.get("done"):
            root.quit()
        else:
            root.after(150, poll)

    threading.Thread(target=start, daemon=True).start()
    root.after(150, poll)
    root.mainloop()
    if "error" in outcome:
        messagebox.showerror("Essay Builder", outcome["error"], parent=root)
        return
    root.withdraw()
    offer_shortcut(root)
    root.destroy()
    try:
        outcome["worker"].join()
    finally:
        LOCK.unlink(missing_ok=True)
        serve.shutil.rmtree(serve.STATE.work, ignore_errors=True)


if __name__ == "__main__":
    main()
