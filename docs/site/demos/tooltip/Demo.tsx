'use client';
import { Button } from '@salmonui/buttons/button';
import { Tooltip } from '@salmonui/overlays/tooltip';

export default function TooltipDemo() {
  return (
    <div>
      <div className="demo-toolbar">
        <Tooltip.Provider delay={300}>
          <Tooltip content="Bold (Ctrl+B)">
            <Button aria-label="Bold" iconOnly variant="outline">
              B
            </Button>
          </Tooltip>
          <Tooltip content="Italic (Ctrl+I)">
            <Button aria-label="Italic" iconOnly variant="outline">
              I
            </Button>
          </Tooltip>
          <Tooltip content="Underline (Ctrl+U)" placement="bottom">
            <Button aria-label="Underline" iconOnly variant="outline">
              U
            </Button>
          </Tooltip>
        </Tooltip.Provider>
        <Tooltip content="Removes the order permanently" placement="end" render={(props) => <Button {...props} tone="danger">Delete</Button>} />
      </div>
    </div>
  );
}
