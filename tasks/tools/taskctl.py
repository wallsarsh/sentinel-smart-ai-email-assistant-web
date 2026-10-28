#!/usr/bin/env python3
"""Sentinel task tracker CLI (stdlib only).

Source of truth: one file per task in tasks/items/T###-slug.md with a small
front-matter block. This tool reads/writes those files and regenerates
tasks/INDEX.md. See tasks/README.md for the agent protocol.

Usage:
  taskctl.py validate                      # ids, deps, cycles, statuses
  taskctl.py ready [--phase P2]            # todo tasks whose deps are all done
  taskctl.py next                          # first ready task (lowest id)
  taskctl.py show T045                     # print a task file
  taskctl.py deps T045                     # transitive dependencies + their status
  taskctl.py claim T045 --owner NAME       # todo -> in_progress (only if ready)
  taskctl.py status T045 review|done|todo|blocked [--note "..."]
  taskctl.py log T045 "message"            # append a progress note
  taskctl.py index                         # regenerate tasks/INDEX.md
  taskctl.py stats
"""
from __future__ import annotations

import argparse
import datetime as dt
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
ITEMS = ROOT / "items"
INDEX = ROOT / "INDEX.md"
STATUSES = ["todo", "in_progress", "review", "done", "blocked"]
LIST_KEYS = {"deps", "paths", "refs", "reqs"}
FM_RE = re.compile(r"^---\n(.*?)\n---\n", re.S)


class Task:
    def __init__(self, path: pathlib.Path):
        self.path = path
        self.text = path.read_text(encoding="utf-8")
        m = FM_RE.match(self.text)
        if not m:
            sys.exit(f"{path.name}: missing front-matter")
        self.fm: dict[str, object] = {}
        for line in m.group(1).splitlines():
            if not line.strip():
                continue
            key, _, val = line.partition(":")
            key, val = key.strip(), val.strip()
            if key in LIST_KEYS:
                inner = val.strip("[]").strip()
                self.fm[key] = [v.strip() for v in inner.split(",") if v.strip()] if inner else []
            else:
                self.fm[key] = val.strip('"')
        self.body = self.text[m.end():]

    def __getitem__(self, k):
        return self.fm.get(k, [] if k in LIST_KEYS else "")

    @property
    def id(self) -> str:
        return str(self["id"])

    def set(self, key: str, value: str) -> None:
        self.fm[key] = value
        self._write()

    def append_log(self, msg: str) -> None:
        stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%MZ")
        if "## Log" not in self.body:
            self.body = self.body.rstrip() + "\n\n## Log\n"
        self.body = self.body.rstrip() + f"\n- {stamp} {msg}\n"
        self._write()

    def _write(self) -> None:
        order = ["id", "title", "phase", "status", "owner", "type", "size", "deps", "paths", "refs", "reqs", "updated"]
        self.fm["updated"] = dt.date.today().isoformat()
        lines = []
        for k in order + [k for k in self.fm if k not in order]:
            if k not in self.fm:
                continue
            v = self.fm[k]
            if k in LIST_KEYS:
                lines.append(f"{k}: [{', '.join(v)}]")  # type: ignore[arg-type]
            else:
                lines.append(f'{k}: "{v}"' if k in ("title", "owner") else f"{k}: {v}")
        self.text = "---\n" + "\n".join(lines) + "\n---\n" + self.body
        self.path.write_text(self.text, encoding="utf-8")


def load() -> dict[str, Task]:
    tasks = {}
    for p in sorted(ITEMS.glob("T*.md")):
        t = Task(p)
        if t.id in tasks:
            sys.exit(f"duplicate id {t.id}")
        tasks[t.id] = t
    return tasks


def is_ready(t: Task, tasks: dict[str, Task]) -> bool:
    return t["status"] == "todo" and all(tasks[d]["status"] == "done" for d in t["deps"])


def find_cycle(tasks: dict[str, Task]) -> list[str] | None:
    color: dict[str, int] = {}
    stack: list[str] = []

    def dfs(n: str) -> list[str] | None:
        color[n] = 1
        stack.append(n)
        for d in tasks[n]["deps"]:
            if color.get(d) == 1:
                return stack[stack.index(d):] + [d]
            if color.get(d) is None and (c := dfs(d)):
                return c
        stack.pop()
        color[n] = 2
        return None

    for n in tasks:
        if color.get(n) is None and (c := dfs(n)):
            return c
    return None


def cmd_validate(tasks, _a) -> int:
    errors = []
    for t in tasks.values():
        if t["status"] not in STATUSES:
            errors.append(f"{t.id}: bad status {t['status']}")
        for d in t["deps"]:
            if d not in tasks:
                errors.append(f"{t.id}: unknown dep {d}")
        if t["status"] in ("in_progress", "review", "done"):
            bad = [d for d in t["deps"] if d in tasks and tasks[d]["status"] != "done"]
            if bad:
                errors.append(f"{t.id}: is {t['status']} but deps not done: {bad}")
        if not t.path.name.startswith(t.id + "-"):
            errors.append(f"{t.path.name}: filename must start with {t.id}-")
    if not errors and (c := find_cycle(tasks)):
        errors.append("cycle: " + " -> ".join(c))
    for e in errors:
        print("ERROR", e)
    print("OK" if not errors else f"{len(errors)} error(s)")
    return 1 if errors else 0


def cmd_ready(tasks, a) -> int:
    for t in tasks.values():
        if is_ready(t, tasks) and (not a.phase or t["phase"] == a.phase):
            print(f"{t.id}  [{t['phase']}|{t['size']}|{t['type']}]  {t['title']}")
    return 0


def cmd_next(tasks, _a) -> int:
    for t in tasks.values():
        if is_ready(t, tasks):
            print(t.id)
            return 0
    print("none")
    return 1


def need(tasks, tid) -> Task:
    if tid not in tasks:
        sys.exit(f"unknown task {tid}")
    return tasks[tid]


def cmd_show(tasks, a) -> int:
    print(need(tasks, a.id).text)
    return 0


def cmd_deps(tasks, a) -> int:
    seen: list[str] = []

    def walk(n):
        for d in tasks[n]["deps"]:
            if d not in seen:
                seen.append(d)
                walk(d)

    walk(need(tasks, a.id).id)
    for d in sorted(seen):
        print(f"{d}  {tasks[d]['status']:<11} {tasks[d]['title']}")
    return 0


def cmd_claim(tasks, a) -> int:
    t = need(tasks, a.id)
    if not is_ready(t, tasks):
        open_deps = [d for d in t["deps"] if tasks[d]["status"] != "done"]
        sys.exit(f"{t.id} not claimable: status={t['status']} open deps={open_deps}")
    t.set("owner", a.owner)
    t.set("status", "in_progress")
    t.append_log(f"claimed by {a.owner}")
    print(f"claimed {t.id}")
    return 0


def cmd_status(tasks, a) -> int:
    t = need(tasks, a.id)
    if a.status in ("in_progress", "review", "done"):
        open_deps = [d for d in t["deps"] if tasks[d]["status"] != "done"]
        if open_deps:
            sys.exit(f"cannot set {a.status}: deps not done {open_deps}")
    if a.status == "done" and "- [ ]" in t.body.split("## Log")[0]:
        if not a.force:
            sys.exit("unchecked acceptance criteria remain; tick them or pass --force with a --note")
    if a.status == "blocked" and not a.note:
        sys.exit("--note is required when blocking")
    t.set("status", a.status)
    if a.status == "todo":
        t.set("owner", "")
    t.append_log(f"status -> {a.status}" + (f": {a.note}" if a.note else ""))
    print(f"{t.id} -> {a.status}")
    return 0


def cmd_log(tasks, a) -> int:
    need(tasks, a.id).append_log(a.message)
    return 0


def cmd_stats(tasks, _a) -> int:
    by: dict[str, dict[str, int]] = {}
    for t in tasks.values():
        by.setdefault(t["phase"], {s: 0 for s in STATUSES})[t["status"]] += 1
    for ph in sorted(by):
        c = by[ph]
        tot = sum(c.values())
        print(f"{ph}: {c['done']}/{tot} done, {c['in_progress']} in progress, {c['review']} review, {c['blocked']} blocked")
    return 0


ICON = {"todo": "⬜", "in_progress": "🔄", "review": "👀", "done": "✅", "blocked": "⛔"}
CLASS = {"todo": "todo", "in_progress": "prog", "review": "rev", "done": "done", "blocked": "blk"}


def cmd_index(tasks, _a) -> int:
    phases: dict[str, list[Task]] = {}
    for t in tasks.values():
        phases.setdefault(t["phase"], []).append(t)
    total = len(tasks)
    done = sum(t["status"] == "done" for t in tasks.values())
    out = [
        "# Task Index (generated — do not edit by hand)",
        "",
        "Regenerate with `python3 tasks/tools/taskctl.py index`. Source of truth: `tasks/items/*.md`.",
        "",
        f"**Progress:** {done}/{total} done · ready now: "
        + (", ".join(t.id for t in tasks.values() if is_ready(t, tasks)) or "none"),
        "",
        "Legend: ⬜ todo · 🔄 in progress · 👀 review · ✅ done · ⛔ blocked",
        "",
        "## Dependency graph",
        "",
        "```mermaid",
        "flowchart LR",
        "  classDef done fill:#c8e6c9,stroke:#2e7d32",
        "  classDef prog fill:#fff3c4,stroke:#f9a825",
        "  classDef rev fill:#e1f5fe,stroke:#0277bd",
        "  classDef blk fill:#ffcdd2,stroke:#c62828",
        "  classDef todo fill:#eeeeee,stroke:#9e9e9e",
    ]
    for ph in sorted(phases):
        out.append(f"  subgraph {ph}")
        for t in phases[ph]:
            out.append(f'    {t.id}["{t.id}"]:::{CLASS.get(t["status"], "todo")}')
        out.append("  end")
    for t in tasks.values():
        for d in t["deps"]:
            out.append(f"  {d} --> {t.id}")
    out += ["```", ""]
    for ph in sorted(phases):
        out += [f"## {ph}", "", "| | ID | Task | Size | Type | Depends on | Owner |", "|---|---|---|---|---|---|---|"]
        for t in phases[ph]:
            rel = t.path.relative_to(ROOT).as_posix()
            out.append(
                f"| {ICON.get(t['status'], '?')} | [{t.id}]({rel}) | {t['title']} | {t['size']} | {t['type']} | "
                f"{', '.join(t['deps']) or '—'} | {t['owner'] or ''} |"
            )
        out.append("")
    INDEX.write_text("\n".join(out), encoding="utf-8")
    print(f"wrote {INDEX.relative_to(ROOT.parent)}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    sp.add_parser("validate")
    r = sp.add_parser("ready")
    r.add_argument("--phase")
    sp.add_parser("next")
    for name in ("show", "deps"):
        sp.add_parser(name).add_argument("id")
    c = sp.add_parser("claim")
    c.add_argument("id")
    c.add_argument("--owner", required=True)
    s = sp.add_parser("status")
    s.add_argument("id")
    s.add_argument("status", choices=STATUSES)
    s.add_argument("--note")
    s.add_argument("--force", action="store_true")
    lg = sp.add_parser("log")
    lg.add_argument("id")
    lg.add_argument("message")
    sp.add_parser("index")
    sp.add_parser("stats")
    a = ap.parse_args()
    tasks = load()
    return globals()[f"cmd_{a.cmd}"](tasks, a)


if __name__ == "__main__":
    sys.exit(main())
