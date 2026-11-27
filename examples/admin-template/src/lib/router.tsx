// A small history-API router: a nested route table with `:params` and a `*`
// catch-all, redirects, an <Outlet> per level, <Link>, a navigation blocker
// (with the browser's beforeunload prompt) and per-route title and
// breadcrumbs. About 200 lines; replace it with any router.
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type ComponentType,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

export interface RouteMeta {
  readonly title: string;
  readonly breadcrumbs: readonly string[];
}

export interface RouteDef {
  readonly id: string;
  /** Absolute at the top level, relative under a parent; `:name` is a param, `*` matches the rest. */
  readonly path: string;
  readonly component?: ComponentType;
  readonly redirect?: string;
  readonly meta?: RouteMeta;
  readonly children?: readonly RouteDef[];
}

export interface RouteMatch {
  readonly route: RouteDef;
  readonly params: Readonly<Record<string, string>>;
}

export interface NavigateOptions {
  readonly replace?: boolean;
  /** Skips the active blocker (a save that closes the editor). */
  readonly ignoreBlocker?: boolean;
}

/** Returns whether the navigation may proceed (ask the user here). */
export type Blocker = () => boolean | Promise<boolean>;

interface RouterValue {
  readonly pathname: string;
  readonly matches: readonly RouteMatch[];
  navigate(to: string, options?: NavigateOptions): Promise<boolean>;
  setBlocker(blocker: Blocker | null): void;
}

const RouterContext = createContext<RouterValue | null>(null);
const DepthContext = createContext(0);

const split = (path: string): string[] => path.split('/').filter(Boolean);
/** No trailing slash, except the root. */
export const normalize = (pathname: string): string => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname) || '/';

function matchRoutes(routes: readonly RouteDef[], segments: readonly string[], params: Record<string, string>): RouteMatch[] | null {
  for (const route of routes) {
    const parts = split(route.path);
    const own = { ...params };
    let i = 0;
    let ok = true;
    for (const part of parts) {
      if (part === '*') {
        own['*'] = segments.slice(i).join('/');
        i = segments.length;
        break;
      }
      const segment = segments[i];
      if (segment === undefined) {
        ok = false;
        break;
      }
      if (part.startsWith(':')) own[part.slice(1)] = decodeURIComponent(segment);
      else if (part !== segment) {
        ok = false;
        break;
      }
      i++;
    }
    if (!ok) continue;
    const rest = segments.slice(i);
    if (rest.length === 0) return [{ route, params: own }];
    if (route.children) {
      const inner = matchRoutes(route.children, rest, own);
      if (inner) return [{ route, params: own }, ...inner];
    }
  }
  return null;
}

const readPathname = (): string => normalize(window.location.pathname);

/**
 * The location the routes render: it follows the pushState / replaceState of
 * `navigate` and the browser's back / forward, except a back / forward the
 * blocker refuses (the left entry is pushed back while it asks).
 */
function createLocationStore() {
  const listeners = new Set<() => void>();
  let path = typeof window === 'undefined' ? '/' : readPathname();
  let blocker: Blocker | null = null;
  const set = (next: string): void => {
    if (next === path) return;
    path = next;
    listeners.forEach((listener) => listener());
  };
  const onPop = (): void => {
    const target = readPathname();
    const check = blocker;
    if (!check || target === path) return set(target);
    const left = path;
    window.history.pushState(null, '', left);
    void Promise.resolve(check()).then((ok) => {
      if (!ok) return;
      window.history.replaceState(null, '', target);
      set(target);
    });
  };
  return {
    get: (): string => path,
    subscribe(listener: () => void): () => void {
      if (listeners.size === 0) window.addEventListener('popstate', onPop);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) window.removeEventListener('popstate', onPop);
      };
    },
    push(to: string, replace: boolean): void {
      window.history[replace ? 'replaceState' : 'pushState'](null, '', to);
      set(readPathname());
    },
    blocker: (): Blocker | null => blocker,
    setBlocker(next: Blocker | null): void {
      blocker = next;
    },
  };
}

export function RouterProvider({ routes, layout: Layout }: { readonly routes: readonly RouteDef[]; readonly layout: ComponentType }): ReactElement {
  const [store] = useState(createLocationStore);
  const pathname = useSyncExternalStore(store.subscribe, store.get, () => '/');

  const go = useCallback(
    (to: string, replace: boolean): void => {
      if (to === window.location.pathname + window.location.search) return;
      store.push(to, replace);
    },
    [store],
  );

  const navigate = useCallback(
    async (to: string, options: NavigateOptions = {}): Promise<boolean> => {
      const check = store.blocker();
      if (!options.ignoreBlocker && check && normalize(to) !== store.get() && !(await check())) return false;
      go(to, options.replace ?? false);
      return true;
    },
    [go, store],
  );

  const matches = useMemo(() => matchRoutes(routes, split(pathname), {}) ?? [], [routes, pathname]);
  const redirect = matches.at(-1)?.route.redirect;
  useEffect(() => {
    if (redirect) go(redirect, true);
  }, [redirect, go]);

  const value = useMemo<RouterValue>(
    () => ({
      pathname,
      matches: redirect ? [] : matches,
      navigate,
      setBlocker: store.setBlocker,
    }),
    [pathname, matches, redirect, navigate, store],
  );
  return (
    <RouterContext value={value}>
      <DepthContext value={0}>
        <Layout />
      </DepthContext>
    </RouterContext>
  );
}

export function useRouter(): RouterValue {
  const value = use(RouterContext);
  if (!value) throw new Error('useRouter must be used inside <RouterProvider>');
  return value;
}

/** Params of the deepest match. */
export function useParams(): Readonly<Record<string, string>> {
  return useRouter().matches.at(-1)?.params ?? {};
}

/** Meta of the deepest match that has one. */
export function useRouteMeta(): RouteMeta | undefined {
  const { matches } = useRouter();
  for (let i = matches.length - 1; i >= 0; i--) {
    const meta = matches[i]!.route.meta;
    if (meta) return meta;
  }
  return undefined;
}

/** Renders the route of the next nesting level. */
export function Outlet(): ReactNode {
  const depth = use(DepthContext);
  const match = useRouter().matches[depth];
  const Component = match?.route.component;
  if (!Component) return null;
  return (
    <DepthContext value={depth + 1}>
      <Component />
    </DepthContext>
  );
}

/** A plain left click without modifiers: the router handles it; anything else opens a tab or window. */
export const isPlainClick = (event: MouseEvent<HTMLElement>): boolean =>
  !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  readonly to: string;
  readonly replace?: boolean;
}

export function Link({ to, replace, onClick, ...rest }: LinkProps): ReactElement {
  const { navigate } = useRouter();
  return (
    <a
      {...rest}
      href={to}
      onClick={(event) => {
        onClick?.(event);
        if (!isPlainClick(event)) return;
        event.preventDefault();
        void navigate(to, replace ? { replace } : {});
      }}
    />
  );
}

/**
 * While `blocker` is set, router navigations and back / forward ask it first,
 * and `beforeUnload` turns on the browser's leave-page prompt.
 */
export function useBlocker(blocker: Blocker | null, beforeUnload: boolean): void {
  const { setBlocker } = useRouter();
  useEffect(() => {
    setBlocker(blocker);
    return () => setBlocker(null);
  }, [blocker, setBlocker]);
  useEffect(() => {
    if (!beforeUnload) return;
    const onBeforeUnload = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [beforeUnload]);
}
