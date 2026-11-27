import { createContext } from 'react';

/** Color role of a button. */
export type ButtonTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
/** Visual weight; `chip` is the compact pill of choice and filter chips. */
export type ButtonVariant = 'solid' | 'outline' | 'ghost' | 'link' | 'chip';
/** One of three fixed metric sets; not a density token. */
export type ButtonSize = 'sm' | 'md' | 'lg';

/** Style defaults a group passes to its buttons; a child's own prop wins. */
export interface ButtonGroupStyle {
  readonly variant?: ButtonVariant | undefined;
  readonly tone?: ButtonTone | undefined;
  readonly size?: ButtonSize | undefined;
  readonly disabled?: boolean | undefined;
}

export const ButtonGroupContext = createContext<ButtonGroupStyle | null>(null);


/** Runs the user's handler, then ours unless the user called `preventDefault()`. */
export function compose<E extends { readonly defaultPrevented: boolean }>(user: ((event: E) => void) | undefined, own: ((event: E) => void) | undefined): ((event: E) => void) | undefined {
  if (!own) return user;
  if (!user) return own;
  return (event) => {
    user(event);
    if (!event.defaultPrevented) own(event);
  };
}

/** Where a change came from. */
export type ChangeSource = 'pointer' | 'keyboard' | 'touch' | 'api';

/** Frozen event object of a change callback. */
export interface ChangeEvent<Reason extends string = string> {
  readonly source: ChangeSource;
  readonly reason: Reason;
}

/** `repeat` option of `Button`. */
export interface ButtonRepeatOptions {
  /** Hold time before the first repeat, in ms. Default 400. */
  delay?: number;
  /** Time between repeats, in ms (pointer and keyboard). Default 100. */
  interval?: number;
}

/** Event of `onRepeat`: `count` starts at 1 for each hold. */
export interface ButtonRepeatEvent {
  readonly count: number;
  readonly source: ChangeSource;
}
