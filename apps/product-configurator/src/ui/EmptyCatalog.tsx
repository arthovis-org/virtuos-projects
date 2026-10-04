import styles from './EmptyCatalog.module.css';

interface EmptyCatalogProps {
  issues: Readonly<Record<string, readonly string[]>>;
}

/** Shown while `products/` has no usable product yet. */
export function EmptyCatalog({ issues }: EmptyCatalogProps) {
  const folders = Object.entries(issues);
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>No products yet</h1>
        <p>
          Create a folder per product and put the Blender export in it:
          <code className={styles.path}>products/smart-desk/model.glb</code>
          Object names such as <code>Toggle_SideMonitors</code> or <code>Lift100_Top</code> become
          options; <code>products/README.md</code> lists every convention.
        </p>
        {folders.length > 0 && (
          <ul className={styles.issues}>
            {folders.map(([id, list]) =>
              list.map((issue) => (
                <li key={`${id}:${issue}`}>
                  <strong>{id}</strong>: {issue}
                </li>
              )),
            )}
          </ul>
        )}
      </div>
    </main>
  );
}
