"""Steps 4-5 (Neo4j engine) — load into Neo4j, run GDS, read results back.

Needs Neo4j 5 with the Graph Data Science plugin (Neo4j Desktop, the
neo4j:5-community Docker image with NEO4J_PLUGINS='["graph-data-science"]',
or an AuraDB Free instance for loading). Credentials come from the environment
and are only ever used on the build machine.
"""
import os

from . import cypher

BATCH = 500


def _batches(rows: list, size: int = BATCH):
    for i in range(0, len(rows), size):
        yield rows[i:i + size]


def analyze(nodes: dict, links: list[dict], trials: list[dict]) -> tuple[dict, dict]:
    try:
        from neo4j import GraphDatabase
    except ImportError as err:
        raise SystemExit("pip install neo4j  (needed for --engine neo4j)") from err

    uri = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    auth = (os.environ.get("NEO4J_USER", "neo4j"), os.environ["NEO4J_PASSWORD"])
    by_type = lambda t: [n for n in nodes.values() if n["type"] == t]  # noqa: E731

    with GraphDatabase.driver(uri, auth=auth) as driver, driver.session() as s:
        for stmt in cypher.CONSTRAINTS:
            s.run(stmt)
        for key, rows in (("conditions", by_type("condition")), ("drugs", by_type("drug")),
                          ("targets", by_type("target")), ("trials", trials),
                          ("targets_edges", [l for l in links if l["type"] == "TARGETS"])):
            for chunk in _batches(rows):
                s.run(cypher.LOAD[key], rows=chunk)
            print(f"  neo4j: loaded {len(rows)} {key}")
        s.run(cypher.LOAD["tested_in"])

        s.run(cypher.GDS["drop"])
        s.run(cypher.GDS["project"])
        for algo in ("louvain", "pagerank", "fastrp", "knn"):
            s.run(cypher.GDS[algo]).consume()
            print(f"  gds: {algo} done")
        s.run(cypher.GDS["drop"])

        scores = {r["id"]: {"community": r["community"], "pagerank": r["pagerank"]}
                  for r in s.run(cypher.READ["scores"]) if r["id"] in nodes}
        similar: dict[str, list] = {}
        for r in s.run(cypher.READ["similar"]):
            similar.setdefault(r["source"], []).append((r["target"], round(r["score"], 3)))
    return scores, similar
