"""Build the normalized dataset (drugs, targets, trials) from either source.

Both sources return the same shape, so every later step is source-agnostic:
    {"drugs": {id: {...}}, "targets": {symbol: {...}}, "trials": [...], "source": str, "versions": {...}}
"""
import json
from datetime import date

from .config import SEED_FILE
from .enrich import enrich_chembl, enrich_fda, slug


def from_live(max_pages: int = 20) -> dict:
    from .extract import fetch_trials

    trials = fetch_trials(max_pages)
    names = sorted({n for t in trials for n in t["drugNames"]})
    targets: dict = {}
    by_name = enrich_chembl(names, targets)

    drugs: dict[str, dict] = {}
    for rec in by_name.values():
        drugs.setdefault(rec["id"], rec)       # several names can resolve to one molecule
    enrich_fda(drugs)

    for t in trials:
        t["drugs"] = sorted({by_name[n]["id"] for n in t.pop("drugNames")})
    for sym, tgt in targets.items():
        tgt.setdefault("name", tgt["label"])
        tgt["label"] = sym
    return {
        "drugs": drugs, "targets": targets, "trials": trials, "source": "live",
        "versions": {"ClinicalTrials.gov": "API v2", "ChEMBL": "REST API", "openFDA": "drugsfda + event",
                     "fetched": date.today().isoformat()},
    }


def from_sample() -> dict:
    seed = json.loads(SEED_FILE.read_text())
    targets = {sym: {"label": short, "name": full} for sym, (short, full) in seed["targets"].items()}
    drugs, trials = {}, []
    for d in seed["drugs"]:
        did = f"drug:{slug(d['name'])}"
        fda = d.get("fda")
        drugs[did] = {
            "id": did, "name": d["name"], "moa": d["moa"], "targets": d["targets"],
            "fda": {
                "status": "approved", "brand": fda["brand"], "approved": fda["approved"],
                "actions": ([{"date": fda["approved"], "label": "Original approval"}] if fda["approved"] else [])
                + [{"date": dt, "label": lbl} for dt, lbl in fda.get("actions", [])],
            } if fda else {"status": "investigational", "brand": None, "approved": None, "actions": []},
            "faers": [{"term": t, "count": None} for t in d.get("ae", [])],
        }
        for cond, phase, year in d["trials"]:
            trials.append({
                "nct": f"SAMPLE-{len(trials) + 1:04d}", "title": f"{d['name']} in {cond} (synthetic sample row)",
                "phase": str(phase), "start": year, "sponsor": d["sponsor"],
                "conditions": [cond], "drugs": [did],
            })
    return {"drugs": drugs, "targets": targets, "trials": trials, "source": "sample",
            "versions": {"dataset": "pipeline/seed/sample.json (curated, synthetic trials)"}}
