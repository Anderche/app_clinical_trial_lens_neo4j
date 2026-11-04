# Clinical Trial Lens: Mechanism Network PoC Tech Spec

Nov 4, 2026 · @AGAME

## Overview

The PoC is one public page: an interactive drug–target–condition network, colored by Louvain community, with cross-area repurposing bridges highlighted. It ships as a single Railway service on a shoestring budget, served from precomputed JSON.

**In scope:** trials started 2023–2026 in four areas (Alzheimer’s/dementia, obesity/type 2 diabetes, heart failure/CV, lung/breast/colorectal cancer); ClinicalTrials.gov, ChEMBL and openFDA data; the hero graph, three algorithm cards, a static timeline.

**Out of scope:** “Ask the graph” chat, user accounts, live Neo4j queries in production, dark mode, the sponsor, similarity and collaboration network views.

**Budget target:** Railway Hobby plan, one always-on service; Neo4j runs only on a laptop or AuraDB Free during the offline build.

## Architecture

The app runs as one Railway container with no database: Neo4j and GDS run only in the offline build, which bakes static JSON into the Docker image.

&#91;embedded content: architecture · offline build feeds one Railway container\]

The JSON export is copied into the image at build time. FastAPI serves the Vite bundle and the JSON to the browser, and a production database can be added later behind the same `/api` routes.

## Data pipeline (offline, run on demand)

A Python CLI, `pipeline/`, builds `graph.json` once; rerun it monthly. Neo4j is a build tool here, never a production dependency.

1. **Extract.** Download the AACT monthly flat-file snapshot. Keep trials with `start_date >= 2023-01-01` whose MeSH condition terms map to the four areas.
2. **Enrich mechanisms.** Match intervention names to ChEMBL molecules (exact name, then synonym), pulling mechanism of action and target. Unmatched drugs stay as nodes without target edges.
3. **Enrich regulatory.** For each matched drug, query openFDA: Drugs@FDA for approval status and date, FAERS for the top 5 reaction terms by report count. Cache raw responses in `cache/` to stay well under the rate limit.
4. **Load.** Batched `UNWIND` + `MERGE` into Neo4j (Desktop or AuraDB Free), with uniqueness constraints on each node key.
5. **Analyze with GDS.** Project the drug–target–condition graph, then write back as node properties:
   - `gds.louvain` → `community`
   - `gds.pageRank` → `pagerank` (drives node size)
   - `gds.fastRP` + `gds.knn` → top 5 `similar` drugs
6. **Flag bridges.** A bridge is a drug with trials in two or more disease areas, or an edge joining two communities.
7. **Export.** Cypher queries write `public/data/graph.json`, `details/<id>.json` and `meta.json`, then validate them against a JSON Schema.

## Graph JSON contract

`graph.json` holds at most 500 nodes, which keeps it small and the force layout smooth. Selection order is: all target and condition nodes, then drugs ranked by PageRank until the cap is reached. Every other drug is still searchable through `search-index.json`, and loads its neighbors on demand.

```json
{
  "nodes": [{"id": "chembl:<CHEMBL_ID>", "type": "drug", "label": "tirzepatide",
             "community": 3, "pagerank": 0.0142, "areas": ["obesity", "hf"],
             "maxPhase": "approved", "sponsors": ["Eli Lilly"], "firstStart": 2023}],
  "links": [{"source": "chembl:<CHEMBL_ID>", "target": "tgt:GLP1R",
             "type": "TARGETS", "bridge": false}],
  "communities": [{"id": 3, "label": "Incretin", "size": 41}]
}
```

- `details/<id>.json` holds the drawer data: trial list (NCT id, phase, start year, sponsor), FDA status, top FAERS terms and similar drugs.
- `meta.json` holds the build date and source versions, which the footer shows.

`cypher.json` maps each element type (target, drug, condition, each edge type, each algorithm card) to the Cypher template the pipeline actually ran, which feeds the hover lens.

## Frontend

The frontend is React 18, Vite and TypeScript, with D3 v7 (`d3-force`, `d3-zoom`, `d3-drag`, `d3-scale`) and no UI kit. State lives in Zustand, with selection and filters mirrored in the URL query string so every view can be shared.

**Components**

- `<NetworkCanvas>` is the core. D3 renders into an SVG for up to 500 nodes, which keeps hit-testing and CSS styling simple; switch to Canvas only if FPS drops below 45. The layout runs once offline (precomputed `x`/`y`), then a short live simulation settles the nodes; `alphaDecay` is 0.05.
- `<FilterBar>` has area chips, a phase multi-select, a start-year range (2023–2026), a community select and a sponsor typeahead. Filtered-out nodes fade to 10% opacity rather than disappearing, so the layout stays stable.
- `<SearchBox>` uses Fuse.js over `search-index.json`; choosing a result centers the graph and selects that node.
- `<NodeDrawer>` is a right-hand panel, 400 px wide, or a bottom sheet on mobile. It shows the node header, trial list, FDA status, FAERS chips and similar drugs.
- `<BridgesPanel>` is a collapsible list of repurposing bridges, sorted by number of areas; clicking one highlights its path.
- `<Legend>` explains shapes, community colors and the dashed bridge style.

**Interactions**

- Hover dims non-neighbors to 15% and shows a tooltip.
- Click selects a node, highlights its first-degree neighbors, opens the drawer and updates the URL.
- Scroll or pinch zooms (0.3× to 4×); drag pans, or drags a node to pin it.
- `Esc` clears the selection; `/` focuses search.
- Bridges show by default as dashed edges; a toggle in the Legend hides them.
- Users who set reduced motion get the precomputed layout with no simulation.

**Cypher hover lens (x-ray)**

Hovering any node, edge or algorithm card shows a tooltip with the exact Cypher pattern behind it, so visitors see Neo4j at work without leaving the graph.

- **What shows:** the pattern, filled with the hovered element's real values, for example `MATCH (d:Drug {name:'tirzepatide'})-[:TARGETS]->(t:Target) RETURN t`. Algorithm cards show their GDS call, such as `CALL gds.louvain.write('mechanisms', {writeProperty:'community'})`.
- **Behavior:** the tooltip appears after a 250 ms hover delay and follows the cursor. Pressing `C` pins it and adds a copy button. On touch devices, a long-press opens it.
- **Component:** `<CypherLens>` is a single shared tooltip that reads templates from `cypher.json` and substitutes the hovered element's properties into `$params`.
- **Accuracy:** each template is the same Cypher the pipeline ran to build that element, so the lens never shows invented queries.
- **Look:** a `--surface` card with a 1 px `--border` and 12 px radius, IBM Plex Mono at 12.5 px, labels and relationships in `--accent`, and a `Neo4j · Cypher` badge at the top. It is at most 420 px wide and wraps long lines.

## Page structure

This follows mockup B’s layout, but on a light theme.

1. **Header.** Wordmark, plus anchor links to Explore, Algorithms, Timeline and GitHub.
2. **Hero.** On the left (5 of 12 columns): eyebrow, headline, subhead, two CTAs and the area legend. On the right (7 columns): the full `<NetworkCanvas>`, 640 px tall, with `<FilterBar>` docked above it and `<BridgesPanel>` collapsed beside it.
3. **Algorithm cards (live).** Three cards for PageRank, Louvain and FastRP + kNN. Each mini-viz reads from `graph.json`: PageRank shows the top 5 targets as bars, Louvain shows community chips with their sizes, and kNN shows similar drugs for the selected node. Clicking a card applies its view to the hero graph, for example sizing nodes by PageRank or coloring them by community.
4. **Timeline (static).** A prebuilt SVG of trial-start-to-FDA-action lanes for 4 to 6 headline drugs, generated during the pipeline step.
5. **Footer.** Data sources, build date, and a “Not medical advice” note.

## Style guide

This is mockup B translated to light: a cool off-white ground, ink-navy type, and four community hues darkened enough to pass contrast on white. All tokens live as CSS custom properties in `src/styles/tokens.css`.

**Color tokens**

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#F7F8FB` | Page ground |
| `--surface` | `#FFFFFF` | Cards, drawer, graph panel |
| `--border` | `#E3E7EF` | Card and panel borders, grid rules |
| `--ink` | `#0F1A2E` | Headings and body text |
| `--ink-muted` | `#5B6880` | Secondary text (5.6:1 on `--bg`) |
| `--accent` | `#0E7490` | Primary CTA, links, focus ring |
| `--edge` | `#C5CDDB` | Default graph edges |
| `--bridge` | `#A21C5B` | Dashed repurposing bridges |
| `--area-alz` | `#6D4BC4` | Alzheimer’s community |
| `--area-obes` | `#C8640F` | Obesity / T2D community |
| `--area-hf` | `#2F8F5B` | Heart failure / CV community |
| `--area-onc` | `#1C7FB8` | Oncology community |

Louvain communities beyond these four reuse the nearest area hue at a lighter tint. Never encode by hue alone: shape and the label carry meaning too.

**Typography**

- Display: Space Grotesk 700, at 56 / 40 / 28 px, letter-spacing −0.02em.
- UI and body: IBM Plex Sans 400/500/600, at 17 px body and 15 px UI, line-height 1.55.
- Data and code: IBM Plex Mono 400, at 13 px (node IDs, Cypher, GDS badges).
- Graph labels: Plex Sans 500, 12 px, with a 3 px `--surface` halo (`paint-order: stroke`).

**Spacing, radius, elevation**

- Spacing uses an 8 px scale (4, 8, 16, 24, 32, 48, 80). Content max-width is 1280 px with 24 px gutters on a 12-column grid.
- Radius is 6 px on inputs and buttons, 12 px on cards and panels, and 999 px on chips.
- Elevation is flat: borders, no shadows. The only exception is the drawer, which gets `0 8px 24px rgb(15 26 46 / 0.08)`.

**Node encoding (more elegant than B)**

- **Target:** a filled circle in its community hue, radius 8–24 px scaled by PageRank, with a white crosshair icon inside.
- **Drug:** a ring with a 2 px stroke in its community hue and a 14% fill, with a pill icon inside.
- **Condition:** a 10 px-radius rounded square with a 1.5 px stroke and the area icon inside (brain, scale, heart, ribbon).
- **Edges:** 1 px `--edge` at 60% opacity. Bridges are 1.5 px `--bridge` dashed `5 4`. A selected node’s edges get 2 px in its hue.
- **Selected node:** an 8 px halo ring in its hue at 25%, plus a gentle 1.08× scale over 150 ms.

**Icons**

- Use Flaticon UIcons (regular rounded set), imported as individual SVGs, not the icon font, to keep the bundle small.
- Set: crosshair (target), pill (drug), flask (trial), building (sponsor), shield-check (FDA approved), triangle-warning (FAERS), brain, weight scale, heart, ribbon (areas).
- Size is 16 px in the UI and 10–12 px inside nodes, with `currentColor` fill.
- Free-tier Flaticon icons need attribution, so add a credit line in the footer. Lucide (MIT) is the drop-in fallback if attribution is unwanted.

**CSS conventions**

- Use CSS Modules per component and global tokens only; no Tailwind or UI kit, to keep full D3 control.
- Style SVG nodes by class (`.node--drug`, `.is-dimmed`, `.is-selected`), never by inline color, so themes stay in tokens.
- Interactive elements are real `<button>`/`<a>`, with a 2 px `--accent` focus ring at 2 px offset and 44 px minimum touch targets.
- Below 768 px, the hero stacks with the graph first at 70vh, and the drawer becomes a bottom sheet.

## Performance, accessibility, deployment

**Performance budgets**

- Initial JS is under 180 KB gzipped (React, D3 modules, Zustand, Fuse).
- `graph.json` is under 250 KB gzipped; drawer detail files load lazily, at under 15 KB each.
- Graph to interactive takes under 1.5 s on a mid-range laptop and holds 55+ FPS while panning.
- Static assets get `Cache-Control: max-age=31536000, immutable`; JSON gets `max-age=86400`.

**Accessibility**

- The SVG has `role="img"` with a summary label, and a visually hidden “View as table” toggle lists nodes and neighbors for screen readers.
- Text meets 4.5:1 contrast; community colors also differ in lightness, and shapes carry type.
- All filters and the drawer are keyboard-operable.

**Deployment (Railway)**

- One service from a Dockerfile, in a multi-stage build: Node builds the Vite app, then a `python:3.12-slim` image runs FastAPI with Uvicorn.
- FastAPI mounts `/` as static files and serves `/api/health` plus `/api/details/{id}` (a thin file read, ready to swap for live Neo4j later).
- There are no secrets in production, because Neo4j credentials are used only in the local pipeline.
- Use a GitHub push-to-deploy, with a custom domain optional.
- Expected cost is within the Railway Hobby plan’s included usage, since the app is a single small container with no database.

**Milestones (about 4 weeks of evenings)**

1. Week 1: pipeline extract and enrich steps, plus the Neo4j load.
2. Week 2: GDS algorithms, bridge flags, JSON export and schema validation.
3. Week 3: `<NetworkCanvas>`, filters, drawer and bridges panel.
4. Week 4: algorithm cards, static timeline, styling polish and the Railway deploy.

**Open questions**

- How good is the ChEMBL name-match rate for investigational codes that only appear in 2023+ trials? A manual alias CSV may be needed.
- Should FAERS signals be raw counts or a disproportionality score (PRR)? PRR is more defensible but adds pipeline work.
