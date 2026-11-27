// A Server Component layout that renders the client locale wrapper: every
// Salmon UI client component below reads the zh-TW pack
// (tests/ssr/next-locale.spec.ts).
import type { ReactNode } from 'react';
import '@salmonui/buttons/button/styles.css';
import '@salmonui/navigation/pager/styles.css';
import { Providers } from './providers';

export default function LocaleLayout({ children }: { children: ReactNode }) {
  return (
    <div lang="zh-TW">
      <Providers>{children}</Providers>
    </div>
  );
}
