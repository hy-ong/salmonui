// Server Component: a compact, tinted theme with region surfaces. ThemeStyle emits its CSS on the server; the shell is
// a Client Component rendered on the server and hydrated.
import { ThemeStyle } from '@salmonui/core/server';
import { AppearanceShell } from './appearance-shell';
import { appearanceTheme } from './theme';

export default function Page() {
  return (
    <>
      <ThemeStyle theme={appearanceTheme} />
      <AppearanceShell />
    </>
  );
}
