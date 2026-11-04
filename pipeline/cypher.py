"""Every Cypher statement the Neo4j engine runs, in one place.

`analyze_neo4j.py` executes these strings verbatim, and `export.py` writes the
LENS subset to cypher.json, so the hover lens in the UI never shows a query the
pipeline did not run. `$params` are filled in per element by the frontend.
"""

GRAPH_NAME = "mechanisms"

CONSTRAINTS = [
    "CREATE CONSTRAINT drug_id IF NOT EXISTS FOR (d:Drug) REQUIRE d.id IS UNIQUE",
    "CREATE CONSTRAINT target_id IF NOT EXISTS FOR (t:Target) REQUIRE t.id IS UNIQUE",
    "CREATE CONSTRAINT condition_id IF NOT EXISTS FOR (c:Condition) REQUIRE c.id IS UNIQUE",
    "CREATE CONSTRAINT trial_nct IF NOT EXISTS FOR (t:Trial) REQUIRE t.nct IS UNIQUE",
    "CREATE CONSTRAINT sponsor_name IF NOT EXISTS FOR (s:Sponsor) REQUIRE s.name IS UNIQUE",
]

LOAD = {
    "conditions": """
UNWIND $rows AS row
MERGE (c:Condition {id: row.id})
SET c.name = row.label, c.area = row.areas[0]""",
    "drugs": """
UNWIND $rows AS row
MERGE (d:Drug {id: row.id})
SET d.name = row.label, d.maxPhase = row.maxPhase, d.areas = row.areas""",
    "targets": """
UNWIND $rows AS row
MERGE (t:Target {id: row.id})
SET t.symbol = row.label, t.name = row.name""",
    "trials": """
UNWIND $rows AS row
MERGE (t:Trial {nct: row.nct})
SET t.phase = row.phase, t.startYear = row.start, t.title = row.title
MERGE (s:Sponsor {name: row.sponsor})
MERGE (s)-[:RUNS]->(t)
WITH t, row
UNWIND row.drugs AS did
MATCH (d:Drug {id: did})
MERGE (t)-[:TESTS]->(d)
WITH t, row
UNWIND row.conditions AS cid
MATCH (c:Condition {id: 'cond:' + cid})
MERGE (t)-[:STUDIES]->(c)""",
    "targets_edges": """
UNWIND $rows AS row
MATCH (d:Drug {id: row.source}), (t:Target {id: row.target})
MERGE (d)-[:TARGETS]->(t)""",
    # Collapse Drug<-Trial->Condition into one weighted edge for the projection.
    "tested_in": """
MATCH (d:Drug)<-[:TESTS]-(tr:Trial)-[:STUDIES]->(c:Condition)
WITH d, c, count(tr) AS n
MERGE (d)-[r:TESTED_IN]->(c)
SET r.trials = n""",
}

GDS = {
    "drop": f"CALL gds.graph.drop('{GRAPH_NAME}', false) YIELD graphName RETURN graphName",
    "project": f"""
CALL gds.graph.project('{GRAPH_NAME}', ['Drug', 'Target', 'Condition'], {{
  TARGETS: {{orientation: 'UNDIRECTED'}},
  TESTED_IN: {{orientation: 'UNDIRECTED', properties: 'trials'}}
}})""",
    "louvain": f"CALL gds.louvain.write('{GRAPH_NAME}', {{writeProperty: 'community'}})",
    "pagerank": f"CALL gds.pageRank.write('{GRAPH_NAME}', {{writeProperty: 'pagerank'}})",
    "fastrp": f"CALL gds.fastRP.mutate('{GRAPH_NAME}', {{embeddingDimension: 64, randomSeed: 42, mutateProperty: 'embedding'}})",
    "knn": f"""
CALL gds.knn.write('{GRAPH_NAME}', {{
  nodeLabels: ['Drug'], nodeProperties: ['embedding'], topK: 5, randomSeed: 42, concurrency: 1,
  writeRelationshipType: 'SIMILAR', writeProperty: 'score'
}})""",
}

READ = {
    "scores": "MATCH (n) WHERE n:Drug OR n:Target OR n:Condition RETURN n.id AS id, n.community AS community, n.pagerank AS pagerank",
    "similar": "MATCH (a:Drug)-[s:SIMILAR]->(b:Drug) RETURN a.id AS source, b.id AS target, s.score AS score ORDER BY score DESC",
}

# Templates shown by the hover lens. Keys: node.<type>, edge.<TYPE>, algo.<name>, bridge.
LENS = {
    "node.drug": "MATCH (d:Drug {name: $label})-[:TARGETS]->(t:Target)\nRETURN d, collect(t.symbol) AS targets",
    "node.target": "MATCH (d:Drug)-[:TARGETS]->(t:Target {symbol: $label})\nRETURN t, collect(d.name) AS drugs",
    "node.condition": "MATCH (d:Drug)<-[:TESTS]-(tr:Trial)-[:STUDIES]->(c:Condition {name: $label})\nRETURN d.name, count(tr) AS trials ORDER BY trials DESC",
    "edge.TARGETS": "MATCH (d:Drug {name: $source})-[:TARGETS]->(t:Target {symbol: $target})\nRETURN d, t",
    "edge.TESTED_IN": LOAD["tested_in"].strip(),
    "bridge": "MATCH (d:Drug {name: $label})-[:TESTED_IN]->(c:Condition)\nWITH d, collect(DISTINCT c.area) AS areas\nWHERE size(areas) >= 2\nRETURN d.name, areas",
    "algo.pagerank": GDS["pagerank"],
    "algo.louvain": GDS["louvain"],
    "algo.knn": GDS["fastrp"] + "\n" + GDS["knn"].strip(),
}
