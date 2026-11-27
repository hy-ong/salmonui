// Type contract of @salmonui/react/otp-field. Compiles against dist/*.d.ts.
import { OtpField, type OtpChangeDetails } from '@salmonui/inputs/otp-field';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const expectType = <T extends true>(_: T): void => undefined;

export const code = <OtpField label="Code" length={6} value="12" onValueChange={(v: string, d: OtpChangeDetails) => [v, d.reason === 'paste']} onComplete={(v: string) => v} separator="-" groupSize={3} ref={(el: HTMLInputElement | null) => void el} />;
// @ts-expect-error type is numeric, alphanumeric or text
export const badType = <OtpField type="password" />;
// @ts-expect-error maxLength comes from length
export const badMax = <OtpField maxLength={4} />;
