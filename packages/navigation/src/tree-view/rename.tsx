'use client';
// Inline rename editor, a lazy chunk loaded on the first F2 or
// `api.startRename`. Uncontrolled: the draft lives in the input, never in
// React state. Enter commits, Escape cancels, blur commits.

import { useLayoutEffect, useRef, type ReactNode } from 'react';

export default function RenameEditor(props: { readonly label: string; readonly ariaLabel: string; readonly onDone: (value: string | null) => void }): ReactNode {
  const ref = useRef<HTMLInputElement | null>(null);
  const done = useRef(false);
  const finish = (value: string | null): void => {
    if (done.current) return;
    done.current = true;
    props.onDone(value);
  };
  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="salmon-tree-view-rename"
      defaultValue={props.label}
      aria-label={props.ariaLabel}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          finish(event.currentTarget.value);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          finish(null);
        }
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  );
}
