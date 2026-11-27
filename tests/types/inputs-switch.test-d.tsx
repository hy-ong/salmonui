// Type contract of @salmonui/react/switch. Compiles against dist/*.d.ts.
import { Switch, type CheckedChangeDetails } from '@salmonui/inputs/switch';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(_: T): void => undefined;

export const on = <Switch defaultChecked onCheckedChange={(c: boolean, d: CheckedChangeDetails) => [c, d.source]} thumbIcon={<span />} ref={(el: HTMLInputElement | null) => void el}>Wi-Fi</Switch>;
// @ts-expect-error a Switch has no mixed state
export const mixed = <Switch indeterminate />;
