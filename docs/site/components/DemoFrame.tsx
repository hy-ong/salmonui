import Link from 'next/link';
import { demoComponents } from '../demos/registry';
import type { DemoMeta } from '../lib/catalog.mjs';
import { demoHref } from '../lib/site';
import { InlineCode } from './InlineCode';

/** One demo with its title and description; the demo itself is a client component. */
export function DemoFrame({ demo, standalone = false }: { demo: DemoMeta; standalone?: boolean }) {
  const Demo = demoComponents[demo.id];
  return (
    <section className="demo" data-demo-id={demo.id} aria-labelledby={`demo-${demo.id}-title`}>
      <header className="demo__header">
        <h2 id={`demo-${demo.id}-title`}>{demo.title}</h2>
        {standalone ? null : (
          <Link className="demo__open" href={demoHref(demo)}>
            Open demo
          </Link>
        )}
      </header>
      {demo.description ? <p className="demo__description">
          <InlineCode text={demo.description} />
        </p> : null}
      <div className="demo__stage">{Demo ? <Demo /> : <p role="alert">Demo `{demo.id}` is not registered in demos/registry.ts.</p>}</div>
    </section>
  );
}
