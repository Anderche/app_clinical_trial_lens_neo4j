"""Steps 2-3 — Enrich drugs with ChEMBL mechanisms and openFDA regulatory data."""
import csv
from pathlib import Path

from .config import FAERS_TOP
from .http_cache import get_json

CHEMBL = "https://www.ebi.ac.uk/chembl/api/data"
OPENFDA = "https://api.fda.gov/drug"
ALIASES_FILE = Path(__file__).parent / "seed" / "aliases.csv"


def load_aliases() -> dict[str, str]:
    """Manual name -> INN aliases for investigational codes ChEMBL misses."""
    if not ALIASES_FILE.exists():
        return {}
    with ALIASES_FILE.open() as f:
        return {row["name"].lower(): row["inn"].lower() for row in csv.DictReader(f)}


# --- ChEMBL -----------------------------------------------------------------

def match_molecule(name: str) -> dict | None:
    """Exact preferred name first, then synonym."""
    for field in ("pref_name__iexact", "molecule_synonyms__molecule_synonym__iexact"):
        data = get_json(f"{CHEMBL}/molecule.json", {field: name, "limit": 1})
        mols = (data or {}).get("molecules", [])
        if mols:
            return mols[0]
    return None


def mechanisms(chembl_id: str) -> list[dict]:
    data = get_json(f"{CHEMBL}/mechanism.json", {"molecule_chembl_id": chembl_id, "limit": 20})
    return (data or {}).get("mechanisms", [])


def target_symbol(target_id: str) -> tuple[str, str]:
    """Return (gene symbol or ChEMBL target id, preferred target name)."""
    data = get_json(f"{CHEMBL}/target/{target_id}.json") or {}
    for comp in data.get("target_components", []):
        for syn in comp.get("target_component_synonyms", []):
            if syn.get("syn_type") == "GENE_SYMBOL":
                return syn["component_synonym"].upper(), data.get("pref_name", target_id)
    return target_id, data.get("pref_name", target_id)


def enrich_chembl(names: list[str], targets: dict) -> dict[str, dict]:
    """Map drug names to drug records. Unmatched drugs keep a `drug:` id and no targets."""
    aliases = load_aliases()
    drugs = {}
    matched = 0
    for name in names:
        mol = match_molecule(aliases.get(name, name))
        if not mol:
            drugs[name] = {"id": f"drug:{slug(name)}", "name": name, "moa": None, "targets": []}
            continue
        matched += 1
        parent = (mol.get("molecule_hierarchy") or {}).get("parent_chembl_id") or mol["molecule_chembl_id"]
        tgts, moas = [], []
        for mech in mechanisms(parent):
            if not mech.get("target_chembl_id"):
                continue
            sym, label = target_symbol(mech["target_chembl_id"])
            targets.setdefault(sym, {"label": label})
            if sym not in tgts:
                tgts.append(sym)
            if mech.get("mechanism_of_action") and mech["mechanism_of_action"] not in moas:
                moas.append(mech["mechanism_of_action"])
        drugs[name] = {
            "id": f"chembl:{parent}",
            "name": (mol.get("pref_name") or name).lower(),
            "moa": "; ".join(moas) or None,
            "targets": tgts,
        }
    print(f"  chembl: matched {matched}/{len(names)} intervention names")
    return drugs


# --- openFDA ----------------------------------------------------------------

def fda_status(name: str) -> dict:
    """Approval status, first approval date, and approval actions (original + new indications)."""
    data = get_json(f"{OPENFDA}/drugsfda.json", {"search": f'openfda.generic_name:"{name}"', "limit": 20})
    brand, actions = None, []
    for app in (data or {}).get("results", []):
        for prod in app.get("products", []):
            brand = brand or prod.get("brand_name")
        for sub in app.get("submissions", []):
            if sub.get("submission_status") != "AP":
                continue
            kind = sub.get("submission_type")
            if kind == "ORIG" or (kind == "SUPPL" and sub.get("submission_class_code") == "EFFICACY"):
                d = sub.get("submission_status_date", "")
                label = "Original approval" if kind == "ORIG" else "New indication"
                actions.append({"date": f"{d[:4]}-{d[4:6]}-{d[6:8]}", "label": label})
    actions.sort(key=lambda a: a["date"])
    originals = [a["date"] for a in actions if a["label"] == "Original approval"]
    return {
        "status": "approved" if originals else "investigational",
        "brand": brand.title() if brand else None,
        "approved": originals[0] if originals else None,
        "actions": actions,
    }


def faers_top(name: str) -> list[dict]:
    """Top reaction terms by FAERS report count (raw counts, not PRR)."""
    data = get_json(f"{OPENFDA}/event.json", {
        "search": f'patient.drug.openfda.generic_name:"{name}"',
        "count": "patient.reaction.reactionmeddrapt.exact",
        "limit": FAERS_TOP,
    })
    return [{"term": r["term"].capitalize(), "count": r["count"]} for r in (data or {}).get("results", [])]


def enrich_fda(drugs: dict[str, dict]) -> None:
    for d in drugs.values():
        if d["id"].startswith("chembl:"):
            d["fda"] = fda_status(d["name"])
            d["faers"] = faers_top(d["name"]) if d["fda"]["status"] == "approved" else []
        else:
            d["fda"], d["faers"] = None, []


def slug(s: str) -> str:
    return "".join(c if c.isalnum() else "-" for c in s.lower()).strip("-")
