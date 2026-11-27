'use client';
import { useState } from 'react';
import { MenuButton, MenuCheckboxItem, MenuRadioGroup, MenuRadioItem, MenuSeparator } from '@salmonui/buttons/menu';

export default function MenuCheckableDemo() {
  const [wrap, setWrap] = useState(true);
  const [minimap, setMinimap] = useState(false);
  const [zoom, setZoom] = useState('100');
  return (
    <div>
      <div className="demo-toolbar">
        <MenuButton
          variant="outline"
          menu={
            <>
              <MenuCheckboxItem checked={wrap} onCheckedChange={setWrap}>
                Word wrap
              </MenuCheckboxItem>
              <MenuCheckboxItem checked={minimap} onCheckedChange={setMinimap}>
                Minimap
              </MenuCheckboxItem>
              <MenuSeparator />
              <MenuRadioGroup label="Zoom" value={zoom} onValueChange={setZoom}>
                <MenuRadioItem value="75">75%</MenuRadioItem>
                <MenuRadioItem value="100">100%</MenuRadioItem>
                <MenuRadioItem value="150">150%</MenuRadioItem>
              </MenuRadioGroup>
            </>
          }
        >
          View
        </MenuButton>
      </div>
      <p>
        Word wrap {wrap ? 'on' : 'off'}, minimap {minimap ? 'on' : 'off'}, zoom {zoom}%. Space toggles an item and keeps the menu open; Enter toggles and closes.
      </p>
    </div>
  );
}
