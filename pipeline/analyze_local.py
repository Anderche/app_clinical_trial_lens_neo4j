"""Step 5 (local engine) — the same three algorithms as GDS, in networkx + numpy.

Used when no Neo4j instance is around (CI, a fresh clone, a $0 budget). The
Neo4j engine in analyze_neo4j.py is the reference; this mirrors its settings.
"""
import zlib

import networkx as nx
import numpy as np

from .config import TOP_SIMILAR


def to_nx(nodes: dict, links: list[dict]) -> nx.Graph:
    g = nx.Graph()
    g.add_nodes_from(nodes)
    for l in links:
        g.add_edge(l["source"], l["target"], weight=l.get("trials", 1))
    return g


def louvain(g: nx.Graph) -> dict[str, int]:
    comms = nx.community.louvain_communities(g, seed=42)
    comms = sorted(comms, key=len, reverse=True)       # id 0 = largest, like a stable GDS run
    return {n: i for i, c in enumerate(comms) for n in c}


def pagerank(g: nx.Graph) -> dict[str, float]:
    # GDS pageRank ignores weights unless relationshipWeightProperty is set; match that.
    return nx.pagerank(g, alpha=0.85, weight=None, max_iter=100)


def fastrp(g: nx.Graph, dim: int = 64, weights=(0.0, 1.0, 1.0, 1.0), seed: int = 42) -> dict[str, np.ndarray]:
    """FastRP (Chen et al. 2019): sparse random projection, then iterated propagation."""
    order = list(g.nodes)
    a = nx.to_scipy_sparse_array(g, nodelist=order, weight=None, format="csr").astype(float)
    deg = np.asarray(a.sum(axis=1)).ravel()
    deg[deg == 0] = 1
    s = a.multiply(1 / deg[:, None]).tocsr()            # row-normalised adjacency

    rng = np.random.default_rng(seed)
    p = 1 / 3                                          # very sparse random projection
    r = rng.choice([np.sqrt(3), 0.0, -np.sqrt(3)], size=(len(order), dim), p=[p / 2, 1 - p, p / 2])

    emb = weights[0] * r
    cur = r
    for w in weights[1:]:
        cur = s @ cur
        norm = np.linalg.norm(cur, axis=1, keepdims=True)
        norm[norm == 0] = 1
        emb = emb + w * (cur / norm)
    return {n: emb[i] for i, n in enumerate(order)}


def knn(emb: dict[str, np.ndarray], ids: list[str], k: int = TOP_SIMILAR) -> dict[str, list[tuple[str, float]]]:
    """Top-k cosine neighbours among `ids` (drugs only, like nodeLabels: ['Drug'])."""
    m = np.stack([emb[i] for i in ids])
    m = m / np.maximum(np.linalg.norm(m, axis=1, keepdims=True), 1e-12)
    sim = m @ m.T
    np.fill_diagonal(sim, -np.inf)
    out = {}
    for i, nid in enumerate(ids):
        top = np.argsort(-sim[i])[:k]
        # GDS kNN reports similarity in [0, 1]; map cosine [-1, 1] the same way.
        out[nid] = [(ids[j], round(float((sim[i, j] + 1) / 2), 3)) for j in top]
    return out


AREA_ORDER = ["alz", "obes", "hf", "onc"]


def layout(g: nx.Graph, communities: dict[str, int], areas: dict[str, str]) -> dict[str, tuple[float, float]]:
    """Two-level layout in px: communities sit on a ring (grouped by area, so related
    clusters are neighbours), and each community is spring-laid-out inside its own disc.
    A plain spring layout flings disconnected areas to the far corners."""
    members: dict[int, list[str]] = {}
    for n, c in communities.items():
        members.setdefault(c, []).append(n)

    def dominant(c):
        votes = [areas[n] for n in members[c]]
        return max(AREA_ORDER, key=votes.count)

    order = sorted(members, key=lambda c: (AREA_ORDER.index(dominant(c)), -len(members[c])))
    radius = {c: 30 * np.sqrt(len(members[c])) for c in order}
    gap = 50
    ring = sum(2 * radius[c] + gap for c in order) / (2 * np.pi) if len(order) > 1 else 0

    pos, angle = {}, 0.0
    for c in order:
        span = (2 * radius[c] + gap) / max(ring, 1e-9)
        cx, cy = ring * np.cos(angle + span / 2), ring * np.sin(angle + span / 2)
        angle += span
        sub = g.subgraph(members[c])
        jitter = {n: zlib.crc32(n.encode()) % 360 for n in sub}   # deterministic, unlike hash()
        init = {n: (np.cos(np.radians(j)), np.sin(np.radians(j))) for n, j in jitter.items()}
        inner = nx.spring_layout(sub, pos=init, iterations=150, seed=42, weight=None) if len(sub) > 1 else {members[c][0]: (0, 0)}
        pts = np.array(list(inner.values()), dtype=float)
        pts -= pts.mean(axis=0)
        pts /= max(np.linalg.norm(pts, axis=1).max(), 1e-9)
        for n, (x, y) in zip(inner, pts):
            pos[n] = (round(float(cx + x * radius[c]), 1), round(float(cy + y * radius[c]), 1))
    return pos


def analyze(nodes: dict, links: list[dict]) -> tuple[dict, dict]:
    g = to_nx(nodes, links)
    comm = louvain(g)
    pr = pagerank(g)
    emb = fastrp(g)
    drug_ids = [n for n, v in nodes.items() if v["type"] == "drug"]
    similar = knn(emb, drug_ids)
    scores = {n: {"community": comm[n], "pagerank": pr[n]} for n in nodes}
    return scores, similar
