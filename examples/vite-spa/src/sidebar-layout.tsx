// SidebarLayout browser page (tests/browser/sidebar-layout.spec.ts, sidebar-layout-a11y.spec.ts):
//
//   ?dir=rtl            renders the page right-to-left
//   ?scheme=dark        dark color scheme
//   ?mode=hydrate       server-renders the page with renderToString, then hydrates it (window.__ssrHtml, __hydrated)
//   ?w=<px>             inline size of the #adaptive layout's host (default 900)
//   ?warnings           a layout that switches from uncontrolled to controlled (development warning)
//
// Every open / collapsed callback appends to window.__events; window.__veto = true
// makes #push's onBeforeOpenChange cancel; window.__setOpen(bool) drives #controlled.
import { StrictMode, useEffect, useState } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import "@salmonui/core/styles.css";
import "@salmonui/navigation/sidebar-layout/styles.css";
// The overlay presentation renders the dialog core and drawer markup.
import "@salmonui/overlays/drawer/styles.css";
import { ThemeProvider } from "@salmonui/core/theme";
import {
  SidebarLayout,
  SidebarMain,
  SidebarPanel,
  SidebarTrigger,
} from "@salmonui/navigation/sidebar-layout";

const params = new URLSearchParams(location.search);
const dir = params.get("dir") === "rtl" ? "rtl" : "ltr";
const hostWidth = Number(params.get("w") ?? 900);

const win = window as unknown as {
  __events: unknown[];
  __veto?: boolean;
  __setOpen?: (open: boolean) => void;
};
win.__events = [];
const log = (...entry: unknown[]): void => void win.__events.push(entry);

const box = {
  blockSize: 220,
  border: "1px solid var(--salmon-border-default)",
  marginBlockEnd: 16,
} as const;

function Links({ prefix }: { prefix: string }) {
  return (
    <ul style={{ margin: 0, padding: 8, listStyle: "none" }}>
      <li>
        <a id={`${prefix}-link-1`} href="?section=home">
          Home
        </a>
      </li>
      <li>
        <a id={`${prefix}-link-2`} href="?section=orders">
          Orders
        </a>
      </li>
    </ul>
  );
}

function Controlled() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    win.__setOpen = setOpen;
  }, []);
  return (
    <SidebarLayout
      id="controlled"
      open={open}
      onOpenChange={(next, event) =>
        log("controlled", next, event.reason, event.source)
      }
      style={box}
    >
      <SidebarPanel aria-label="Controlled panel">
        <Links prefix="controlled" />
      </SidebarPanel>
      <SidebarMain>
        <SidebarTrigger id="controlled-trigger" />
      </SidebarMain>
    </SidebarLayout>
  );
}

function Warnings() {
  const [open, setOpen] = useState<boolean | undefined>(undefined);
  useEffect(() => setOpen(true), []);
  return (
    <SidebarLayout id="switching" open={open}>
      <SidebarPanel aria-label="Switching panel" />
      <SidebarMain />
    </SidebarLayout>
  );
}

function Page() {
  return (
    <ThemeProvider
      theme={{
        colorScheme: params.get("scheme") === "dark" ? "dark" : "light",
      }}
    >
      <div dir={dir} data-salmon-a11y-root="">
        <SidebarLayout
          id="push"
          className="page-push"
          style={box}
          size={200}
          closeOnOutsidePress
          onBeforeOpenChange={(event) => {
            log("before", event.open, event.reason, event.source);
            if (win.__veto) event.preventDefault();
          }}
          onOpenChange={(open, event) =>
            log("open", open, event.reason, event.source)
          }
        >
          <SidebarPanel navigation aria-label="Main navigation">
            <Links prefix="push" />
          </SidebarPanel>
          <SidebarMain
            render={(props) => <section {...props} aria-label="Push content" />}
          >
            <SidebarTrigger id="push-trigger" />
            <button id="push-outside" type="button">
              Outside
            </button>
          </SidebarMain>
        </SidebarLayout>

        <SidebarLayout
          id="rail"
          style={box}
          railSize="48px"
          onCollapsedChange={(collapsed, event) =>
            log("collapsed", collapsed, event.source)
          }
        >
          <SidebarPanel aria-label="Rail panel">
            <Links prefix="rail" />
          </SidebarPanel>
          <SidebarMain>
            <SidebarTrigger
              id="rail-trigger"
              action="collapse"
              icon={<span>⇤</span>}
            />
          </SidebarMain>
        </SidebarLayout>

        <SidebarLayout
          id="end"
          side="end"
          style={box}
          localeText={{ panel: "Details", toggle: "Toggle details" }}
        >
          <SidebarPanel />
          <SidebarMain>
            <SidebarTrigger id="end-trigger">Details</SidebarTrigger>
          </SidebarMain>
        </SidebarLayout>

        <div id="adaptive-host" style={{ inlineSize: hostWidth }}>
          <SidebarLayout
            id="adaptive"
            collapseBelow={600}
            style={box}
            onOpenChange={(open, event) => log("adaptive", open, event.reason)}
          >
            <SidebarPanel aria-label="Adaptive panel">
              <Links prefix="adaptive" />
            </SidebarPanel>
            <SidebarMain>
              <SidebarTrigger id="adaptive-trigger" />
              <button id="adaptive-outside" type="button">
                Outside
              </button>
            </SidebarMain>
          </SidebarLayout>
        </div>

        <SidebarLayout
          id="media"
          collapseBelow="(max-width: 700px)"
          style={box}
        >
          <SidebarPanel aria-label="Media panel">
            <Links prefix="media" />
          </SidebarPanel>
          <SidebarMain>
            <SidebarTrigger id="media-trigger" />
          </SidebarMain>
        </SidebarLayout>

        <SidebarLayout id="overlay" mode="overlay" style={box}>
          <SidebarPanel aria-label="Overlay panel">
            <Links prefix="overlay" />
          </SidebarPanel>
          <SidebarMain>
            <SidebarTrigger id="overlay-trigger" />
          </SidebarMain>
        </SidebarLayout>

        <Controlled />
        {params.has("warnings") ? <Warnings /> : null}
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
  requestAnimationFrame(
    () => ((window as unknown as { __hydrated: boolean }).__hydrated = true),
  );
} else if (root) {
  createRoot(root).render(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
}
