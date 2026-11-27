// Client entry of the Data Grid page (index.html).
import '@salmonui/core/styles.css';
import '@salmonui/data-grid/styles.css';
import '../app.css';
import type { DataGridFeature } from '@salmonui/data-grid';
import { App, featuresOf } from '../App.tsx';
import { hydrate } from '../hydrate.tsx';

const params = new URLSearchParams(window.location.search);
const features = featuresOf(window.location.href);
// `?features=paging,preload`: the app provides paging through the `features` prop before hydrating (an app would
// import it statically; the other modes keep the features entry out of this bundle so paging loads on demand).
const preloaded: readonly DataGridFeature[] | undefined = features.includes('preload') ? [(await import('@salmonui/data-grid/features')).paging] : undefined;

hydrate(<App newRow={params.has('newrow')} features={features} suspense={params.has('suspense')} {...(preloaded ? { preloaded } : {})} />);
