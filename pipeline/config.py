"""Shared constants: scope, disease areas, paths and caps."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "web" / "public" / "data"
CACHE_DIR = ROOT / "cache"
SEED_FILE = Path(__file__).parent / "seed" / "sample.json"
SCHEMA_FILE = Path(__file__).parent / "schema.json"

START_DATE = "2023-01-01"
YEARS = (2023, 2026)
MAX_NODES = 500          # graph.json cap (spec: keeps the force layout smooth)
TOP_SIMILAR = 5
FAERS_TOP = 5

# Disease areas. Keys match the CSS tokens (--area-alz, --area-obes, ...).
AREAS = {
    "alz": "Alzheimer's / dementia",
    "obes": "Obesity / T2D",
    "hf": "Heart failure / CV",
    "onc": "Lung / breast / colorectal cancer",
}

# Canonical condition nodes. `match` terms are lowercase substrings tested
# against a trial's conditions and MeSH terms (first hit wins).
CONDITIONS = {
    "alzheimers": {"label": "Alzheimer's disease", "area": "alz", "match": ["alzheimer"]},
    "dementia": {"label": "Dementia", "area": "alz", "match": ["dementia", "mild cognitive impairment"]},
    "obesity": {"label": "Obesity", "area": "obes", "match": ["obesity", "overweight"]},
    "t2d": {"label": "Type 2 diabetes", "area": "obes", "match": ["type 2 diabetes", "diabetes mellitus, type 2", "t2dm"]},
    "hf": {"label": "Heart failure", "area": "hf", "match": ["heart failure", "cardiomyopathy"]},
    "cvd": {"label": "Cardiovascular disease", "area": "hf", "match": ["atherosclero", "cardiovascular", "myocardial infarction", "hypercholesterol", "lipoprotein"]},
    "htn": {"label": "Hypertension", "area": "hf", "match": ["hypertension"]},
    "lung": {"label": "Lung cancer", "area": "onc", "match": ["lung cancer", "non-small cell lung", "lung neoplasm", "nsclc", "small cell lung"]},
    "breast": {"label": "Breast cancer", "area": "onc", "match": ["breast cancer", "breast neoplasm", "breast carcinoma"]},
    "crc": {"label": "Colorectal cancer", "area": "onc", "match": ["colorectal", "colon cancer", "rectal cancer"]},
}

# ClinicalTrials.gov condition queries, one per area.
AREA_QUERIES = {
    "alz": "Alzheimer OR dementia",
    "obes": "obesity OR \"type 2 diabetes\"",
    "hf": "\"heart failure\" OR atherosclerosis OR hypertension OR \"cardiovascular disease\"",
    "onc": "\"lung cancer\" OR \"breast cancer\" OR \"colorectal cancer\"",
}

# Intervention names that are never a drug node.
DRUG_STOPWORDS = {
    "placebo", "standard of care", "saline", "best supportive care", "vehicle",
    "chemotherapy", "radiotherapy", "observation", "usual care", "sham",
}

# Human-friendly names for Louvain communities, keyed by the community's
# top-PageRank target. Unlisted communities are named after their top targets.
COMMUNITY_LABELS = {
    "GLP1R": "Incretin", "GIPR": "Incretin", "CALCR": "Amylin",
    "APP": "Anti-amyloid", "MAPT": "Anti-tau",
    "SLC5A2": "Cardio-renal", "NR3C2": "Cardio-renal",
    "PCSK9": "Lipid lowering", "LPA": "Lipid lowering",
    "TACSTD2": "ADC payloads", "ERBB2": "ADC payloads",
    "PDCD1": "Checkpoint", "KRAS": "KRAS / EGFR", "EGFR": "KRAS / EGFR",
    "ESR1": "Endocrine / PI3K", "MYH7": "Cardiac myosin", "CYP11B2": "Blood pressure",
}

# Headline drugs for the static timeline (first 4-6 present in the data).
TIMELINE_DRUGS = [
    "tirzepatide", "semaglutide", "lecanemab", "donanemab",
    "datopotamab deruxtecan", "capivasertib",
]
