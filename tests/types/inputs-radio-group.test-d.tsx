// Type contract of @salmonui/react/radio-group. Compiles against dist/*.d.ts.
import { Radio, RadioGroup, type RadioChangeDetails } from '@salmonui/inputs/radio-group';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(_: T): void => undefined;

export const group = (
  <RadioGroup label="Plan" value={null} onValueChange={(v: string, d: RadioChangeDetails) => [v, d.reason === 'select' || d.reason === 'reset']} orientation="horizontal">
    <Radio value="a">A</Radio>
  </RadioGroup>
);
// @ts-expect-error Radio needs a value
export const noValue = <Radio />;
// @ts-expect-error orientation is vertical or horizontal
export const badOrientation = <RadioGroup orientation="grid" />;
