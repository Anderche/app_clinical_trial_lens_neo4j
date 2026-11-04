"""Smoke tests: the sample build honours the JSON contract, and the API is safe."""
import json

import jsonschema
import pytest
from fastapi.testclient import TestClient

from pipeline import analyze_local, dataset
from pipeline.config import MAX_NODES, SCHEMA_FILE
from pipeline.cypher import LENS
from pipeline.export import label_communities, select_nodes
from pipeline.graph import build_graph


@pytest.fixture(scope="module")
def built():
    ds = dataset.from_sample()
    nodes, links = build_graph(ds)
    scores, similar = analyze_local.analyze(nodes, links)
    return ds, nodes, links, scores, similar


def test_every_drug_has_trials_and_known_areas(built):
    _, nodes, _, _, _ = built
    drugs = [n for n in nodes.values() if n["type"] == "drug"]
    assert drugs and all(n["trialCount"] > 0 and n["areas"] for n in drugs)


def test_bridges_span_two_areas(built):
    _, nodes, _, _, _ = built
    bridges = {n["label"] for n in nodes.values() if n["type"] == "drug" and len(n["areas"]) >= 2}
    assert {"semaglutide", "tirzepatide"} <= bridges


def test_knn_returns_five_other_drugs(built):
    _, nodes, _, _, similar = built
    for did, sims in similar.items():
        assert len(sims) == 5 and did not in {s for s, _ in sims}
        assert all(nodes[s]["type"] == "drug" and 0 <= score <= 1 for s, score in sims)


def test_communities_are_dense_and_labelled(built):
    _, nodes, _, scores, _ = built
    remap, comms = label_communities(nodes, scores)
    assert sorted(remap.values()) == list(range(len(comms)))
    assert len({c["label"] for c in comms}) == len(comms)


def test_cap_keeps_all_targets_and_conditions(built):
    _, nodes, _, scores, _ = built
    keep = select_nodes(nodes, scores)
    assert len(keep) <= MAX_NODES
    assert all(n in keep for n, v in nodes.items() if v["type"] != "drug")


def test_lens_covers_every_element_type():
    for key in ("node.drug", "node.target", "node.condition", "edge.TARGETS", "edge.TESTED_IN",
                "bridge", "algo.pagerank", "algo.louvain", "algo.knn"):
        assert LENS[key].strip()


def test_committed_graph_json_matches_schema():
    from pipeline.config import OUT_DIR
    graph = json.loads((OUT_DIR / "graph.json").read_text())
    jsonschema.validate(graph, json.loads(SCHEMA_FILE.read_text()))


def test_api_rejects_bad_ids():
    from server.main import app
    client = TestClient(app)
    assert client.get("/api/health").json()["status"] == "ok"
    assert client.get("/api/details/drug:semaglutide").json()["label"] == "semaglutide"
    assert client.get("/api/details/..%2F..%2Fetc%2Fpasswd").status_code in (400, 404)
    assert client.get("/api/details/drug:does-not-exist").status_code == 404
