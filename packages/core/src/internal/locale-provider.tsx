'use client';

// LocaleProvider: one place for the `locale` and the
// `localeText` defaults of every component below it. The catalog is keyed by
// component family (`pager`, `dataGrid`, `datePicker`, ...); each entry has
// the same keys as that component's `localeText` prop. A component's own
// `localeText` keys win over the provider's, and an inner provider's entries
// win over an outer one's (merged per family, key by key).
//
// Merged objects are cached per scope (per family, then per own `localeText`
// object), so a component sees the same `localeText` object across renders
// while its inputs keep their identity: components that memoize on it (the
// Data Grid compiles its catalog once per object) do not recompute.

import { use, useMemo, type ReactNode } from 'react';
import { LocaleContext, type LocaleScope } from './locale.js';

/**
 * Text catalog of a `LocaleProvider`: per component family, the keys of that
 * component's `localeText` prop. A locale pack (`@salmonui/core/locale/zh-TW`)
 * is one; applications may also pass their own or spread a pack and override.
 */
export type LocaleCatalog = { readonly [family: string]: object | undefined };

export interface LocaleProviderProps {
  /** BCP 47 locale for dates, numbers and plural rules of every component below. Default: the outer provider's. */
  readonly locale?: string | undefined;
  /** Per-family `localeText` defaults. Merged over the outer provider's, key by key. */
  readonly localeText?: LocaleCatalog | undefined;
  readonly children?: ReactNode;
}

function createScope(parent: LocaleScope | null, locale: string | undefined, catalog: LocaleCatalog | undefined): LocaleScope {
  const packs = new Map<string, object | undefined>();
  const merged = new Map<string, WeakMap<object, object>>();
  const packOf = (family: string): object | undefined => {
    if (packs.has(family)) return packs.get(family);
    const outer = parent?.<object>(family, undefined);
    const own = catalog?.[family];
    const pack = outer && own ? { ...outer, ...own } : (own ?? outer);
    packs.set(family, pack);
    return pack;
  };
  const text = <T extends object>(family: string, own: T | undefined): T | undefined => {
    const pack = packOf(family) as T | undefined;
    if (!pack || !own) return own ?? pack;
    let cache = merged.get(family);
    if (!cache) merged.set(family, (cache = new WeakMap()));
    let out = cache.get(own) as T | undefined;
    if (!out) cache.set(own, (out = { ...pack, ...own }));
    return out;
  };
  return Object.assign(text, { locale: locale ?? parent?.locale });
}

/**
 * Sets the `locale` and the `localeText` defaults of every Salmon UI
 * component below it. Renders no element. Without a provider components use
 * their built-in English text and their own `locale` props, and pay nothing
 * for this module.
 */
export function LocaleProvider({ locale, localeText, children }: LocaleProviderProps): ReactNode {
  const parent = use(LocaleContext);
  const scope = useMemo(() => createScope(parent, locale, localeText), [parent, locale, localeText]);
  return <LocaleContext value={scope}>{children}</LocaleContext>;
}

/** The `locale` of the nearest `LocaleProvider`, or undefined outside one. */
export function useLocale(): string | undefined {
  return use(LocaleContext)?.locale;
}
