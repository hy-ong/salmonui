'use client';
import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { TextField } from '@salmonui/inputs/text-field';
import { Toolbar, ToolbarItem, ToolbarSpacer } from '@salmonui/navigation/toolbar';
import { ThemeStyle } from '@salmonui/core/server';
import { ThemeProvider, type SalmonThemeInput } from '@salmonui/core/theme';

const paragraphs = Array.from({ length: 8 }, (_, index) => `Section ${index + 1}: scroll this frame to see whether the bar stays in view.`);

// A theme with an app bar surface: the bar opts in with data-salmon-surface="app-bar".
const surfaceTheme: SalmonThemeInput = { surfaces: { appBar: '#192225' } };

export default function AppBarRecipeDemo() {
  const [primary, setPrimary] = useState(true);
  const [surface, setSurface] = useState(false);
  const [bottom, setBottom] = useState(false);
  const [sticky, setSticky] = useState(true);
  const Bar = bottom ? 'footer' : 'header';
  const bar = (
    <Bar
      className="salmon-app-bar"
      data-salmon-surface="app-bar"
      data-tone={primary && !surface ? 'primary' : undefined}
      data-position={bottom ? 'bottom' : undefined}
      data-sticky={sticky ? '' : undefined}
    >
      <Toolbar aria-label="Application" overflow="wrap">
        <strong style={{ paddingInline: 8 }}>Acme</strong>
        <Button variant="ghost">Products</Button>
        <Button variant="ghost">Pricing</Button>
        <ToolbarSpacer />
        <ToolbarItem overflow="never">
          <TextField type="search" aria-label="Search" placeholder="Search" />
        </ToolbarItem>
        <Button variant="ghost">Sign in</Button>
      </Toolbar>
    </Bar>
  );
  // A scrolling frame stands in for the page so the sticky bar can be seen.
  const frame = (
    <div tabIndex={0} role="region" aria-label="Scrolling page" style={{ maxBlockSize: 240, overflow: 'auto', border: '1px solid var(--salmon-border-subtle)', borderRadius: 'var(--salmon-radius-lg)' }}>
      {bottom ? null : bar}
      {paragraphs.map((text) => (
        <p key={text} style={{ margin: 0, padding: '12px 16px' }}>
          {text}
        </p>
      ))}
      {bottom ? bar : null}
    </div>
  );
  return (
    <div>
      <div className="demo-toolbar">
        <Checkbox checked={primary} disabled={surface} onCheckedChange={(checked) => setPrimary(checked)}>
          Primary tone
        </Checkbox>
        <Checkbox checked={surface} onCheckedChange={(checked) => setSurface(checked)}>
          Theme surface
        </Checkbox>
        <Checkbox checked={bottom} onCheckedChange={(checked) => setBottom(checked)}>
          Bottom position
        </Checkbox>
        <Checkbox checked={sticky} onCheckedChange={(checked) => setSticky(checked)}>
          Sticky
        </Checkbox>
      </div>
      {surface ? (
        <>
          <ThemeStyle theme={surfaceTheme} />
          <ThemeProvider theme={surfaceTheme}>{frame}</ThemeProvider>
        </>
      ) : (
        frame
      )}
    </div>
  );
}
