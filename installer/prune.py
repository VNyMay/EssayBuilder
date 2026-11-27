import json
import shutil
import sys
from pathlib import Path

KEEP_ONLY = {"mermaid": ["dist/mermaid.min.js", "package.json", "LICENSE"]}
BUNDLED = {"mermaid"}


def folder_size(path):
    return sum(file.stat().st_size for file in path.rglob("*") if file.is_file())


def main():
    engine = Path(sys.argv[1])
    modules = engine / "node_modules"
    before = folder_size(modules)
    packages = json.loads((engine / "package-lock.json").read_text(encoding="utf-8"))["packages"]

    def needs(key):
        info = packages.get(key, {})
        names = {**info.get("dependencies", {}), **info.get("optionalDependencies", {}), **info.get("peerDependencies", {})}
        out = []
        for name in names:
            nested = f"{key}/node_modules/{name}"
            out.append(nested if nested in packages else f"node_modules/{name}")
        return out

    roots = [f"node_modules/{name}" for name in packages[""].get("dependencies", {})]
    keep = set()
    stack = [key for key in roots if key.split("/", 1)[1] not in BUNDLED]
    while stack:
        key = stack.pop()
        if key in keep or key not in packages:
            continue
        keep.add(key)
        stack.extend(needs(key))
    keep |= {f"node_modules/{name}" for name in BUNDLED}
    for key in sorted((key for key in packages if key and key not in keep), key=len, reverse=True):
        shutil.rmtree(engine / key, ignore_errors=True)
    for name, wanted in KEEP_ONLY.items():
        base = modules / name
        for file in sorted(base.rglob("*"), key=lambda item: len(item.parts), reverse=True):
            relative = file.relative_to(base).as_posix()
            if file.is_file() and relative not in wanted:
                file.unlink()
            elif file.is_dir() and not any(file.iterdir()):
                file.rmdir()
    for pattern in ("*.map", "*.d.ts", "*.d.mts", "*.d.cts", "*.md", "*.markdown", "*.ts.map"):
        for file in modules.rglob(pattern):
            if file.is_file() and file.name.lower() not in {"license.md", "licence.md"}:
                file.unlink()
    for folder in [item for item in modules.rglob("*") if item.is_dir() and item.name in {"test", "tests", "__tests__", "docs", "example", "examples", ".github"}]:
        shutil.rmtree(folder, ignore_errors=True)
    after = folder_size(modules)
    print(f"node_modules {before / 1e6:.0f} MB -> {after / 1e6:.0f} MB")


if __name__ == "__main__":
    main()
