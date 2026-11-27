import ctypes
import ctypes.wintypes as wt
import os
import sys
import threading
import time
from pathlib import Path

try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    pass

import webview

user32 = ctypes.windll.user32
comctl = ctypes.windll.comctl32
SUBCLASSPROC = ctypes.WINFUNCTYPE(ctypes.c_ssize_t, wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM, ctypes.c_size_t, ctypes.c_size_t)

user32.GetWindowRect.argtypes = [wt.HWND, ctypes.POINTER(wt.RECT)]
user32.SetWindowPos.argtypes = [wt.HWND, wt.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wt.UINT]
user32.MonitorFromWindow.argtypes = [wt.HWND, wt.DWORD]
user32.MonitorFromWindow.restype = wt.HANDLE
user32.ShowWindow.argtypes = [wt.HWND, ctypes.c_int]
user32.IsZoomed.argtypes = [wt.HWND]
user32.GetMonitorInfoW.argtypes = [wt.HANDLE, ctypes.c_void_p]
user32.SendMessageW.argtypes = [wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM]
user32.SendMessageW.restype = ctypes.c_ssize_t
user32.PostMessageW.argtypes = [wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM]
comctl.DefSubclassProc.argtypes = [wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM]
comctl.DefSubclassProc.restype = ctypes.c_ssize_t
comctl.SetWindowSubclass.argtypes = [wt.HWND, SUBCLASSPROC, ctypes.c_size_t, ctypes.c_size_t]
comctl.SetWindowSubclass.restype = wt.BOOL

SWP_NOSIZE = 0x1
SWP_NOMOVE = 0x2
SWP_NOZORDER = 0x4
SWP_NOACTIVATE = 0x10
SWP_FRAMECHANGED = 0x20
SW_MAXIMIZE, SW_MINIMIZE, SW_RESTORE = 3, 6, 9
WM_NCCALCSIZE = 0x0083
WM_SYSCOMMAND, SC_MINIMIZE, SC_MAXIMIZE, SC_RESTORE = 0x0112, 0xF020, 0xF030, 0xF120
SM_CXSIZEFRAME, SM_CXPADDEDBORDER = 32, 92
MIN_WIDTH, MIN_HEIGHT = 980, 640



class NcParams(ctypes.Structure):
    _fields_ = [("rgrc", wt.RECT * 3), ("lppos", ctypes.c_void_p)]


class MonitorInfo(ctypes.Structure):
    _fields_ = [("size", wt.DWORD), ("monitor", wt.RECT), ("work", wt.RECT), ("flags", wt.DWORD)]


def cursor():
    point = wt.POINT()
    user32.GetCursorPos(ctypes.byref(point))
    return point.x, point.y


def pressed():
    return bool(user32.GetAsyncKeyState(0x01) & 0x8000)


def frame_size(hwnd):
    dpi = user32.GetDpiForWindow(hwnd) if hasattr(user32, "GetDpiForWindow") else 96
    getter = user32.GetSystemMetricsForDpi
    return getter(SM_CXSIZEFRAME, dpi) + getter(SM_CXPADDEDBORDER, dpi)


class Api:
    def __init__(self):
        self._window = None
        self._handle = None
        self._busy = False
        self._full = False
        self._saved = None
        self._keep = None

    def _hwnd(self):
        if self._handle is None:
            self._handle = int(self._window.native.Handle.ToInt64())
        return self._handle

    def _rect(self):
        box = wt.RECT()
        user32.GetWindowRect(self._hwnd(), ctypes.byref(box))
        return box.left, box.top, box.right, box.bottom

    def _place(self, left, top, right, bottom):
        user32.SetWindowPos(self._hwnd(), 0, left, top, right - left, bottom - top, SWP_NOZORDER | SWP_NOACTIVATE)

    def _monitor_rect(self):
        info = MonitorInfo()
        info.size = ctypes.sizeof(MonitorInfo)
        user32.GetMonitorInfoW(user32.MonitorFromWindow(self._hwnd(), 2), ctypes.byref(info))
        box = info.monitor
        return box.left, box.top, box.right, box.bottom

    def _install(self):
        try:
            from System import Action

            self._window.native.Invoke(Action(self._install_here))
        except Exception:
            self._install_here()

    def _install_here(self):
        handle = self._hwnd()

        def procedure(hwnd, message, wparam, lparam, ident, data):
            if message == WM_NCCALCSIZE and wparam:
                params = ctypes.cast(lparam, ctypes.POINTER(NcParams)).contents
                top = params.rgrc[0].top
                result = comctl.DefSubclassProc(hwnd, message, wparam, lparam)
                params.rgrc[0].top = top + (frame_size(hwnd) if user32.IsZoomed(hwnd) else 1)
                return result
            return comctl.DefSubclassProc(hwnd, message, wparam, lparam)

        self._keep = SUBCLASSPROC(procedure)
        placed = comctl.SetWindowSubclass(wt.HWND(handle), self._keep, ctypes.c_size_t(1), ctypes.c_size_t(0))
        if os.environ.get("ESSAY_BUILDER_NATIVE_LOG"):
            with open(os.environ["ESSAY_BUILDER_NATIVE_LOG"], "a") as log:
                log.write(f"subclass={placed} handle={handle}\n")
        user32.SetWindowPos(handle, 0, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED)
        try:
            from pathlib import Path

            from System.Drawing import Icon

            self._window.native.Icon = Icon(str(Path(__file__).resolve().parent / "icon.ico"))
        except Exception:
            pass

    def _allow_drag_regions(self):
        try:
            from System import Action

            def apply():
                core = self._window.native.webview.CoreWebView2
                core.Settings.IsNonClientRegionSupportEnabled = True

            self._window.native.Invoke(Action(apply))
        except Exception:
            pass

    def start_drag(self):
        handle = self._hwnd()

        def move():
            user32.ReleaseCapture()
            user32.SendMessageW(handle, 0x0112, 0xF012, 0)

        try:
            from System import Action

            self._window.native.BeginInvoke(Action(move))
        except Exception:
            move()

    def start_resize(self, edge):
        if self._busy or self._full or user32.IsZoomed(self._hwnd()):
            return
        self._busy = True
        threading.Thread(target=self._resize_loop, args=(edge,), daemon=True).start()

    def _resize_loop(self, edge):
        try:
            x0, y0 = cursor()
            left, top, right, bottom = self._rect()
            scale = user32.GetDpiForWindow(self._hwnd()) / 96 if hasattr(user32, "GetDpiForWindow") else 1.0
            floor_w, floor_h = int(MIN_WIDTH * scale), int(MIN_HEIGHT * scale)
            while pressed():
                x, y = cursor()
                dx, dy = x - x0, y - y0
                l, t, r, b = left, top, right, bottom
                if "e" in edge:
                    r = max(left + floor_w, right + dx)
                if "s" in edge:
                    b = max(top + floor_h, bottom + dy)
                if "w" in edge:
                    l = min(right - floor_w, left + dx)
                if "n" in edge:
                    t = min(bottom - floor_h, top + dy)
                self._place(l, t, r, b)
                time.sleep(0.004)
        finally:
            self._busy = False

    def minimize(self):
        user32.PostMessageW(self._hwnd(), WM_SYSCOMMAND, SC_MINIMIZE, 0)

    def maximize_toggle(self):
        handle = self._hwnd()
        if self._full:
            self.fullscreen_toggle()
            return self.state()
        zoomed = user32.IsZoomed(handle)
        user32.PostMessageW(handle, WM_SYSCOMMAND, SC_RESTORE if zoomed else SC_MAXIMIZE, 0)
        return "normal" if zoomed else "maximized"

    def fullscreen_toggle(self):
        handle = self._hwnd()
        if not self._full:
            if user32.IsZoomed(handle):
                user32.ShowWindow(handle, SW_RESTORE)
                time.sleep(0.25)
            self._saved = self._rect()
            self._place(*self._monitor_rect())
            self._full = True
        else:
            if self._saved:
                self._place(*self._saved)
            self._full = False
        return self.state()

    def state(self):
        if self._full:
            return "fullscreen"
        return "maximized" if user32.IsZoomed(self._hwnd()) else "normal"

    def close(self):
        self._window.destroy()

    def choose_save(self, name, directory="", kind="pdf"):
        folder = directory if directory and Path(directory).is_dir() else ""
        types = ("Word document (*.docx)",) if kind == "docx" else ("PDF (*.pdf)",)
        picked = self._window.create_file_dialog(webview.SAVE_DIALOG, directory=folder, save_filename=name, file_types=types)
        if not picked:
            return None
        return str(picked[0] if isinstance(picked, (list, tuple)) else picked)

    def choose_folder(self):
        picked = self._window.create_file_dialog(webview.FOLDER_DIALOG)
        if not picked:
            return None
        return str(picked[0] if isinstance(picked, (list, tuple)) else picked)


def main():
    url = sys.argv[1]
    try:
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("VNyMay.EssayBuilder")
    except Exception:
        pass
    api = Api()
    window = webview.create_window(
        "Essay Builder",
        url,
        width=1360,
        height=900,
        min_size=(MIN_WIDTH, MIN_HEIGHT),
        maximized=True,
        frameless=False,
        easy_drag=False,
        background_color="#f4f7f5",
        js_api=api,
        zoomable=True,
    )
    api._window = window
    window.events.shown += lambda: api._install()
    window.events.loaded += lambda: api._allow_drag_regions()
    webview.start(private_mode=False, storage_path=None)


if __name__ == "__main__":
    main()
