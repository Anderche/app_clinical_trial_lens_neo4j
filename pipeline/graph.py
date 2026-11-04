"""Assemble the drug–target–condition graph from the normalized dataset."""
from collections import Counter, defaultdict

from .config import CONDITIONS


def build_graph(ds: dict) -> tuple[dict[str, dict], list[dict]]:
    """Return (nodes by id, links). Drug→Condition edges are derived from trials."""
    nodes: dict[str, dict] = {}
    links: list[dict] = []

    trials_by_drug = defaultdict(list)
    for t in ds["trials"]:
        for did in t["drugs"]:
            trials_by_drug[did].append(t)

    for key, cond in CONDITIONS.items():
        nodes[f"cond:{key}"] = {"id": f"cond:{key}", "type": "condition", "label": cond["label"],
                                  "area": cond["area"], "areas": [cond["area"]]}

    for did, drug in ds["drugs"].items():
        trials = trials_by_drug.get(did)
        if not trials:
            continue
        area_counts = Counter(CONDITIONS[c]["area"] for t in trials for c in t["conditions"])
        areas = sorted(area_counts)
        top_phase = max(int(t["phase"]) for t in trials)
        approved = (drug.get("fda") or {}).get("status") == "approved"
        sponsors = Counter(t["sponsor"] for t in trials)
        nodes[did] = {
            "id": did, "type": "drug", "label": drug["name"],
            "area": area_counts.most_common(1)[0][0], "areas": areas,
            "maxPhase": "approved" if approved else f"phase{max(top_phase, 1)}",
            "sponsors": [s for s, _ in sponsors.most_common(5)],
            "firstStart": min(t["start"] for t in trials),
            "years": sorted({t["start"] for t in trials}),
            "trialCount": len(trials),
        }
        for sym in drug["targets"]:
            tid = f"tgt:{sym}"
            if tid not in nodes:
                tgt = ds["targets"].get(sym, {"label": sym, "name": sym})
                nodes[tid] = {"id": tid, "type": "target", "label": tgt["label"], "name": tgt["name"],
                             "areas": [], "_areaVotes": Counter()}
            links.append({"source": did, "target": tid, "type": "TARGETS"})
        per_cond = Counter(c for t in trials for c in t["conditions"])
        for cond, n in sorted(per_cond.items()):
            links.append({"source": did, "target": f"cond:{cond}", "type": "TESTED_IN", "trials": n})

    # Targets inherit the areas of the drugs that hit them.
    for link in links:
        if link["type"] == "TARGETS":
            tgt = nodes[link["target"]]
            tgt["areas"] = sorted(set(tgt["areas"]) | set(nodes[link["source"]]["areas"]))
            tgt["_areaVotes"][nodes[link["source"]]["area"]] += 1
    for n in nodes.values():
        if n["type"] == "target":
            n["area"] = n.pop("_areaVotes").most_common(1)[0][0]

    # Drop condition nodes nobody tests (keeps the picture honest for small runs).
    used = {l["target"] for l in links}
    nodes = {k: v for k, v in nodes.items() if v["type"] != "condition" or k in used}
    return nodes, links


def trials_by_node(ds: dict, nodes: dict, links: list[dict]) -> dict[str, list[dict]]:
    """Trial rows for each drug and condition node (targets get their drugs' trials)."""
    out = defaultdict(list)
    for t in ds["trials"]:
        row = {"nct": t["nct"], "title": t["title"], "phase": t["phase"], "start": t["start"],
               "sponsor": t["sponsor"], "conditions": [CONDITIONS[c]["label"] for c in t["conditions"]],
               "drugs": [ds["drugs"][d]["name"] for d in t["drugs"]]}
        for did in t["drugs"]:
            if did in nodes:
                out[did].append(row)
        for c in t["conditions"]:
            out[f"cond:{c}"].append(row)
    for link in links:
        if link["type"] == "TARGETS":
            seen = {r["nct"] for r in out[link["target"]]}
            out[link["target"]].extend(r for r in out[link["source"]] if r["nct"] not in seen)
    for rows in out.values():
        rows.sort(key=lambda r: (-r["start"], r["nct"]))
    return out
