// SidebarMenu browser page (tests/browser/sidebar-menu.spec.ts, sidebar-menu-a11y.spec.ts):
//
//   ?dir=rtl            renders the page right-to-left
//   ?scheme=dark        dark color scheme
//   ?surface=dark       sets the sidebar surface variables (a dark sider) on the page
//   ?mode=hydrate       server-renders the page with renderToString, then hydrates it (window.__ssrHtml, __hydrated)
//
// #grouped: grouped navigation with router links (renderLink; clicks push history
// and update the location state). #rail: the same items collapsed in a 64px
// SidebarLayout rail. #plain: uncontrolled, defaultExpanded="all", plain <a> links.
// Every callback appends to window.__events; window.__location is the router path.
import { StrictMode, useState, type MouseEvent, type ReactNode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import "@salmonui/core/styles.css";
import "@salmonui/navigation/sidebar-layout/styles.css";
import "@salmonui/navigation/sidebar-menu/styles.css";
import { ThemeProvider } from "@salmonui/core/theme";
import { SidebarLayout, SidebarMain, SidebarPanel, SidebarTrigger } from "@salmonui/navigation/sidebar-layout";
import { SidebarMenu, type SidebarMenuEntry, type SidebarMenuLinkProps } from "@salmonui/navigation/sidebar-menu";

const params = new URLSearchParams(location.search);
const dir = params.get("dir") === "rtl" ? "rtl" : "ltr";

const win = window as unknown as { __events: unknown[]; __location?: string };
win.__events = [];
const log = (...entry: unknown[]): void => void win.__events.push(entry);

const icon = (d: string): ReactNode => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const ITEMS: SidebarMenuEntry[] = [
  {
    type: "group",
    id: "workspace",
    label: "Workspace",
    children: [
      { id: "overview", label: "Overview", href: "/workspace/overview", icon: icon("M2 9h5V2H2zM9 14h5V7H9zM2 14h5v-3H2zM9 5h5V2H9z") },
      { id: "analytics", label: "Analytics", href: "/workspace/analytics", icon: icon("M2 14h12M4 11V7M8 11V3M12 11V6") },
      { id: "orders", label: "Orders", href: "/workspace/orders", icon: icon("M2 2h2l2 8h7l1-5H5"), badge: <span className="count">12</span> },
    ],
  },
  {
    type: "group",
    id: "operations",
    label: "Operations",
    children: [
      {
        id: "commerce",
        label: "Commerce",
        icon: icon("M2 6l1-4h10l1 4M3 6v8h10V6M6 14v-4h4v4"),
        children: [
          { id: "products", label: "Products", href: "/operations/commerce/products" },
          { id: "promotions", label: "Promotions", href: "/operations/commerce/promotions" },
          { id: "subscriptions", label: "Subscriptions", href: "/operations/commerce/subscriptions", disabled: true },
        ],
      },
      {
        id: "customers",
        label: "Customers",
        icon: icon("M6 7a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM1.5 14c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M11 2.5a2.5 2.5 0 010 4.5M14.5 14c0-2-1-3.3-2.5-3.8"),
        children: [
          { id: "segments", label: "Segments", href: "/operations/customers/segments" },
          {
            id: "support",
            label: "Support",
            children: [
              { id: "cases", label: "Cases", href: "/operations/customers/support/cases" },
              { id: "feedback", label: "Feedback", href: "/operations/customers/support/feedback" },
            ],
          },
        ],
      },
      { id: "payments", label: "Payments", href: "/operations/payments", icon: icon("M2 4h12v8H2zM2 7h12") },
    ],
  },
  {
    type: "group",
    id: "system",
    label: "System",
    children: [
      { id: "settings", label: "Settings", href: "/system/settings", icon: icon("M8 10a2 2 0 100-4 2 2 0 000 4zM8 1v2M8 13v2M1 8h2M13 8h2") },
      { id: "help", label: "Help", icon: icon("M8 15A7 7 0 108 1a7 7 0 000 14zM6 6a2 2 0 113 1.7c-.6.4-1 .8-1 1.3M8 11.5v.01") },
    ],
  },
];

const PATHS = new Map<string, string>();
const walk = (list: readonly SidebarMenuEntry[]): void => {
  for (const e of list) {
    if ("href" in e && e.href) PATHS.set(e.href, e.id);
    if (e.children) walk(e.children);
  }
};
walk(ITEMS);

/** A minimal client router link: a plain click pushes history instead of loading the page. */
function RouterLink(props: SidebarMenuLinkProps & { navigate: (href: string) => void }) {
  const { navigate, ...rest } = props;
  return (
    <a
      {...rest}
      data-router=""
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(rest.href);
      }}
    />
  );
}

const surface =
  params.get("surface") === "dark"
    ? ({
        "--salmon-surface-sidebar-bg": "#192225",
        "--salmon-surface-sidebar-fg": "rgba(255, 255, 255, 0.85)",
        "--salmon-surface-sidebar-hover": "rgba(255, 255, 255, 0.08)",
        "--salmon-surface-sidebar-selected-bg": "#3a484c",
        "--salmon-surface-sidebar-selected-fg": "#ffffff",
        "--salmon-surface-sidebar-border": "rgba(255, 255, 255, 0.12)",
      } as Record<string, string>)
    : undefined;

function Page() {
  const [path, setPath] = useState("/workspace/orders");
  win.__location = path;
  const navigate = (href: string): void => {
    log("navigate", href);
    setPath(href);
  };
  const selected = PATHS.get(path) ?? null;
  const [collapsed, setCollapsed] = useState(true);
  return (
    <ThemeProvider theme={{ colorScheme: params.get("scheme") === "dark" ? "dark" : "light" }}>
      <div dir={dir} data-salmon-a11y-root="" style={{ display: "flex", gap: 24, alignItems: "flex-start", padding: 16, minBlockSize: "100vh", boxSizing: "border-box", background: "var(--salmon-surface-base)", color: "var(--salmon-text-primary)", ...surface }}>
        <div style={{ inlineSize: 232, background: "var(--salmon-surface-sidebar-bg, var(--salmon-surface-raised))", border: "1px solid var(--salmon-border-subtle)" }}>
          <SidebarMenu
            id="grouped"
            aria-label="Main navigation"
            items={ITEMS}
            selected={selected}
            defaultExpanded="all"
            renderLink={(props) => <RouterLink {...props} navigate={navigate} />}
            onSelectedChange={(id, event) => log("selected", id, event.source)}
            onExpandedChange={(ids, event) => log("expanded", event.id, event.expanded, event.source)}
            onItemClick={(item) => log("click", item.id)}
          />
        </div>

        <SidebarLayout
          id="rail-layout"
          collapsed={collapsed}
          onCollapsedChange={(next) => setCollapsed(next)}
          railSize="64px"
          size="232px"
          style={{ blockSize: 520, inlineSize: 420, border: "1px solid var(--salmon-border-subtle)" }}
        >
          <SidebarPanel style={{ background: "var(--salmon-surface-sidebar-bg, var(--salmon-surface-raised))" }} aria-label="Rail panel">
            <SidebarMenu
              id="rail"
              aria-label="Rail navigation"
              items={ITEMS}
              collapsed={collapsed}
              selected={selected}
              renderLink={(props) => <RouterLink {...props} navigate={navigate} />}
              onSelectedChange={(id, event) => log("rail-selected", id, event.source)}
            />
          </SidebarPanel>
          <SidebarMain>
            <div style={{ padding: 12 }}>
              <SidebarTrigger id="rail-trigger" action="collapse" />
              <p id="location">{path}</p>
            </div>
          </SidebarMain>
        </SidebarLayout>

        <div style={{ inlineSize: 232, border: "1px solid var(--salmon-border-subtle)" }}>
          <SidebarMenu id="plain" aria-label="Plain navigation" items={ITEMS} defaultSelected="segments" onSelectedChange={(id) => log("plain-selected", id)} />
        </div>
      </div>
    </ThemeProvider>
  );
}

const root = document.getElementById("root");
const mode = params.get("mode");
if (root && mode === "hydrate") {
  const html = renderToString(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
  (window as unknown as { __ssrHtml: string }).__ssrHtml = html;
  root.innerHTML = html;
  hydrateRoot(
    root,
    <StrictMode>
      <Page />
    </StrictMode>,
    { onRecoverableError: (error) => console.error("recoverable", error) },
  );
  requestAnimationFrame(() => ((window as unknown as { __hydrated: boolean }).__hydrated = true));
} else if (root) {
  createRoot(root).render(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
}
