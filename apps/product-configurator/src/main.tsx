import '@fontsource-variable/inter';
import '@/styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { catalogIssues, productList } from '@/catalog';
import { EmptyCatalog } from '@/ui/EmptyCatalog';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

// The configurator needs at least one product; until a folder exists, explain how to add one.
const content =
  productList.length === 0 ? (
    <EmptyCatalog issues={catalogIssues} />
  ) : (
    await import('./App').then(({ App }) => <App />)
  );

createRoot(root).render(<StrictMode>{content}</StrictMode>);
