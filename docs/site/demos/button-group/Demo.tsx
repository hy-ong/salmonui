'use client';

import { Button, ButtonGroup } from '@salmonui/buttons/button';

// Attached and spaced groups, a vertical group and per-button overrides.
export default function ButtonGroupDemo() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 16 }}>
      <ButtonGroup aria-label="Clipboard" variant="outline">
        <Button>Cut</Button>
        <Button>Copy</Button>
        <Button>Paste</Button>
      </ButtonGroup>
      <ButtonGroup aria-label="Record" tone="primary">
        <Button>Save</Button>
        <Button tone="danger">Delete</Button>
      </ButtonGroup>
      <ButtonGroup aria-label="Navigation" orientation="vertical" variant="ghost">
        <Button>Inbox</Button>
        <Button>Drafts</Button>
        <Button>Sent</Button>
      </ButtonGroup>
      <ButtonGroup aria-label="Dialog actions" attached={false}>
        <Button>Cancel</Button>
        <Button tone="primary">Confirm</Button>
      </ButtonGroup>
      <ButtonGroup aria-label="Disabled group" disabled>
        <Button>One</Button>
        <Button>Two</Button>
      </ButtonGroup>
    </div>
  );
}
