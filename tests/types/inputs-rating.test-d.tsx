// Type contract of @salmonui/react/rating. Compiles against dist/*.d.ts.
import { Rating, type RatingChangeDetails, type RatingItemState } from '@salmonui/inputs/rating';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(_: T): void => undefined;

export const stars = (
  <Rating
    label="R"
    value={3}
    onValueChange={(v: number, d: RatingChangeDetails) => [v, d.reason === 'select' || d.reason === 'clear' || d.reason === 'reset']}
    onHoverChange={(v: number | null) => v}
    renderItem={({ index, state }: { index: number; state: RatingItemState }) => `${index}${state}`}
    labelPlacement="top"
    ref={(el: HTMLElement | null) => void el}
  />
);
// @ts-expect-error labelPlacement is top, bottom, start or end
export const badPlacement = <Rating labelPlacement="left" />;
// @ts-expect-error precision is full, half, quarter or exact
export const badPrecision = <Rating precision="third" />;
