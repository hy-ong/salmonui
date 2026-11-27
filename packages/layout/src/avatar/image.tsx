'use client';

// The one client island of Avatar: the image is server-rendered
// over the initials and hidden on `error`. An error that fired before
// hydration is caught by the layout effect (`complete` with no natural
// size). `hidden` is a DOM write React never owns, so it is no hydration
// difference.

import { useLayoutEffect, useRef, type ReactElement, type SyntheticEvent } from 'react';

const hide = (img: HTMLImageElement): void => {
  img.hidden = true;
};

export function AvatarImage(props: { readonly src: string; readonly className: string }): ReactElement {
  const ref = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    const img = ref.current;
    if (img) {
      img.hidden = false;
      if (img.complete && img.naturalWidth === 0) hide(img);
    }
  }, [props.src]);
  return <img ref={ref} src={props.src} alt="" className={props.className} onError={(event: SyntheticEvent<HTMLImageElement>) => hide(event.currentTarget)} />;
}
