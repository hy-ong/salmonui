import { useState } from 'react';

export interface Mutation<A, R> {
  readonly isPending: boolean;
  mutate(arg: A): Promise<R>;
}

/** Runs `fn` and tracks whether a call is pending; the promise rejects with the call's error. */
export function useMutation<A, R>(fn: (arg: A) => Promise<R>): Mutation<A, R> {
  const [pending, setPending] = useState(0);
  return {
    isPending: pending > 0,
    async mutate(arg) {
      setPending((n) => n + 1);
      try {
        return await fn(arg);
      } finally {
        setPending((n) => n - 1);
      }
    },
  };
}
