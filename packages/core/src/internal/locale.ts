// Locale scope: the context a `LocaleProvider`
// (`@salmonui/core/locale`) fills. Components read it through the two hooks
// below; without a provider both return the component's own props, so an
// application that never renders a provider pays only this module. The
// merging (and its identity cache) lives in the provider module.

import { createContext, use } from 'react';

/**
 * @internal Value of the nearest `LocaleProvider`: called with a family and a
 * component's own `localeText`, it returns the provider's text for that
 * family under `own` (own keys win), the same object while both inputs are.
 */
export interface LocaleScope {
  <T extends object>(family: string, own: T | undefined): T | undefined;
  readonly locale: string | undefined;
}

/** @internal */
export const LocaleContext = createContext<LocaleScope | null>(null);

/** @internal A component's `localeText`: its own prop over the nearest provider's catalog entry for `family`. */
export const useLocaleText = <T extends object>(family: string, own: T | undefined): T | undefined => use(LocaleContext)?.(family, own) ?? own;

/** @internal A component's `locale`: its own prop, else the nearest provider's. */
export const useLocale = (own: string | undefined): string | undefined => own ?? use(LocaleContext)?.locale;
