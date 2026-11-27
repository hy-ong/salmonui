'use client';

// QueryTree UI: the nested AND/OR group editor shared by
// QueryBuilder and the Data Grid filter builder dialog, without a dialog
// frame. The host supplies the class prefix, text, buttons and the rule body
// (field, operator and value editors), and owns the value: every edit is a
// functional update `onChange(fn, change)`.
//
// Groups and rules are memoized on their node, so a rule edit re-renders
// that rule and its ancestors' child lists only. The host object
// must be stable (useMemo) for that to hold. Focus moves to a new node's
// first control after add / clone, and to the group's add button after
// remove.

import { memo, useId, useLayoutEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { insertNode, isGroupNode, updateNode, type TreeGroup, type TreeNode, type TreeRule } from './model.js';

export type QueryTreeAction = 'addCondition' | 'addGroup' | 'removeGroup' | 'removeCondition' | 'logic' | 'not' | 'edit' | 'clone' | 'lock' | 'move';

export interface QueryTreeChange {
  readonly action: QueryTreeAction;
  readonly nodeId: string;
}

/** Text keys (the Data Grid `localeText` names). */
export type QueryTreeTextKey = 'and' | 'or' | 'filterNot' | 'addCondition' | 'addGroup' | 'removeGroup';

export interface QueryTreeButton {
  readonly action: QueryTreeAction;
  readonly label: string;
  readonly onClick: (event: ReactMouseEvent) => void;
  readonly disabled?: boolean;
}

export interface QueryTreeRuleContext {
  readonly rule: TreeRule;
  /** Index among the parent's members. */
  readonly index: number;
  readonly parentId: string;
  /** True when the rule or an ancestor is locked, or the tree is read-only. */
  readonly locked: boolean;
  edit(fn: (rule: TreeRule) => TreeRule): void;
  /** Removes the rule and focuses the group's add button. */
  remove(): void;
}

export interface QueryTreeGroupContext {
  readonly group: TreeGroup;
  readonly parentId: string | null;
  readonly depth: number;
  readonly locked: boolean;
  /** The default bar content (connector, NOT toggle, add and remove buttons). */
  readonly controls: ReactNode;
}

export interface QueryTreeHost {
  /** Class prefix: `${cls}__group`, `${cls}__bar`, `${cls}__logic`, `${cls}__not`. */
  readonly cls: string;
  text(key: QueryTreeTextKey): string;
  groupLabel(group: TreeGroup, isRoot: boolean): string;
  /** Shows the NOT toggle on groups. */
  readonly not: boolean;
  /** Maximum group nesting (the root is 1); `addGroup` is disabled at the limit. */
  readonly maxDepth: number;
  /** A new rule, or null when no field can be offered. */
  newRule(): TreeRule | null;
  /** A new group (with its first rule when the host wants one). */
  newGroup(): TreeGroup;
  onChange(fn: (root: TreeGroup) => TreeGroup, change: QueryTreeChange): void;
  renderButton(button: QueryTreeButton): ReactNode;
  /** The whole rule row; its element carries `data-node-id={rule.id}`. */
  renderRule(ctx: QueryTreeRuleContext): ReactNode;
  /** The group bar content; `controls` is the default. */
  renderGroupBar?(ctx: QueryTreeGroupContext): ReactNode;
}

interface Ctx {
  readonly host: QueryTreeHost;
  readonly uid: string;
  /** Element to focus after the next commit. */
  readonly focus: { current: string | null };
}

/** Keyboard activation of a button reports `detail === 0`. */
export function clickSource(e: { readonly detail: number }): 'pointer' | 'keyboard' {
  return e.detail === 0 ? 'keyboard' : 'pointer';
}

/** Selector of a node's first control. */
export const firstControl = (id: string): string => `[data-node-id="${id}"] :is(select,input,button)`;

/** The add button of a group's bar. */
const addButtonOf = (cls: string, id: string): string => `[data-node-id="${id}"] > .${cls}__bar [data-action="addCondition"]`;

/**
 * The editable tree; `locked` makes it read-only. `focus` is the selector of
 * the element (inside the tree) focused after the next commit; hosts may set
 * it too.
 */
export function QueryTree({ root, host, locked = false, focus: hostFocus }: { root: TreeGroup; host: QueryTreeHost; locked?: boolean; focus?: { current: string | null } }) {
  const uid = useId();
  const ref = useRef<HTMLDivElement | null>(null);
  const ownFocus = useRef<string | null>(null);
  const focus = hostFocus ?? ownFocus;
  const ctx = useMemo<Ctx>(() => ({ host, uid, focus }), [host, uid, focus]);
  useLayoutEffect(() => {
    const selector = focus.current;
    if (!selector) return;
    focus.current = null;
    ref.current?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
  });
  return (
    <div ref={ref}>
      <GroupView ctx={ctx} group={root} parentId={null} depth={1} locked={locked || root.locked === true} />
    </div>
  );
}

const GroupView = memo(function GroupView({ ctx, group, parentId, depth, locked }: { ctx: Ctx; group: TreeGroup; parentId: string | null; depth: number; locked: boolean }) {
  const { host } = ctx;
  const { cls } = host;
  const id = group.id;
  const change = (fn: (root: TreeGroup) => TreeGroup, action: QueryTreeAction, nodeId = id): void => host.onChange(fn, { action, nodeId });
  const set = (patch: Partial<TreeGroup>, action: QueryTreeAction): void => change((r) => updateNode(r, id, (n) => ({ ...n, ...patch }) as TreeGroup), action);
  const button = (action: 'addCondition' | 'addGroup' | 'removeGroup', onClick: () => void, disabled?: boolean): ReactNode =>
    host.renderButton({ action, label: host.text(action), onClick, ...(disabled ? { disabled } : {}) });
  const add = (node: TreeNode | null, action: QueryTreeAction): void => {
    if (!node) return;
    ctx.focus.current = firstControl(node.id);
    change((r) => insertNode(r, id, node), action, node.id);
  };
  const controls = (
    <>
      <div className={`${cls}__logic`} role="radiogroup" aria-label={`${host.text('and')} / ${host.text('or')}`}>
        {(['and', 'or'] as const).map((logic) => (
          <label key={logic}>
            <input type="radio" name={ctx.uid + id} checked={group.logic === logic} disabled={locked} onChange={() => set({ logic }, 'logic')} />
            {host.text(logic)}
          </label>
        ))}
      </div>
      {host.not ? (
        <label className={`${cls}__not`}>
          <input type="checkbox" checked={group.not === true} disabled={locked} onChange={(e) => set({ not: e.target.checked }, 'not')} />
          {host.text('filterNot')}
        </label>
      ) : null}
      {locked ? null : (
        <>
          {button('addCondition', () => add(host.newRule(), 'addCondition'))}
          {button('addGroup', () => add(host.newGroup(), 'addGroup'), depth >= host.maxDepth)}
          {parentId === null
            ? null
            : button('removeGroup', () => {
                ctx.focus.current = addButtonOf(cls, parentId);
                change((r) => updateNode(r, id, () => null), 'removeGroup');
              })}
        </>
      )}
    </>
  );
  return (
    <div className={`${cls}__group`} role="group" aria-label={host.groupLabel(group, parentId === null)} data-node-id={id} data-not={group.not ? '' : undefined}>
      <div className={`${cls}__bar`}>{host.renderGroupBar ? host.renderGroupBar({ group, parentId, depth, locked, controls }) : controls}</div>
      {group.filters.map((child, index) =>
        isGroupNode(child) ? (
          <GroupView key={child.id} ctx={ctx} group={child} parentId={id} depth={depth + 1} locked={locked || child.locked === true} />
        ) : (
          <RuleView key={child.id} ctx={ctx} rule={child} parentId={id} index={index} locked={locked || child.locked === true} />
        ),
      )}
    </div>
  );
});

const RuleView = memo(function RuleView({ ctx, rule, parentId, index, locked }: { ctx: Ctx; rule: TreeRule; parentId: string; index: number; locked: boolean }) {
  const { host } = ctx;
  const id = rule.id;
  return host.renderRule({
    rule,
    index,
    parentId,
    locked,
    edit: (fn) => host.onChange((r) => updateNode(r, id, (n) => fn(n as TreeRule)), { action: 'edit', nodeId: id }),
    remove: () => {
      ctx.focus.current = addButtonOf(host.cls, parentId);
      host.onChange((r) => updateNode(r, id, () => null), { action: 'removeCondition', nodeId: id });
    },
  });
});
