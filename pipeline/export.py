"""Steps 6-7 — flag bridges, pick the node set, and write the static JSON contract."""
import json
import shutil
from collections import Counter
from datetime import date

import jsonschema

from . import cypher
from .config import AREAS, COMMUNITY_LABELS, MAX_NODES, OUT_DIR, SCHEMA_FILE, TIMELINE_DRUGS, YEARS
from .graph import trials_by_node

DETAIL_TRIALS = 40   # keeps each details file well under the 15 KB budget


def file_id(node_id: str) -> str:
    return node_id.replace(":", "_")


def select_nodes(nodes: dict, scores: dict) -> set[str]:
    """All targets and conditions, then drugs by PageRank until MAX_NODES."""
    keep = {n for n, v in nodes.items() if v["type"] != "drug"}
    drugs = sorted((n for n, v in nodes.items() if v["type"] == "drug"), key=lambda n: -scores[n]["pagerank"])
    keep.update(drugs[: max(MAX_NODES - len(keep), 0)])
    return keep


def label_communities(nodes: dict, scores: dict) -> tuple[dict[int, int], list[dict]]:
    """Renumber Louvain ids by size, name each community, and give it an area hue + tint."""
    sizes = Counter(s["community"] for s in scores.values())
    remap = {old: new for new, (old, _) in enumerate(sizes.most_common())}
    communities, used, tints = [], set(), Counter()
    for old, new in remap.items():
        members = [n for n, s in scores.items() if s["community"] == old]
        targets = sorted((n for n in members if nodes[n]["type"] == "target"), key=lambda n: -scores[n]["pagerank"])
        top_syms = [t.split(":", 1)[1] for t in targets[:2]]
        label = next((COMMUNITY_LABELS[s] for s in top_syms if s in COMMUNITY_LABELS), None)
        if not label or label in used:
            label = " · ".join(nodes[t]["label"] for t in targets[:2]) or nodes[members[0]]["label"]
        used.add(label)
        area = Counter(nodes[n]["area"] for n in members).most_common(1)[0][0]
        communities.append({"id": new, "label": label, "size": len(members), "area": area, "tint": tints[area],
                            "topTargets": [nodes[t]["label"] for t in targets[:3]]})
        tints[area] += 1
    return remap, communities


def export(ds: dict, nodes: dict, links: list[dict], scores: dict, similar: dict,
           positions: dict, engine: str) -> dict:
    remap, communities = label_communities(nodes, scores)
    keep = select_nodes(nodes, scores)
    comm_of = {n: remap[s["community"]] for n, s in scores.items()}

    out_nodes = []
    for nid in sorted(keep, key=lambda n: -scores[n]["pagerank"]):
        n = {k: v for k, v in nodes[nid].items() if not k.startswith("_")}
        n.update(community=comm_of[nid], pagerank=round(scores[nid]["pagerank"], 5),
                 x=positions[nid][0], y=positions[nid][1])
        if n["type"] == "drug":
            n["bridge"] = len(n["areas"]) >= 2
        out_nodes.append(n)

    out_links = []
    for l in links:
        if l["source"] in keep and l["target"] in keep:
            out_links.append({**l, "bridge": comm_of[l["source"]] != comm_of[l["target"]]})

    graph = {"nodes": out_nodes, "links": out_links, "communities": communities}
    jsonschema.validate(graph, json.loads(SCHEMA_FILE.read_text()))

    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    (OUT_DIR / "details").mkdir(parents=True)
    write = lambda name, obj: (OUT_DIR / name).write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False))  # noqa: E731

    write("graph.json", graph)
    write("cypher.json", cypher.LENS)

    # Drawer details for every node, including drugs that did not make the cap.
    rows = trials_by_node(ds, nodes, links)
    neighbors: dict[str, list] = {n: [] for n in nodes}
    for l in links:
        neighbors[l["source"]].append({"id": l["target"], "rel": l["type"]})
        neighbors[l["target"]].append({"id": l["source"], "rel": l["type"]})
    for nid, node in nodes.items():
        drug = ds["drugs"].get(nid, {})
        detail = {
            "id": nid, "type": node["type"], "label": node["label"], "name": node.get("name"),
            "area": node["area"], "areas": node["areas"], "community": comm_of[nid],
            "pagerank": round(scores[nid]["pagerank"], 5), "inGraph": nid in keep,
            "moa": drug.get("moa"), "fda": drug.get("fda"), "faers": drug.get("faers", []),
            "trialCount": len(rows.get(nid, [])), "trials": rows.get(nid, [])[:DETAIL_TRIALS],
            "similar": [{"id": s, "label": nodes[s]["label"], "score": sc} for s, sc in similar.get(nid, [])],
            "neighbors": [{**nb, "label": nodes[nb["id"]]["label"], "type": nodes[nb["id"]]["type"]}
                          for nb in neighbors[nid]],
        }
        if node["type"] == "drug":
            detail["x"], detail["y"] = positions[nid]
        write(f"details/{file_id(nid)}.json", detail)

    search = [{"id": n["id"], "label": n["label"], "type": n["type"], "area": n["area"],
               "alt": " ".join(filter(None, [n.get("name"), (ds["drugs"].get(n["id"], {}).get("fda") or {}).get("brand")])),
               "inGraph": n["id"] in keep} for n in nodes.values()]
    write("search-index.json", search)
    write("timeline.json", timeline(ds, nodes))

    meta = {
        "buildDate": date.today().isoformat(), "source": ds["source"], "engine": engine,
        "versions": ds["versions"], "years": list(YEARS), "areas": AREAS,
        "counts": {"trials": len(ds["trials"]), "drugs": sum(n["type"] == "drug" for n in nodes.values()),
                   "targets": sum(n["type"] == "target" for n in nodes.values()),
                   "conditions": sum(n["type"] == "condition" for n in nodes.values()),
                   "graphNodes": len(out_nodes), "graphLinks": len(out_links),
                   "bridges": sum(1 for n in out_nodes if n.get("bridge"))},
    }
    write("meta.json", meta)
    return meta


def timeline(ds: dict, nodes: dict) -> list[dict]:
    """Trial-start-to-FDA-action lanes for 4-6 headline drugs."""
    by_name = {d["name"]: d for d in ds["drugs"].values()}
    lanes = []
    for name in TIMELINE_DRUGS:
        d = by_name.get(name)
        if not d or d["id"] not in nodes:
            continue
        years = [t["start"] for t in ds["trials"] if d["id"] in t["drugs"]]
        actions = [a for a in (d.get("fda") or {}).get("actions", []) if a["date"][:4] >= str(YEARS[0])]
        lanes.append({"id": d["id"], "label": name, "area": nodes[d["id"]]["area"],
                      "start": min(years), "end": YEARS[1], "trialCount": len(years), "actions": actions,
                      "brand": (d.get("fda") or {}).get("brand")})
    return lanes[:6]
