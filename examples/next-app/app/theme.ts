import type { SalmonThemeInput } from '@salmonui/core/theme';

// Shared by the Server Component (ThemeStyle) and the Client Component
// (ThemeProvider): equal seeds produce the same theme hash on both sides.
export const theme: SalmonThemeInput = { colors: { primary: '#0f766e' }, colorScheme: 'auto' };
