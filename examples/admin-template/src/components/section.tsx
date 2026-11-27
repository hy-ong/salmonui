import { useId, type ReactNode } from 'react';

export function Section({ title, children }: { readonly title: ReactNode; readonly children: ReactNode }) {
  const titleId = useId();
  return (
    <section className="atlas-section" aria-labelledby={titleId}>
      <h3 id={titleId} className="atlas-section__title">
        {title}
      </h3>
      <div className="atlas-section__content">{children}</div>
    </section>
  );
}

/** A bordered, vertical label / value table (the template's descriptions block). */
export function Descriptions({ items, columns }: { readonly items: readonly { key: string; label: ReactNode; children: ReactNode }[]; readonly columns: 2 | 3 }) {
  return (
    <dl className="atlas-descriptions" data-columns={columns}>
      {items.map((item) => (
        <div key={item.key} className="atlas-descriptions__item">
          <dt>{item.label}</dt>
          <dd>{item.children}</dd>
        </div>
      ))}
    </dl>
  );
}
