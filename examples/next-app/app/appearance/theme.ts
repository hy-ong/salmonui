import type { SalmonThemeInput } from '@salmonui/core/theme';

// Shared by the Server Component (ThemeStyle) and the Client Component
// (ThemeProvider): equal input produces the same theme hash on both sides.
export const appearanceTheme: SalmonThemeInput = {
  colors: { primary: '#0e4d5c', success: '#0c8f54', warning: '#d4690b', danger: '#d62f23', info: '#0e4d5c' },
  colorScheme: 'light',
  density: 'compact',
  fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  neutral: { chroma: 0.032 },
  surfaces: { sidebar: '#192225', appBar: '#ffffff', tableHeader: 'primary' },
};
