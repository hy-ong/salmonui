// Browser fixture for the internal primitives, bundled by tests/browser/internal-primitives.spec.ts with
// Rolldown from the built dist and served on a routed origin, so the example
// apps stay untouched. Scenarios are picked by `location.hash`.

import { StrictMode, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { Overlay } from '@salmonui/core/internal/overlay';
import { pointRect, type Placement } from '@salmonui/core/internal/position';
import { usePressRepeat } from '@salmonui/core/internal/press';

declare global {
  interface Window {
    __log: string[];
    __placed: string[];
    __count: number;
  }
}
window.__log = [];
window.__placed = [];
window.__count = 0;

const params = new URLSearchParams(location.search);
const scenario = params.get('scenario') ?? 'position';

function PositionScenario(): ReactNode {
  const anchor = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const placement = (params.get('placement') ?? 'bottom-start') as Placement;
  const top = Number(params.get('top') ?? 300);
  const point = params.get('point');
  return (
    <>
      <button id="anchor" ref={anchor} style={{ position: 'absolute', top, insetInlineStart: 400, width: 100, height: 40 }} onClick={() => setOpen(true)}>
        anchor
      </button>
      {open ? (
        <Overlay
          id="box"
          anchor={point ? pointRect(120, 80) : anchor}
          placement={placement}
          offset={4}
          style={{ width: 200, height: 100, background: 'canvas', border: '1px solid', boxSizing: 'border-box', padding: 0 }}
          onPlaced={(p) => window.__placed.push(p.placement)}
          focus={false}
        >
          box
        </Overlay>
      ) : null}
    </>
  );
}

function Layer(props: { readonly name: string; readonly anchor: RefObject<HTMLElement | null>; readonly onClose: () => void; readonly insideRefs?: readonly RefObject<Element | null>[]; readonly children?: ReactNode; readonly contain?: boolean }): ReactNode {
  return (
    <Overlay
      id={props.name}
      role="dialog"
      aria-label={props.name}
      anchor={props.anchor}
      placement="bottom-start"
      insideRefs={props.insideRefs}
      onDismiss={(reason) => {
        window.__log.push(`${props.name}:${reason}`);
        props.onClose();
      }}
      focus={{ tab: props.contain ? 'contain' : 'leave' }}
      style={{ background: 'canvas', border: '1px solid', padding: 8, display: 'flex', gap: 4 }}
    >
      {props.children}
    </Overlay>
  );
}

function DismissScenario(): ReactNode {
  const trigger = useRef<HTMLButtonElement | null>(null);
  const childTrigger = useRef<HTMLButtonElement | null>(null);
  const [parent, setParent] = useState(false);
  const [child, setChild] = useState(false);
  return (
    <>
      <button id="before">before</button>
      <button id="trigger" ref={trigger} onClick={() => setParent((o) => !o)} style={{ marginInlineStart: 100 }}>
        trigger
      </button>
      <input id="outside" defaultValue="outside" style={{ display: 'block', marginBlockStart: 300 }} />
      {parent ? (
        <Layer name="parent" anchor={trigger} insideRefs={[trigger]} onClose={() => setParent(false)} contain={params.has('contain')}>
          <button id="p1">p1</button>
          <button id="open-child" ref={childTrigger} onClick={() => setChild(true)}>
            open child
          </button>
          <input
            id="escape-eater"
            defaultValue="eats escape"
            onKeyDown={(event) => {
              if (event.key === 'Escape') event.preventDefault();
            }}
          />
          {child ? (
            <Layer name="child" anchor={childTrigger} insideRefs={[childTrigger]} onClose={() => setChild(false)}>
              <button id="c1">c1</button>
              <button id="c2">c2</button>
            </Layer>
          ) : null}
        </Layer>
      ) : null}
    </>
  );
}

function Toggle(props: { readonly pressed?: boolean; readonly name: string; readonly onPressedChange?: (pressed: boolean) => void }): ReactNode {
  const [pressed, setPressed] = useControllableState(props.pressed, false, props.onPressedChange, props.name);
  return (
    <button id={props.name} aria-pressed={pressed} onClick={() => setPressed((p) => !p)}>
      {props.name}
    </button>
  );
}

function ControllableScenario(): ReactNode {
  const [value, setValue] = useState(false);
  const [veto, setVeto] = useState(true);
  const [mode, setMode] = useState<'controlled' | 'uncontrolled'>('uncontrolled');
  return (
    <>
      <Toggle name="uncontrolled" onPressedChange={(p) => window.__log.push(`uncontrolled:${p}`)} />
      <Toggle
        name="controlled"
        pressed={value}
        onPressedChange={(p) => {
          window.__log.push(`controlled:${p}`);
          if (!veto) setValue(p);
        }}
      />
      <button id="allow" onClick={() => setVeto(false)}>
        allow
      </button>
      <Toggle name="switching" {...(mode === 'controlled' ? { pressed: true } : {})} />
      <button id="switch" onClick={() => setMode('controlled')}>
        switch
      </button>
    </>
  );
}

function PressScenario(): ReactNode {
  const [count, setCount] = useState(0);
  const handlers = usePressRepeat<HTMLButtonElement>({
    delay: 300,
    interval: 50,
    onPress: (source, repeat) => {
      window.__log.push(`${source}:${repeat}`);
      window.__count++;
      setCount((c) => c + 1);
    },
  });
  return (
    <>
      <button id="spin" {...handlers}>
        spin {count}
      </button>
      <button id="elsewhere">elsewhere</button>
    </>
  );
}

const scenes: Record<string, () => ReactNode> = { position: PositionScenario, dismiss: DismissScenario, controllable: ControllableScenario, press: PressScenario };
const Scene = scenes[scenario] ?? PositionScenario;
createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Scene />
  </StrictMode>,
);
