'use client';

// The LocaleProvider with the zh-TW pack in a client wrapper: the pack has function-valued keys, which cannot cross from a
// Server Component to a Client Component as props.
import type { ReactNode } from 'react';
import { LocaleProvider } from '@salmonui/core/locale';
import { zhTW } from '@salmonui/core/locale/zh-TW';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider locale="zh-TW" localeText={zhTW}>
      {children}
    </LocaleProvider>
  );
}
