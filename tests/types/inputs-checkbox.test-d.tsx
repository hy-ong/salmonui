// Type contract of @salmonui/react/checkbox. Compiles against dist/*.d.ts.
import { Checkbox, CheckboxGroup, type CheckboxGroupChangeDetails, type CheckedChangeDetails } from '@salmonui/inputs/checkbox';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(_: T): void => undefined;

export const one = <Checkbox checked onCheckedChange={(checked: boolean, d: CheckedChangeDetails) => [checked, d.reason === 'toggle' || d.reason === 'reset', d.source]} indeterminate labelPlacement="start" ref={(el: HTMLInputElement | null) => void el}>A</Checkbox>;
export const group = (
  <CheckboxGroup label="G" value={['a']} onValueChange={(v: readonly string[], d: CheckboxGroupChangeDetails) => [v, d.item]} ref={(el: HTMLFieldSetElement | null) => void el}>
    <Checkbox value="a">A</Checkbox>
  </CheckboxGroup>
);
// @ts-expect-error the checked value is a boolean
export const bad = <Checkbox checked="yes" />;
// @ts-expect-error labelPlacement is start or end
export const badPlacement = <Checkbox labelPlacement="top" />;
