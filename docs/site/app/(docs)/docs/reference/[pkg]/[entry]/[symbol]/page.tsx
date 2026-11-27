import { notFound } from 'next/navigation';
import { ReferenceSymbol, referenceSymbolMetadata } from '../../../../../../../components/ReferenceSymbol';
import { getApiEntry, getSymbolPages, entryHref } from '../../../../../../../lib/api-reference';

type Params = { pkg: string; entry: string; symbol: string };

export const dynamicParams = false;

/** `/docs/reference/<pkg>/<entry>/<symbol>`: the symbol pages whose home is a subpath entry. */
export function generateStaticParams(): Params[] {
  return getSymbolPages()
    .pages.filter((page) => page.entry.subpath !== '.')
    .map((page) => ({ pkg: page.pkg.slug, entry: page.entry.slug, symbol: page.slug }));
}

function resolve({ pkg, entry, symbol }: Params) {
  const found = getApiEntry(pkg, entry);
  if (!found || found.entry.subpath === '.') return undefined;
  return getSymbolPages().byHref.get(`${entryHref(found.pkg, found.entry)}/${decodeURIComponent(symbol)}`);
}

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const page = resolve(await params);
  return page ? referenceSymbolMetadata(page) : {};
}

export default async function ReferenceSymbolPage({ params }: { params: Promise<Params> }) {
  const page = resolve(await params);
  if (!page) notFound();
  return <ReferenceSymbol page={page} />;
}
