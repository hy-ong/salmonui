import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/layout/avatar`: Avatar and AvatarGroup.
// Render-safe and server-component friendly: no 'use client' on this entry;
// the only client code is the image error island (`avatar/image.tsx`).
export { Avatar, AvatarGroup, initialsOf } from './avatar/Avatar.js';
export type { AvatarProps, AvatarGroupProps, AvatarSize, AvatarShape, AvatarTone, AvatarVariant } from './avatar/Avatar.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/layout/avatar', 'salmon-avatar');
