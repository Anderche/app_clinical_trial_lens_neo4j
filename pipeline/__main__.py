"""Offline build CLI.

    python -m pipeline build                          # sample data, local engine ($0, no network)
    python -m pipeline build --source live            # ClinicalTrials.gov + ChEMBL + openFDA
    python -m pipeline build --source live --engine neo4j   # + Neo4j load and GDS algorithms
"""
import argparse
import time

from . import analyze_local, dataset
from .analyze_local import layout, to_nx
from .config import OUT_DIR
from .graph import build_graph


def build(source: str, engine: str, max_pages: int) -> None:
    t0 = time.time()
    print(f"[1-3] dataset ({source})")
    ds = dataset.from_live(max_pages) if source == "live" else dataset.from_sample()

    print("[4] graph")
    nodes, links = build_graph(ds)
    print(f"  {len(nodes)} nodes, {len(links)} links from {len(ds['trials'])} trials")

    print(f"[5] analyze ({engine})")
    if engine == "neo4j":
        from . import analyze_neo4j
        scores, similar = analyze_neo4j.analyze(nodes, links, ds["trials"])
    else:
        scores, similar = analyze_local.analyze(nodes, links)
    positions = layout(to_nx(nodes, links), {n: s["community"] for n, s in scores.items()},
                       {n: v["area"] for n, v in nodes.items()})

    print("[6-7] bridges + export")
    from .export import export
    meta = export(ds, nodes, links, scores, similar, positions,
                  engine="neo4j-gds" if engine == "neo4j" else "local-networkx")
    print(f"  wrote {OUT_DIR.relative_to(OUT_DIR.parents[2])}: {meta['counts']}  ({time.time() - t0:.1f}s)")


def main() -> None:
    p = argparse.ArgumentParser(prog="python -m pipeline")
    sub = p.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="build web/public/data/*.json")
    b.add_argument("--source", choices=["sample", "live"], default="sample")
    b.add_argument("--engine", choices=["local", "neo4j"], default="local")
    b.add_argument("--max-pages", type=int, default=20, help="ClinicalTrials.gov pages (1000 trials each) per area")
    args = p.parse_args()
    build(args.source, args.engine, args.max_pages)


if __name__ == "__main__":
    main()
