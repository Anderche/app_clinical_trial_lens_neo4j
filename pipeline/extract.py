"""Step 1 — Extract trials from the ClinicalTrials.gov v2 API.

The spec names the AACT flat-file snapshot; the v2 API reads the same registry
without a ~2 GB download, which suits a laptop build. Only interventional
drug/biologic trials starting on or after START_DATE are kept.
"""
import re

from .config import AREA_QUERIES, CONDITIONS, DRUG_STOPWORDS, START_DATE
from .http_cache import get_json

API = "https://clinicaltrials.gov/api/v2/studies"
FIELDS = ",".join([
    "NCTId", "BriefTitle", "Phase", "StartDate", "LeadSponsorName",
    "Condition", "ConditionMeshTerm", "InterventionType", "InterventionName",
])


def map_condition(terms: list[str]) -> list[str]:
    """Map free-text condition / MeSH terms to canonical condition keys."""
    found = []
    for term in terms:
        t = term.lower()
        for key, cond in CONDITIONS.items():
            if key not in found and any(m in t for m in cond["match"]):
                found.append(key)
    return found


def clean_drug_name(name: str) -> str | None:
    n = re.sub(r"\s*\(.*?\)", "", name).strip().lower()   # drop "(LY3298176)" style suffixes
    n = re.sub(r"\s+(injection|tablets?|capsules?|oral|iv|sc)$", "", n)
    if not n or n in DRUG_STOPWORDS or any(w in n for w in ("placebo", "matching")):
        return None
    return n


def _phase(phases: list[str]) -> str:
    nums = [int(p[-1]) for p in phases if p[-1].isdigit()]
    return str(max(nums)) if nums else "0"


def fetch_trials(max_pages: int = 20) -> list[dict]:
    trials: dict[str, dict] = {}
    for area, query in AREA_QUERIES.items():
        token = None
        for _ in range(max_pages):
            params = {
                "query.cond": query,
                "filter.advanced": f"AREA[StartDate]RANGE[{START_DATE},MAX] AND AREA[StudyType]INTERVENTIONAL",
                "fields": FIELDS,
                "pageSize": 1000,
            }
            if token:
                params["pageToken"] = token
            page = get_json(API, params)
            for study in page.get("studies", []):
                trial = _parse(study)
                if trial and trial["conditions"] and trial["drugNames"]:
                    trials[trial["nct"]] = trial
            token = page.get("nextPageToken")
            if not token:
                break
        print(f"  extract: {area:5s} -> {len(trials)} trials so far")
    return list(trials.values())


def _parse(study: dict) -> dict | None:
    p = study.get("protocolSection", {})
    start = p.get("statusModule", {}).get("startDateStruct", {}).get("date", "")
    if not start[:4].isdigit():
        return None
    terms = p.get("conditionsModule", {}).get("conditions", [])
    terms += [m["term"] for m in study.get("derivedSection", {}).get("conditionBrowseModule", {}).get("meshes", [])]
    drugs = []
    for iv in p.get("armsInterventionsModule", {}).get("interventions", []):
        if iv.get("type") in ("DRUG", "BIOLOGICAL"):
            name = clean_drug_name(iv.get("name", ""))
            if name and name not in drugs:
                drugs.append(name)
    return {
        "nct": p["identificationModule"]["nctId"],
        "title": p["identificationModule"].get("briefTitle", ""),
        "phase": _phase(p.get("designModule", {}).get("phases", [])),
        "start": int(start[:4]),
        "sponsor": p.get("sponsorCollaboratorsModule", {}).get("leadSponsor", {}).get("name", "Unknown"),
        "conditions": map_condition(terms),
        "drugNames": drugs,
    }
