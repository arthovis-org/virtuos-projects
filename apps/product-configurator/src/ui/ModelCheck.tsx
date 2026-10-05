import { catalogIssues } from '@/catalog';
import { useProduct } from '@/state/setupStore';
import { useModelIssuesStore } from '@/state/modelIssuesStore';
import styles from './ModelCheck.module.css';

const NO_ISSUES: readonly string[] = [];

/**
 * Development aid: lists what needs fixing in the product folder, such as a product.json
 * key that matches no object, or a materials/ folder named after no Blender material.
 * Never shown in production.
 */
export function ModelCheck() {
  const product = useProduct();
  const runtime = useModelIssuesStore((state) => state.byProduct[product.id] ?? NO_ISSUES);
  const issues = [...(catalogIssues[product.id] ?? NO_ISSUES), ...runtime];
  if (!import.meta.env.DEV || issues.length === 0) return null;

  return (
    <section className={styles.card} aria-label="Setup check">
      <h2 className={styles.title}>
        Setup check · {issues.length} {issues.length === 1 ? 'thing' : 'things'} to fix
      </h2>
      <ul className={styles.list}>
        {issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
      <p className={styles.hint}>
        <code>npm run inspect -- {product.id}</code> shows what the configurator reads from{' '}
        <code>products/{product.id}/</code>. Only shown in development.
      </p>
    </section>
  );
}
