import { useState } from 'react';
import { useViewGraph } from '../lib/graph';
import { useStore } from '../lib/store';
import styles from './GraphTable.module.css';

/** Screen-reader route into the graph: a visually hidden toggle that lists nodes and neighbours. */
export function GraphTable() {
  const g = useViewGraph();
  const [open, setOpen] = useState(false);
  const select = useStore((s) => s.select);
  if (!g) return null;

  return (
    <div>
      <button type="button" className={open ? styles.shown : 'sr-only sr-only-focusable'} aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide table' : 'View as table'}
      </button>
      {open && (
        <div className={styles.scroll}>
          <table className={styles.table}>
            <caption className="sr-only">Every node in the network with its community and first-degree neighbours</caption>
            <thead><tr><th scope="col">Node</th><th scope="col">Type</th><th scope="col">Community</th><th scope="col">Neighbours</th></tr></thead>
            <tbody>
              {g.nodes.map((n) => (
                <tr key={n.id}>
                  <th scope="row"><button type="button" onClick={() => select(n.id, true)}>{n.label}</button></th>
                  <td>{n.type}</td>
                  <td>{g.communities.get(n.community)?.label}</td>
                  <td>{[...(g.neighbors.get(n.id) ?? [])].map((id) => g.byId.get(id)?.label).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
