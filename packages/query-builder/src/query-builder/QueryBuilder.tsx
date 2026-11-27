'use client';

// QueryBuilder (docs/site/content/inputs/query-builder.md):
// the internal QueryTree (shared with the Data Grid filter builder)
// with `fields` instead of compiled columns, controls from the other
// families (Select, Combobox, TextField, NumberField, DateField, Checkbox,
// Button, and TreeSelect for `fieldPicker: 'tree'`) and the
// additions over the grid builder: NOT, lock, clone, drag reorder with
// keyboard move commands, maxGroups, categories, nested paths, summary
// view, validation in the Form rule vocabulary, custom editors and
// templates, a hidden form input and an imperative API.
//
// The value is a QueryGroup; nodes without an `id` get one from their path,
// so server and client agree. Edits are functional updates over the tree
// with structural sharing: one rule edit re-renders that rule.

import { lazy, Suspense, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Select } from '@salmonui/dropdowns/select';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { useHydrated } from '@salmonui/core/internal/hydrated';
import { formOf, useFormReset } from '@salmonui/core/internal/form';
import { cloneNode, findNode, idSource, insertNode, moveNode, updateNode, type TreeGroup, type TreeNode, type TreeRule } from '@salmonui/core/internal/query/model';
import { LIST_OPERATORS, NO_VALUE_OPERATORS } from '@salmonui/core/internal/query/operators';
import { firstControl, QueryTree, type QueryTreeButton, type QueryTreeGroupContext, type QueryTreeHost, type QueryTreeRuleContext } from '@salmonui/core/internal/query/tree';
import { isQueryGroup, type Json, type QueryGroup, type QueryNode, type QueryRule } from '@salmonui/core/internal/query/types';
import { keyboardTarget, startReorderDrag, type DropTarget } from './drag.js';
import { ValueEditor } from './editors.js';
import { flattenFields, type FlatField } from './fields.js';
import { operatorKey, textOf, type QueryText } from './locale.js';
import { summaryText } from './summary.js';
import type { QueryBuilderAction, QueryBuilderApi, QueryBuilderChangeDetails, QueryBuilderProps, QueryOperator } from './types.js';
import { validateQuery, validValue } from './validate.js';

// A component definition, not render state.
const TreeFieldPicker = lazy(() => import('./tree-picker.js'));

const CLS = 'salmon-query-builder';
const EMPTY: QueryGroup = Object.freeze({ logic: 'and', filters: Object.freeze([]) }) as QueryGroup;
const NO_ERRORS: ReadonlyMap<string, readonly string[]> = new Map();

type Source = QueryBuilderChangeDetails['source'];

// 16-unit stroke icons (decorative; buttons carry the name).
const ICON_X = 'M4 4l8 8M12 4l-8 8';
const ICON_CLONE = 'M5 5h8v8H5zM3 11V3h8';
const ICON_LOCKED = 'M4 7h8v6H4zM6 7V5a2 2 0 0 1 4 0v2';
const ICON_UNLOCKED = 'M4 7h8v6H4zM6 7V5a2 2 0 0 1 4 0';
const ICON_GRIP = 'M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01';

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d={d} stroke="currentColor" strokeWidth={d === ICON_GRIP ? 2.5 : 1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** Path ids for nodes without one (`q`, `q.0`, `q.0.1`): deterministic, so SSR and hydration agree. */
function withPathIds(group: QueryGroup): TreeGroup {
  const walk = (node: QueryNode, path: string): TreeNode => {
    if (!isQueryGroup(node)) return node.id === undefined ? { ...node, id: path } : (node as TreeRule);
    let changed = node.id === undefined;
    const filters = node.filters.map((c, i) => {
      const next = walk(c, `${path}.${i}`);
      if (next !== c) changed = true;
      return next;
    });
    return changed ? { ...node, id: node.id ?? path, filters } : (node as TreeGroup);
  };
  return walk(group, 'q') as TreeGroup;
}

interface Shared {
  readonly text: QueryText;
  readonly fields: readonly FlatField[];
  readonly fieldOf: (path: string) => FlatField | undefined;
  readonly fieldItems: readonly { value: string; label: string; group?: string }[];
  readonly operatorItems: (field: FlatField | undefined, current: string) => readonly { value: string; label: string }[];
  readonly opLabel: (op: string) => string;
  readonly custom: ReadonlyMap<string, QueryOperator>;
  readonly props: QueryBuilderProps;
  readonly errors: ReadonlyMap<string, readonly string[]>;
  readonly locale: string;
  readonly disabled: boolean;
}

export function QueryBuilder(props: QueryBuilderProps) {
  const {
    fields: fieldDefs,
    operators: customOps,
    notCondition = false,
    buttons,
    maxGroups = 5,
    addRuleToNewGroups = true,
    autoSelectField = false,
    autoSelectOperator = true,
    fieldSort = null,
    pathSeparator = '.',
    readOnly = false,
    disabled = false,
    reorderable = false,
    summary = false,
    validation = false,
    name,
    form,
    id,
    className,
    style,
    dir,
    ref,
  } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const focus = useRef<string | null>(null);
  const [cache] = useState(() => new WeakMap<QueryGroup, TreeGroup>());
  const treeOf = (v: QueryGroup): TreeGroup => {
    let t = cache.get(v);
    if (!t) {
      t = withPathIds(v);
      cache.set(v, t);
    }
    return t;
  };
  const [value, setValue] = useControllableState<QueryGroup, [QueryBuilderChangeDetails]>(props.value, () => props.defaultValue ?? EMPTY, props.onValueChange, 'QueryBuilder value');
  const tree = treeOf(value);
  const [errors, setErrors] = useState<ReadonlyMap<string, readonly string[]>>(NO_ERRORS);
  const [editing, setEditing] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [gen] = useState(() => idSource('n'));

  const locale = useLocale(props.locale) ?? 'en-US';
  const localeText = useLocaleText('queryBuilder', props.localeText);
  const text = useMemo(() => textOf(localeText), [localeText]);
  const custom = useMemo(() => new Map((customOps ?? []).map((o) => [o.name, o])), [customOps]);
  const fields = useMemo(() => flattenFields(fieldDefs, pathSeparator, fieldSort, customOps), [fieldDefs, pathSeparator, fieldSort, customOps]);
  const shared = useMemo<Shared>(() => {
    const byPath = new Map(fields.map((f) => [f.path, f]));
    const opLabel = (op: string): string => {
      const key = operatorKey(op);
      const t = text(key);
      return t === op && custom.get(op)?.label ? (custom.get(op)?.label as string) : t;
    };
    const opCache = new Map<string, { value: string; label: string }[]>();
    return {
      text,
      fields,
      fieldOf: (path) => byPath.get(path),
      fieldItems: fields.map((f) => ({ value: f.path, label: f.label, ...(f.category ? { group: f.category } : {}) })),
      operatorItems: (field, current) => {
        const ops = field ? field.operators : [];
        const list = current && !ops.includes(current) ? [current, ...ops] : ops;
        const key = list.join('|');
        let items = opCache.get(key);
        if (!items) opCache.set(key, (items = list.map((op) => ({ value: op, label: opLabel(op) }))));
        return items;
      },
      opLabel,
      custom,
      props,
      errors,
      locale,
      disabled,
    };
    // `props` is read for render props and editor settings; the listed ones are its parts that change the rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, text, custom, errors, locale, disabled, props.renderRule, props.renderGroupHeader, props.editorProps, props.fieldPicker, buttons, readOnly, reorderable, props.matchCase, autoSelectOperator]);

  const valueless = (op: string): boolean => NO_VALUE_OPERATORS.has(op) || custom.get(op)?.valueless === true;
  const nextId = (): string => {
    let next = gen();
    while (findNode(treeOf(latest.current.value), next)) next = gen();
    return next;
  };

  // Event-time reads of the latest props and value (never during render).
  const latest = useRef({ props, value, shared });
  useLayoutEffect(() => {
    latest.current = { props, value, shared };
  });
  // A proposal is visible to event-time reads at once: an API call made before
  // React commits the previous one (`remove()` then `validate()`, or a script
  // turn that runs before React's render task) reads and composes on the value
  // just proposed, never on the last commit. A controlled owner
  // may still keep its value: the `settle` render that follows every proposal
  // resets the reads to the committed value through the layout effect above.
  const [, settle] = useReducer((n: number) => n + 1, 0);
  const write = (next: QueryGroup | ((prev: QueryGroup) => QueryGroup), details: QueryBuilderChangeDetails): void => {
    const prev = latest.current.value;
    const resolved = typeof next === 'function' ? next(prev) : next;
    if (resolved === prev) return;
    latest.current.value = resolved;
    setValue(resolved, details);
    settle();
  };

  /** Proposes `fn(tree)`; `onBeforeChange` may cancel it. Returns whether it applied. */
  const propose = (fn: (root: TreeGroup) => TreeGroup, action: QueryBuilderAction, nodeId: string | null, source: Source): boolean => {
    let applied = false;
    write(
      (prev) => {
        const before = treeOf(prev);
        const next = fn(before);
        if (next === before) return prev;
        const hook = latest.current.props.onBeforeChange;
        if (hook) {
          let prevented = false;
          hook({
            action,
            nodeId,
            previousValue: before,
            value: next,
            source,
            preventDefault: () => void (prevented = true),
            get defaultPrevented() {
              return prevented;
            },
          });
          if (prevented) return prev;
        }
        applied = true;
        return next;
      },
      { source, reason: action, action, nodeId },
    );
    return applied;
  };

  const newRule = (): TreeRule => {
    const f = autoSelectField ? fields[0] : undefined;
    const s = latest.current.props;
    return {
      id: nextId(),
      field: f?.path ?? '',
      operator: f && autoSelectOperator ? (f.operators[0] ?? '') : '',
      ...(f?.def.defaultValue !== undefined ? { value: f.def.defaultValue } : {}),
      ...(s.matchCase !== undefined ? { matchCase: s.matchCase } : {}),
    };
  };

  const moveTo = (nodeId: string, target: DropTarget, source: 'pointer' | 'keyboard'): void => {
    const p = latest.current.props;
    if (p.onDrop) {
      let prevented = false;
      p.onDrop({ nodeId, targetGroupId: target.groupId, index: target.index, source, preventDefault: () => void (prevented = true), get defaultPrevented() { return prevented; } });
      if (prevented) return;
    }
    // The position is read from the tree before the move (`propose` updates the event-time value).
    const moved = moveNode(treeOf(latest.current.value), nodeId, target.groupId, target.index);
    const applied = propose((r) => moveNode(r, nodeId, target.groupId, target.index), 'move', nodeId, source);
    if (applied) {
      focus.current = `[data-node-id="${nodeId}"] [data-action="move"]`;
      const after = findNode(moved, nodeId);
      setAnnouncement(text('moved', { position: (after?.index ?? 0) + 1 }));
    }
  };

  const clone = (nodeId: string, source: Source, at?: { parentId?: string; index?: number }): string | null => {
    const path = findNode(treeOf(latest.current.value), nodeId);
    if (!path || !path.parent) return null;
    const copy = cloneNode({ ...path.node, locked: false } as TreeNode, nextId);
    const parentId = at?.parentId ?? path.parent.id;
    const index = at?.index ?? (parentId === path.parent.id ? path.index + 1 : undefined);
    focus.current = firstControl(copy.id);
    return propose((r) => insertNode(r, parentId, copy, index), 'clone', copy.id, source) ? copy.id : null;
  };

  const setLock = (nodeId: string, locked: boolean, source: Source): void => {
    propose((r) => updateNode(r, nodeId, (n) => (locked ? { ...n, locked: true } : (({ locked: _l, ...rest }) => rest as TreeNode)(n))), 'lock', nodeId, source);
  };

  const host = useMemo<QueryTreeHost>(() => {
    // deleteRule, addGroup and deleteGroup default on, clone and lock off; an explicit `undefined` keeps the default.
    const show = buttons ?? {};
    const sourceOf = (e?: { detail: number }): Source => (e && e.detail === 0 ? 'keyboard' : 'pointer');
    const button = (action: string, label: string, onClick: (e: ReactMouseEvent) => void, extra: { disabled?: boolean; pressed?: boolean; icon?: string } = {}): ReactNode => {
      const common = { size: 'sm' as const, variant: 'ghost' as const, 'data-action': action, disabled: extra.disabled || disabled, 'aria-pressed': extra.pressed, onClick };
      return extra.icon ? (
        <Button key={action} {...common} iconOnly aria-label={label} title={label}>
          <Icon d={extra.icon} />
        </Button>
      ) : (
        <Button key={action} {...common}>
          {label}
        </Button>
      );
    };
    const handle = (nodeId: string, locked: boolean): ReactNode =>
      reorderable && !locked ? (
        <button
          key="move"
          type="button"
          className={`${CLS}__handle`}
          data-action="move"
          aria-label={text('move')}
          title={text('move')}
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
          disabled={disabled}
          onPointerDown={(e: ReactPointerEvent<HTMLButtonElement>) => {
            if (e.button !== 0 || !rootRef.current) return;
            e.preventDefault();
            const p = latest.current.props;
            p.onDragStart?.({ nodeId, targetGroupId: null, index: -1 });
            startReorderDrag(e.currentTarget, e.nativeEvent, {
              root: rootRef.current,
              nodeId,
              cls: CLS,
              onDrag: (t) => latest.current.props.onDrag?.({ nodeId, targetGroupId: t?.groupId ?? null, index: t?.index ?? -1 }),
              onDrop: (t) => moveTo(nodeId, t, 'pointer'),
            });
          }}
          onKeyDown={(e: ReactKeyboardEvent) => {
            if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
            e.preventDefault();
            const t = keyboardTarget(treeOf(latest.current.value), nodeId, e.key === 'ArrowUp' ? -1 : 1);
            if (t) moveTo(nodeId, t, 'keyboard');
          }}
        >
          <Icon d={ICON_GRIP} />
        </button>
      ) : null;
    const nodeActions = (node: TreeNode, locked: boolean, isGroup: boolean): ReactNode => (
      <>
        {show.clone && !locked ? button(isGroup ? 'cloneGroup' : 'cloneRule', text(isGroup ? 'cloneGroup' : 'cloneRule'), (e) => clone(node.id, sourceOf(e)), { icon: ICON_CLONE }) : null}
        {show.lock && !readOnly && (!locked || node.locked === true)
          ? button('lock', text(node.locked ? 'unlock' : 'lock'), (e) => setLock(node.id, !node.locked, sourceOf(e)), { pressed: node.locked === true, icon: node.locked ? ICON_LOCKED : ICON_UNLOCKED })
          : null}
        {handle(node.id, locked)}
      </>
    );
    return {
      cls: CLS,
      text: (key) => text(key),
      groupLabel: (g, isRoot) => (isRoot ? (props['aria-label'] ?? text('queryBuilder')) : text('groupLabel', { connector: text(g.logic) })),
      not: notCondition,
      maxDepth: show.addGroup !== false ? maxGroups : 0,
      newRule,
      newGroup: () => ({ id: nextId(), logic: 'and', filters: addRuleToNewGroups ? [newRule()] : [] }),
      onChange: (fn, change) => {
        if (change.action === 'edit') clearError(change.nodeId);
        propose(fn, change.action as QueryBuilderAction, change.nodeId, 'pointer');
      },
      renderButton: ({ action, label, onClick, disabled: off }: QueryTreeButton) => {
        if (action === 'removeGroup' && show.deleteGroup === false) return null;
        if (action === 'addGroup' && show.addGroup === false) return null;
        return button(action, label, onClick, off ? { disabled: true } : {});
      },
      renderGroupBar: (ctx: QueryTreeGroupContext) => {
        const actions = ctx.parentId === null ? null : nodeActions(ctx.group, ctx.locked, true);
        const header = shared.props.renderGroupHeader;
        return header ? header({ group: ctx.group, depth: ctx.depth, locked: ctx.locked, isRoot: ctx.parentId === null, controls: ctx.controls, actions }) : (
          <>
            {ctx.controls}
            {actions}
          </>
        );
      },
      renderRule: (ctx: QueryTreeRuleContext) => <RuleRow key={ctx.rule.id} ctx={ctx} shared={shared} actions={nodeActions(ctx.rule, ctx.locked, false)} show={show.deleteRule !== false}autoSelectOperator={autoSelectOperator} valueless={valueless} />,
    };
    // Stable while the rows' inputs are; value changes never rebuild it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared, notCondition, maxGroups, addRuleToNewGroups, summary, props['aria-label']]);

  function clearError(nodeId: string): void {
    if (errors.has(nodeId)) {
      const next = new Map(errors);
      next.delete(nodeId);
      setErrors(next);
    }
  }

  const reset = (source: Source): void => {
    setErrors(NO_ERRORS);
    write(latest.current.props.defaultValue ?? EMPTY, { source, reason: 'reset', action: 'reset', nodeId: null });
  };
  useFormReset(rootRef, () => reset('api'));

  const api: QueryBuilderApi = {
    getValue: () => treeOf(latest.current.value),
    setValue: (v) => void propose(() => treeOf(v), 'set', null, 'api'),
    getValidValue: () => validValue(treeOf(latest.current.value), latest.current.shared.fieldOf, valueless),
    getNode: (nodeId) => findNode(treeOf(latest.current.value), nodeId)?.node ?? null,
    addRules: (rules, groupId) => {
      const nodes = rules.map((r) => ({ ...r, id: r.id ?? nextId() }) as TreeRule);
      propose((r) => nodes.reduce((acc, n) => insertNode(acc, groupId ?? acc.id, n), r), 'addCondition', nodes[0]?.id ?? null, 'api');
      return nodes.map((n) => n.id);
    },
    addGroups: (groups, groupId) => {
      const nodes = groups.map((g) => cloneNode(withPathIds(g), nextId));
      propose((r) => nodes.reduce((acc, n) => insertNode(acc, groupId ?? acc.id, n), r), 'addGroup', nodes[0]?.id ?? null, 'api');
      return nodes.map((n) => n.id);
    },
    remove: (ids) => {
      const list = typeof ids === 'string' ? [ids] : ids;
      // The action names what the first id is, as the built-in remove buttons do.
      const first = list[0] === undefined ? null : findNode(treeOf(latest.current.value), list[0]);
      propose((r) => list.reduce((acc, nodeId) => updateNode(acc, nodeId, () => null), r), first && isQueryGroup(first.node) ? 'removeGroup' : 'removeCondition', list[0] ?? null, 'api');
    },
    clone: (nodeId, options) => clone(nodeId, 'api', options),
    lock: (nodeId, locked = true) => setLock(nodeId, locked, 'api'),
    validate: () => {
      const found = validateQuery(treeOf(latest.current.value), latest.current.shared.fieldOf, text, valueless);
      setErrors(found.size ? found : NO_ERRORS);
      const first = found.keys().next().value;
      if (first !== undefined) focus.current = `[data-node-id="${first}"] [aria-invalid="true"], ${firstControl(first)}`;
      return found.size === 0;
    },
    reset: () => reset('api'),
    focus: () => rootRef.current?.querySelector<HTMLElement>('select, input, button')?.focus(),
  };
  useImperativeHandle(ref, () => api);
  // `validation`: the owning form's submit validates first and is cancelled when a rule is invalid.
  const validateLatest = useRef(api.validate);
  useLayoutEffect(() => {
    validateLatest.current = api.validate;
  });
  useEffect(() => {
    const owner = validation ? formOf(rootRef.current) : null;
    if (!owner) return;
    const onSubmit = (e: Event): void => {
      if (!validateLatest.current()) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    owner.addEventListener('submit', onSubmit, true);
    return () => owner.removeEventListener('submit', onSubmit, true);
  }, [validation]);
  // Focus requests outside the tree's own (validate, move) run after commit.
  useLayoutEffect(() => {
    const selector = focus.current;
    if (!selector) return;
    focus.current = null;
    rootRef.current?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
  });

  const showSummary = summary && !editing;
  return (
    <div
      ref={rootRef}
      id={id}
      dir={dir}
      className={className ? `${CLS} ${className}` : CLS}
      style={style}
      data-readonly={readOnly ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      data-reorderable={reorderable ? '' : undefined}
      aria-labelledby={props['aria-labelledby']}
      role={props['aria-labelledby'] ? 'group' : undefined}
    >
      {showSummary ? (
        <div className={`${CLS}__summary`}>
          <p className={`${CLS}__sentence`} aria-live="polite">
            {summaryText(tree, shared.fieldOf, text, locale, shared.opLabel)}
          </p>
          {readOnly ? null : (
            <Button size="sm" variant="outline" data-action="edit" disabled={disabled} onClick={() => ((focus.current = 'input, button'), setEditing(true))}>
              {text('edit')}
            </Button>
          )}
        </div>
      ) : (
        <>
          <QueryTree root={tree} host={host} locked={readOnly || disabled} focus={focus} />
          {summary ? (
            <Button size="sm" variant="outline" data-action="done" onClick={() => ((focus.current = '[data-action="edit"]'), setEditing(false))}>
              {text('done')}
            </Button>
          ) : null}
        </>
      )}
      <span className={`${CLS}__live`} role="status">
        {announcement}
      </span>
      {name ? <input type="hidden" name={name} form={form} value={JSON.stringify(validValue(tree, shared.fieldOf, valueless))} /> : null}
    </div>
  );
}

function RuleRow({ ctx, shared, actions, show, autoSelectOperator, valueless }: { ctx: QueryTreeRuleContext; shared: Shared; actions: ReactNode; show: boolean; autoSelectOperator: boolean; valueless: (op: string) => boolean }) {
  const { rule, locked, edit, remove } = ctx;
  const { text, props } = shared;
  const field = shared.fieldOf(rule.field);
  const errors = shared.errors.get(rule.id) ?? [];
  const invalid = errors.length > 0;
  const off = locked || shared.disabled;
  const editorProps = props.editorProps;
  const matchCase = props.matchCase;
  const setRule = (patch: { readonly [K in keyof QueryRule]?: QueryRule[K] | undefined }): void =>
    edit((r) => {
      const next: Record<string, unknown> = { ...r, ...patch };
      for (const k of Object.keys(patch)) if ((patch as Record<string, unknown>)[k] === undefined) delete next[k];
      if (matchCase !== undefined) next['matchCase'] = matchCase;
      return next as unknown as TreeRule;
    });
  const setField = (path: string): void => {
    const f = shared.fieldOf(path);
    const ops = f?.operators ?? [];
    const operator = autoSelectOperator ? (ops.includes(rule.operator) ? rule.operator : (ops[0] ?? '')) : '';
    setRule({ field: path, operator, value: f?.def.defaultValue });
  };
  const setOperator = (op: string): void => {
    const shape = (o: string) => (valueless(o) ? 0 : o === 'between' ? 2 : LIST_OPERATORS.has(o) || shared.custom.get(o)?.list ? 3 : 1);
    setRule({ operator: op, ...(shape(op) !== shape(rule.operator) ? { value: undefined } : {}) });
  };
  const listPicker = (
    <Select
      {...editorProps?.field}
      aria-label={text('filterField')}
      className={`${CLS}__field`}
      data={shared.fieldItems}
      value={rule.field || null}
      placeholder={text('selectField')}
      disabled={off}
      onValueChange={(v) => v !== null && setField(String(v))}
    />
  );
  // the tree picker is a lazy chunk; the list picker renders on the server, during hydration and until it loads.
  const hydrated = useHydrated();
  const fieldPicker =
    shared.props.fieldPicker === 'tree' && hydrated ? (
      <Suspense fallback={listPicker}>
        <TreeFieldPicker
          fields={shared.props.fields}
          separator={shared.props.pathSeparator ?? '.'}
          value={rule.field || null}
          onChange={setField}
          label={text('filterField')}
          placeholder={text('selectField')}
          disabled={off}
          className={`${CLS}__field`}
        />
      </Suspense>
    ) : (
      listPicker
    );
  const operatorPicker = (
    <Select
      {...editorProps?.operator}
      aria-label={text('filterOperator')}
      className={`${CLS}__operator`}
      data={shared.operatorItems(field, rule.operator)}
      value={rule.operator || null}
      placeholder={text('selectOperator')}
      disabled={off || !field}
      onValueChange={(v) => v !== null && setOperator(String(v))}
    />
  );
  const custom = field?.def.renderValueEditor;
  const setValue = (v: Json | undefined): void => setRule({ value: v });
  const valueEditor =
    !field || !rule.operator || valueless(rule.operator) ? null : custom ? (
      custom({ rule, field: field.def, operator: rule.operator, value: rule.value, setValue, label: text('filterValue'), invalid, disabled: off })
    ) : (
      <ValueEditor
        field={field}
        operator={rule.operator}
        value={rule.value}
        onChange={setValue}
        label={text('filterValue')}
        invalid={invalid}
        disabled={off}
        text={text}
        locale={shared.locale}
        extra={editorProps?.value}
        list={shared.custom.get(rule.operator)?.list === true}
      />
    );
  const allActions = (
    <>
      {show && !locked ? (
        <Button size="sm" variant="ghost" iconOnly aria-label={text('removeCondition')} title={text('removeCondition')} data-action="removeCondition" disabled={shared.disabled} onClick={remove}>
          <Icon d={ICON_X} />
        </Button>
      ) : null}
      {actions}
    </>
  );
  const template = props.renderRule;
  const errorId = invalid ? `${rule.id}-error` : undefined;
  return (
    <div
      className={`${CLS}__rule`}
      data-node-id={rule.id}
      role="group"
      aria-label={text('ruleLabel', { index: ctx.index + 1 })}
      aria-describedby={errorId}
      data-locked={rule.locked ? '' : undefined}
      data-invalid={invalid ? '' : undefined}
    >
      {template ? (
        template({ rule, index: ctx.index, parentId: ctx.parentId, locked, fieldPicker, operatorPicker, valueEditor, actions: allActions, errors, setRule: (r) => edit(() => ({ ...r, id: rule.id }) as TreeRule), remove })
      ) : (
        <>
          {fieldPicker}
          {operatorPicker}
          {valueEditor}
          {allActions}
        </>
      )}
      {invalid ? (
        <span className={`${CLS}__error`} id={errorId}>
          {errors[0]}
        </span>
      ) : null}
    </div>
  );
}
