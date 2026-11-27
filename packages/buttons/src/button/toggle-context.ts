import { createContext } from 'react';
import type { ChangeSource } from './context.js';

/** Selection state a `ToggleButtonGroup` shares with its `ToggleButton` items. */
export interface ToggleGroupState {
  readonly mode: 'single' | 'multiple';
  readonly disabled: boolean;
  /** The value that holds the group's single tab stop (roving tabindex). */
  readonly tabStop: string | null;
  isSelected(value: string): boolean;
  toggle(value: string, source: ChangeSource): void;
  focused(value: string): void;
}

export const ToggleGroupContext = createContext<ToggleGroupState | null>(null);
