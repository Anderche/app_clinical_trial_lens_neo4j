import { useEffect, useState } from 'react';
import { AlgorithmCards } from './components/AlgorithmCards';
import { CypherLens } from './components/CypherLens';
import { NodeDrawer } from './components/NodeDrawer';
import { Footer, Header, Hero } from './components/Page';
import { Timeline } from './components/Timeline';
import { loadCore } from './lib/data';
import { readUrl, syncUrl, useStore } from './lib/store';
import styles from './App.module.css';

export function App() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    useStore.setState(readUrl());
    const unsubscribe = syncUrl();
    loadCore().then(useStore.getState().setData).catch((e: Error) => setError(e.message));
    return unsubscribe;
  }, []);

  return (
    <>
      <Header />
      <main>
        {error ? <p className="container">Could not load graph data ({error}). Run <code>python -m pipeline build</code>.</p> : <Hero />}

        <section id="algorithms" className={styles.section}>
          <div className="container">
            <h2>Three algorithms. Three questions.</h2>
            <p className={styles.sub}>Each card reads the same graph.json as the hero. Click one to apply its view; hover to see the GDS call behind it.</p>
            <AlgorithmCards />
          </div>
        </section>

        <section id="timeline" className={styles.section}>
          <div className="container">
            <div className={styles.heading}>
              <h2>From first patient to FDA label</h2>
              <p className={styles.sub}>Trial activity per headline drug, with openFDA approval actions pinned to the same axis.</p>
            </div>
            <Timeline />
          </div>
        </section>
      </main>
      <Footer />
      <NodeDrawer />
      <CypherLens />
    </>
  );
}
