'use client';

import { useState } from 'react';
import { Switch } from '@salmonui/inputs/switch';

// Uncontrolled and controlled switches; the controlled one vetoes turning on without Wi-Fi.
export default function SwitchBasicsDemo() {
  const [wifi, setWifi] = useState(true);
  const [sync, setSync] = useState(false);
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Switch checked={wifi} onCheckedChange={(on) => (setWifi(on), on || setSync(false))} description={wifi ? 'Connected' : 'Off'}>
        Wi-Fi
      </Switch>
      <Switch labelPlacement="start" defaultChecked thumbIcon="✓">
        Bluetooth
      </Switch>
      <Switch checked={sync} onCheckedChange={(on) => (wifi || !on) && setSync(on)}>
        Sync over Wi-Fi only
      </Switch>
    </div>
  );
}
