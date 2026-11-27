// Type contract of `@salmonui/buttons/button`. Compiles against dist/*.d.ts.
import { Button, ButtonGroup, ToggleButton, ToggleButtonGroup, type ButtonProps, type ButtonRepeatEvent, type ToggleChangeEvent } from '@salmonui/buttons/button';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(_: T): void => undefined;

// iconOnly narrows the props to require an accessible name.
export const iconOnlyLabel = <Button iconOnly aria-label="Delete" iconStart={<svg />} />;
export const iconOnlyLabelledBy = <Button iconOnly aria-labelledby="delete-label" iconStart={<svg />} />;
// @ts-expect-error an icon-only button without aria-label or aria-labelledby
export const iconOnlyNoName = <Button iconOnly iconStart={<svg />} />;

// Tones, variants, sizes are closed unions.
export const toned = <Button tone="danger" variant="outline" size="lg">Delete</Button>;
// @ts-expect-error unknown tone
export const badTone = <Button tone="brand">x</Button>;
// @ts-expect-error unknown size (no density tokens)
export const badSize = <Button size="xl">x</Button>;

// render spreads onto any element.
export const link = <Button render={(props) => <a {...props} href="/orders" />}>Orders</Button>;

// onRepeat event.
export const repeat = <Button repeat={{ delay: 300, interval: 50 }} onRepeat={(event) => expectType<Equal<typeof event, ButtonRepeatEvent>>(true)}>+</Button>;

// floating positions.
export const fab = <Button floating="topStart" floatingScope="parent" iconOnly aria-label="Add" />;
// @ts-expect-error physical positions are not offered
export const fabPhysical = <Button floating="bottomRight">x</Button>;

// Triads.
export const toggle = <ToggleButton pressed onPressedChange={(pressed: boolean, event: ToggleChangeEvent) => [pressed, event.reason]}>Bold</ToggleButton>;
export const single = (
  <ToggleButtonGroup aria-label="Align" value={null} onValueChange={(value: string | null) => value}>
    <ToggleButton value="left">Left</ToggleButton>
  </ToggleButtonGroup>
);
export const multiple = (
  <ToggleButtonGroup aria-label="Style" selectionMode="multiple" defaultValue={['bold']} onValueChange={(value: readonly string[]) => value}>
    <ToggleButton value="bold">Bold</ToggleButton>
  </ToggleButtonGroup>
);
// @ts-expect-error multiple mode takes an array
export const multipleWrong = <ToggleButtonGroup aria-label="Style" selectionMode="multiple" value="bold" />;
export const group = <ButtonGroup aria-label="Actions" variant="outline" orientation="vertical" attached={false} />;

export const props: ButtonProps = { children: 'Save', type: 'submit' };
