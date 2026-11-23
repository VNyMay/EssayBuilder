import importlib
import pkgutil
from pathlib import Path

FIGURE_KEYS = {"caption", "id", "source", "width", "align", "wrap"}
KITS = []
KIT_DIRECTIVES = set()
KIT_PIP = []
KIT_ERRORS = []

for module in sorted(pkgutil.iter_modules([str(Path(__file__).parent)]), key=lambda item: item.name):
    try:
        loaded = importlib.import_module(f"{__name__}.{module.name}")
    except Exception as error:
        KIT_ERRORS.append(f"{module.name}: {type(error).__name__}: {error}")
        continue
    kit = getattr(loaded, "Kit", None)
    if kit is not None:
        KITS.append(kit)
        KIT_DIRECTIVES |= set(getattr(kit, "DIRS", ()))
        KIT_PIP.extend(getattr(kit, "PIP", ()))
