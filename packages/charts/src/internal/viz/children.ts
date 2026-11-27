// JSX children forms of the collection props: `GaugeAxis`,
// `GaugePointer` and `GeoMapLayer` render nothing; the owner reads the props
// of its direct children during render, pure, so the server renders the same
// model as the array form (the deviation `ChartSeries` takes: context
// registration runs in effects, after the server markup).

import { Children, type ReactNode } from 'react';

/** Props of the direct children of `type`, in order (arrays flattened, as for `ChartSeries`). */
export const childProps = <P>(children: ReactNode, type: unknown): P[] =>
  // Strings and numbers have no `type`; elements of other types are skipped.
  Children.toArray(children).flatMap((c) => ((c as { type?: unknown }).type === type ? [(c as { props: P }).props] : []));
