// Static view family registry (`#scheduler-views` on the server, in workers
// and by default): every family module
// is imported, so a server render never suspends and renders the active
// view's markup. The browser resolves registry-lazy.ts instead.

import * as list from './list.js';
import * as resources from './grouping.js';
import * as timeline from './timeline.js';
import type { PeekViews, ReadViews, ViewModules } from './families.js';

const ALL: ViewModules = Object.freeze({ timeline, list, resources });

export const readViews: ReadViews = () => ALL;
export const peekViews: PeekViews = () => ALL;
export const preloadViews = (_names: readonly unknown[]): void => undefined;
