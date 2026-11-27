// zh-TW locale page: a Server Component page under
// the client LocaleProvider wrapper of ./layout.tsx. tests/ssr/next-locale.spec.ts
// asserts the Traditional Chinese server HTML and a clean hydration.
import { LocalePanel } from './locale-panel';

export const metadata = { title: 'Salmon UI zh-TW locale · Next.js App Router' };

export default function LocalePage() {
  return <LocalePanel />;
}
