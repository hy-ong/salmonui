import { notFound } from 'next/navigation';
import { ReferenceEntry, referenceEntryMetadata } from '../../../../../components/ReferenceEntry';
import { getApiReference, getRootEntry } from '../../../../../lib/api-reference';

type Params = { pkg: string };

export const dynamicParams = false;

/** Every package with a `.` entry. */
export function generateStaticParams(): Params[] {
  return getApiReference()
    .packages.filter((pkg) => getRootEntry(pkg.slug))
    .map((pkg) => ({ pkg: pkg.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const found = getRootEntry((await params).pkg);
  return found ? referenceEntryMetadata(found.pkg, found.entry) : {};
}

/** `/docs/reference/<pkg>`: the package root entry point (`.`). */
export default async function ReferencePackagePage({ params }: { params: Promise<Params> }) {
  const found = getRootEntry((await params).pkg);
  if (!found) notFound();
  return <ReferenceEntry pkg={found.pkg} entry={found.entry} />;
}
