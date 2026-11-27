// Helpers shared by the sections of examples/vite-spa/inputs.html.
import type { FormEvent, ReactNode } from 'react';

declare global {
  interface Window {
    __inputs?: Record<string, unknown>[];
    __inputForms?: Record<string, [string, string][]>;
    __inputsReady?: boolean;
  }
}

const params = new URLSearchParams(location.search);
const only = params.get('only')?.split(',') ?? null;
window.__inputs = [];
window.__inputForms = {};
export const log = (entry: Record<string, unknown>): void => void window.__inputs?.push(entry);
export const entries = (form: HTMLFormElement | FormData): [string, string][] =>
  [...(form instanceof FormData ? form : new FormData(form)).entries()].map(([k, v]) => [k, typeof v === 'string' ? v : `file:${(v as File).name}`]);

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  if (only && !only.includes(id)) return null;
  return (
    <section id={id} aria-labelledby={`${id}-title`} style={{ marginBlockEnd: 24, display: 'grid', gap: 12, justifyItems: 'start' }}>
      <h2 id={`${id}-title`} style={{ fontSize: 14 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}


/** onSubmit handler that records the entries of the form under `id` (window.__inputForms) and logs the submit. */
export function submitTo(id: string) {
  return (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    window.__inputForms![id] = entries(e.currentTarget);
    log({ kind: 'submit', form: id });
  };
}
