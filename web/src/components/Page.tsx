import { useStore } from '../lib/store';
import { BridgesPanel } from './BridgesPanel';
import { FilterBar } from './FilterBar';
import { GraphTable } from './GraphTable';
import { AREA_ICON, AREA_LABEL, AREAS, Github } from './icons';
import { Legend } from './Legend';
import { NetworkCanvas } from './NetworkCanvas';
import styles from './Page.module.css';

export const GITHUB_URL: string = import.meta.env.VITE_GITHUB_URL || 'https://github.com/Anderche/app_clinical_trial_lens_neo4j';

export function Header() {
  return (
    <header className={styles.header}>
      <div className={`container ${styles.headerInner}`}>
        <a href="#top" className={styles.wordmark} aria-label="Clinical Trial Lens home">trial<span>·</span>lens</a>
        <nav aria-label="Primary" className={styles.nav}>
          <a href="#explore">Explore</a>
          <a href="#algorithms">Algorithms</a>
          <a href="#timeline">Timeline</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer"><Github size={16} aria-hidden /> GitHub</a>
        </nav>
      </div>
    </header>
  );
}

export function Hero() {
  const meta = useStore((s) => s.data?.meta);
  return (
    <section id="top" className={`container ${styles.hero}`}>
      <div className={styles.intro}>
        <span className={styles.eyebrow}>(:Drug)-[:TARGETS]-&gt;(:Target)</span>
        <h1>The drug pipeline, as a living network.</h1>
        <p className={styles.lede}>
          Trials since 2023 in Alzheimer’s, obesity and diabetes, heart failure and three major cancers, linked to their
          mechanisms, FDA status and safety signals. Louvain finds the clusters; dashed edges mark cross-area repurposing bridges.
        </p>
        <div className={styles.ctas}>
          <a href="#explore" className={styles.primary}>Explore the graph</a>
          <a href="#algorithms" className={styles.secondary}>How it works</a>
        </div>
        <ul className={styles.areas} aria-label="Disease areas">
          {AREAS.map((a) => {
            const Icon = AREA_ICON[a];
            return <li key={a} className={`area-${a}`}><Icon size={16} aria-hidden /> {AREA_LABEL[a]}</li>;
          })}
        </ul>
        {meta && (
          <p className={styles.stats}>
            <span className="mono">{meta.counts.drugs}</span> drugs · <span className="mono">{meta.counts.targets}</span> targets ·{' '}
            <span className="mono">{meta.counts.trials}</span> trials · <span className="mono">{meta.counts.bridges}</span> bridges
          </p>
        )}
        {meta?.source === 'sample' && (
          <p className={styles.notice} role="note">
            <strong>Sample dataset.</strong> Mechanisms and FDA approval dates are real; trial rows are synthetic placeholders.
            Run the live pipeline to load ClinicalTrials.gov, ChEMBL and openFDA data.
          </p>
        )}
      </div>

      <div id="explore" className={styles.explorer}>
        <figure className={styles.graphPanel}>
          <FilterBar />
          <div className={styles.canvasWrap}>
            <NetworkCanvas />
            <BridgesPanel />
            <p className={styles.hint} aria-hidden>Scroll to zoom · drag to pan or pin · hover for Cypher · Esc clears</p>
          </div>
          <figcaption><Legend /></figcaption>
        </figure>
        <GraphTable />
      </div>
    </section>
  );
}

export function Footer() {
  const meta = useStore((s) => s.data?.meta);
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.footerInner}`}>
        <span>Data: ClinicalTrials.gov · ChEMBL · openFDA{meta ? ` · built ${meta.buildDate} (${meta.source}, ${meta.engine})` : ''}</span>
        <span>
          Designed by <a href={GITHUB_URL} target="_blank" rel="noreferrer">Anders Kiss</a> · Neo4j + Graph Data Science ·
          Icons: Lucide (ISC) · <strong>Not medical advice</strong>
        </span>
      </div>
    </footer>
  );
}
