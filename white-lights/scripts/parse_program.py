#!/usr/bin/env python3
"""Regenerate the embedded program from a re-exported training sheet.

The app stores REFERENCE loads at the authoring training maxes
(Squat 220 / Bench 145 / Deadlift 270) and rescales competition-lift loads
live to the user's current TMs. This script reads a workbook and emits
`public/program.json` in the same shape as `src/data/program.ts`'s `PROGRAM`.

Usage:
    pip install openpyxl
    python scripts/parse_program.py path/to/program.xlsx

Because sheet layouts drift, the column mapping lives in COLS below — adjust
it to match the exported tab, then re-run. The output is validated to be a
2.5 kg multiple for every competition-lift load.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    from openpyxl import load_workbook
except ImportError:  # pragma: no cover
    sys.exit("openpyxl is required: pip install openpyxl")

# --- sheet layout: 1-based row of the header, and column letters/indices ---
SHEET_NAME = "Program"           # tab to read
HEADER_ROW = 1
COLS = {
    "week": "A",     # integer week number
    "dow": "B",      # Mon / Wed / Fri
    "focus": "C",    # session focus text
    "exercise": "D", # exercise name (e.g. "Competition squat")
    "rx": "E",       # prescription text (e.g. "4x5", "Top single @8")
    "load": "F",     # reference load in kg (blank for accessories)
    "sets": "G",
    "reps": "H",
    "rpe": "I",      # optional
    "note": "J",     # optional (e.g. "Strict pause", "Optional")
}

ROUND = 2.5


def cell(ws, col: str, row: int):
    return ws[f"{col}{row}"].value


def num(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(f"usage: {sys.argv[0]} <workbook.xlsx>")
    src = Path(sys.argv[1])
    wb = load_workbook(src, data_only=True)
    ws = wb[SHEET_NAME] if SHEET_NAME in wb.sheetnames else wb.active

    days: dict[str, dict] = {}
    day_order: list[str] = []
    day_nums: dict[int, int] = {}

    for row in range(HEADER_ROW + 1, ws.max_row + 1):
        ex = cell(ws, COLS["exercise"], row)
        if not ex:
            continue
        week = num(cell(ws, COLS["week"], row))
        dow = cell(ws, COLS["dow"], row)
        if week is None or not dow:
            continue
        week = int(week)
        day_nums.setdefault(week, 0)
        # a new focus/dow starts a new day
        focus = cell(ws, COLS["focus"], row) or ""
        key = f"W{week}{dow}"
        if key not in days:
            day_nums[week] += 1
            days[key] = {
                "key": f"W{week}D{day_nums[week]}",
                "week": week,
                "dow": str(dow),
                "dayNum": day_nums[week],
                "focus": str(focus),
                "items": [],
            }
            day_order.append(key)

        item = {"ex": str(ex).strip(), "rx": str(cell(ws, COLS["rx"], row) or "").strip()}
        load = num(cell(ws, COLS["load"], row))
        if load is not None:
            if abs(round(load / ROUND) * ROUND - load) > 1e-6:
                print(f"warn: load {load} on row {row} is not a {ROUND} multiple", file=sys.stderr)
            item["load"] = load
        for k in ("sets", "reps"):
            v = num(cell(ws, COLS[k], row))
            if v is not None:
                item[k] = int(v)
        rpe = num(cell(ws, COLS["rpe"], row))
        if rpe is not None:
            item["rpe"] = rpe
        note = cell(ws, COLS["note"], row)
        if note:
            item["note"] = str(note).strip()
        days[key]["items"].append(item)

    program = {
        "name": "8-Week Powerlifting",
        "days": [days[k] for k in day_order],
    }
    out = Path(__file__).resolve().parent.parent / "public" / "program.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(program, indent=2))
    print(f"wrote {out} — {len(program['days'])} days")


if __name__ == "__main__":
    main()
