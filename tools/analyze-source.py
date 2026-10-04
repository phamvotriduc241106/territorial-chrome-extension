#!/usr/bin/env python3
"""Validate a Territorial.io HTML dump against the engine adapter contract."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path


FUNCTIONS = ("cE", "cL", "cQ", "cR", "cd", "ce", "cl", "co", "d3", "dD", "dJ", "dF", "dU")


def extract_function(source: str, name: str) -> tuple[str | None, int | None]:
    match = re.search(rf"\bfunction\s+{re.escape(name)}\s*\(", source)
    if not match:
        return None, None
    opening = source.find("{", match.end())
    if opening < 0:
        return None, None
    depth = 0
    quote: str | None = None
    escaped = False
    line_comment = False
    block_comment = False
    i = opening
    while i < len(source):
        char = source[i]
        nxt = source[i + 1] if i + 1 < len(source) else ""
        if line_comment:
            if char == "\n":
                line_comment = False
        elif block_comment:
            if char == "*" and nxt == "/":
                block_comment = False
                i += 1
        elif quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
        elif char == "/" and nxt == "/":
            line_comment = True
            i += 1
        elif char == "/" and nxt == "*":
            block_comment = True
            i += 1
        elif char in ("'", '"', "`"):
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return source[match.start(): i + 1], source.count("\n", 0, match.start()) + 1
        i += 1
    return None, None


def compact(text: str | None) -> str:
    return re.sub(r"\s+", "", text or "")


def analyze(path: Path) -> dict:
    source = path.read_text(encoding="utf-8", errors="replace")
    bodies: dict[str, str | None] = {}
    lines: dict[str, int | None] = {}
    for name in FUNCTIONS:
        bodies[name], lines[name] = extract_function(source, name)

    ce = compact(bodies["cE"])
    dj = compact(bodies["dJ"])
    df = compact(bodies["dF"])
    dd = compact(bodies["dD"])
    d3 = compact(bodies["d3"])
    du = compact(bodies["dU"])

    checks = {
        "html_shell": "<canvas id=\"canvasA\"" in source and "<title>Territorial.io</title>" in source,
        "single_inline_iife": source.count("<script") == 1 and "(function()" in compact(source[:20000]),
        "attack_tax": all(token in ce for token in ("al(3*aq[g],256)", "aq[g]-=l+u", "aX.cJ(g,l,k)")),
        "crush_rule": all(token in dj for token in ("al(aq[g],8)>aq[y]", "al(11*aq[y],5)", "cL(g,y)", "cE(g,y,l,k)")),
        "empty_expansion": all(token in df for token in ("cQ(g)", "cE(g,y,l,k)", "y=b1")),
        "decision_priority": all(token in dd for token in ("ce()?dF", "cl(g)", "co(g)", "dJ")),
        "reserve_dump": all(token in d3 for token in ("60>k", "aq[g]>y", "k=aq[g]-y")),
        "difficulty_tables": all(token in du for token in ("VeryEasy;Easy;Normal;Hard;Harder;VeryHard", "this.dI=[0,0,0,0,50,90]")),
        "difficulty_tick": all(token in du for token in ("g[A]=al(u[A],10)", "d3(z,al(k[A]*aq[z],1E3))")),
        "economy_soft_cap": "A=100*bN[A]" in compact(source) and "returnA>il?il:A" in compact(source),
    }
    found = {name: {"found": bodies[name] is not None, "line": lines[name]} for name in FUNCTIONS}
    passed = sum(checks.values())
    marker = source.rfind("})();")
    tail_distance = len(source) - marker if marker >= 0 else None

    return {
        "path": str(path),
        "sha256": hashlib.sha256(source.encode("utf-8")).hexdigest(),
        "bytes": len(source.encode("utf-8")),
        "lines": source.count("\n") + 1,
        "classification": "readable-legacy-engine" if passed >= 8 else "unknown-or-changed",
        "compatibility_score": round(100 * passed / len(checks)),
        "checks": checks,
        "functions": found,
        "patch_tail_distance": tail_distance,
        "warnings": [
            "The engine is closure-scoped inside an inline parser-executed IIFE.",
            "A MutationObserver cannot guarantee rewriting that script before parser execution.",
            "Treat live symbol names as versioned capabilities, not stable API names.",
        ],
    }


def render_markdown(result: dict) -> str:
    rows = [
        "# Territorial.io source-contract analysis",
        "",
        f"- Classification: `{result['classification']}`",
        f"- Compatibility: **{result['compatibility_score']}%**",
        f"- Size: {result['bytes']:,} bytes / {result['lines']:,} lines",
        f"- SHA-256: `{result['sha256']}`",
        "",
        "| Contract | Result |",
        "|---|---:|",
    ]
    rows.extend(f"| `{name}` | {'PASS' if passed else 'FAIL'} |" for name, passed in result["checks"].items())
    rows.extend(("", "## Stable function map", "", "| Symbol | Found | Line |", "|---|---:|---:|"))
    rows.extend(
        f"| `{name}` | {'yes' if data['found'] else 'no'} | {data['line'] or '—'} |"
        for name, data in result["functions"].items()
    )
    rows.extend(("", "## Integration warnings", ""))
    rows.extend(f"- {warning}" for warning in result["warnings"])
    return "\n".join(rows)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    result = analyze(args.source.expanduser().resolve())
    print(json.dumps(result, indent=2) if args.json else render_markdown(result))
    return 0 if result["compatibility_score"] >= 80 else 1


if __name__ == "__main__":
    raise SystemExit(main())
