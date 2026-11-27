import { notFound } from 'next/navigation';
import { ReferenceEntry, referenceEntryMetadata } from '../../../../../../components/ReferenceEntry';
import { ReferenceSymbol, referenceSymbolMetadata } from '../../../../../../components/ReferenceSymbol';
import { getApiEntry, getApiReference, getSymbolPages, packageHref } from '../../../../../../lib/api-reference';

type Params = { pkg: string; entry: string };

export const dynamicParams = false;

/**
 * `/docs/reference/<pkg>/<entry>` (every subpath entry; the `.` entry is the
 * package route, `../page.tsx`) and `/docs/reference/<pkg>/<symbol>` (the
 * root entry's symbol pages). Symbol slugs never equal a subpath entry slug
 * of the package, ignoring case.
 */
export function generateStaticParams(): Params[] {
  const reference = getApiReference();
  const entries = reference.packages.flatMap((pkg) =>
    pkg.entries.filter((entry) => entry.subpath !== '.').map((entry) => ({ pkg: pkg.slug, entry: entry.slug })),
  );
  const symbols = getSymbolPages()
    .pages.filter((page) => page.entry.subpath === '.')
    .map((page) => ({ pkg: page.pkg.slug, entry: page.slug }));
  return [...entries, ...symbols];
}

function resolve({ pkg, entry }: Params) {
  const found = getApiEntry(pkg, entry);
  if (found && found.entry.subpath !== '.') return { kind: 'entry' as const, ...found };
  const page = getSymbolPages().byHref.get(`${packageHref({ slug: pkg })}/${decodeURIComponent(entry)}`);
  return page && page.entry.subpath === '.' ? { kind: 'symbol' as const, page } : undefined;
}

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const found = resolve(await params);
  if (!found) return {};
  return found.kind === 'entry' ? referenceEntryMetadata(found.pkg, found.entry) : referenceSymbolMetadata(found.page);
}

export default async function ReferenceSubpathPage({ params }: { params: Promise<Params> }) {
  const found = resolve(await params);
  if (!found) notFound();
  return found.kind === 'entry' ? <ReferenceEntry pkg={found.pkg} entry={found.entry} /> : <ReferenceSymbol page={found.page} />;
}
