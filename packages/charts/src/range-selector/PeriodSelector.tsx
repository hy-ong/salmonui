'use client';

// `PeriodSelector`: the APG Radio Group of the Buttons
// `ToggleButtonGroup selectionMode="single"`, one radio per period. Usable
// alone or above a `RangeSelector` /
// inside `StockChart`.

import type { CSSProperties, ReactNode } from 'react';
import { ToggleButton, ToggleButtonGroup, type ToggleChangeEvent } from '@salmonui/buttons/button';
import { useControllableState } from '@salmonui/core/internal/controllable';
import type { Period } from './period.js';

export interface PeriodSelectorProps {
  readonly periods: readonly Period[];
  readonly value?: string | null | undefined;
  readonly defaultValue?: string | null | undefined;
  readonly onValueChange?: ((value: string | null, event: { readonly source: 'pointer' | 'keyboard' | 'touch' | 'api'; readonly reason: string }) => void) | undefined;
  /** Accessible name of the radio group. Default "Period". */
  readonly 'aria-label'?: string | undefined;
  readonly size?: 'sm' | 'md' | 'lg' | undefined;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
}

export function PeriodSelector(props: PeriodSelectorProps): ReactNode {
  const [value, setValue] = useControllableState<string | null, [ToggleChangeEvent]>(props.value, props.defaultValue ?? null, props.onValueChange, 'PeriodSelector value');
  return (
    <ToggleButtonGroup
      selectionMode="single"
      className={props.className ? `salmon-period-selector ${props.className}` : 'salmon-period-selector'}
      style={props.style}
      aria-label={props['aria-label'] ?? 'Period'}
      size={props.size ?? 'sm'}
      variant="ghost"
      disabled={props.disabled}
      value={value}
      onValueChange={(next, event) => setValue(next, event)}
    >
      {props.periods.map((p) => (
        <ToggleButton key={p.id} value={p.id}>
          {p.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
