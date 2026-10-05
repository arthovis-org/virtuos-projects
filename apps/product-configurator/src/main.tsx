import '@fontsource-variable/inter';
import '@/styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { catalogIssues, productList } from '@/catalog';
import { installErrorLog } from '@/feedback/errorLog';
import { EmptyCatalog } from '@/ui/EmptyCatalog';

// Recent errors go along with feedback, so start listening before anything can fail.
installErrorLog();

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
