'use client';

// QueryBuilder `fieldPicker: 'tree'`: the fields as a tree in `TreeSelect` (composition edge
// query-builder -> tree-select). A lazy chunk of
// QueryBuilder, so the list picker's bundle does not grow.

import type { ReactNode } from 'react';
import { TreeSelect } from '@salmonui/dropdowns/tree-select';
import type { QueryField } from './types.js';

/** A field tree node: categories and parent fields are not selectable. */
export interface FieldNode {
  readonly value: string;
  readonly label: string;
  readonly leaf: boolean;
  readonly children?: readonly FieldNode[];
}

/** The field tree: categories (`field.category`) on top, nested `field.fields` below their parent. */
export function fieldTree(fields: readonly QueryField[], separator: string): FieldNode[] {
  const nodes = (list: readonly QueryField[], prefix: string): FieldNode[] =>
    list.map((f) => {
      const path = prefix + f.field;
      const label = f.label ?? f.field;
      return f.fields?.length ? { value: `\u0000${path}`, label, leaf: false, children: nodes(f.fields, path + separator) } : { value: path, label, leaf: true };
    });
  const top: FieldNode[] = [];
  const categories = new Map<string, FieldNode[]>();
  for (const f of fields) {
    const [node] = nodes([f], '');
    if (!f.category) top.push(node as FieldNode);
    else {
      let bucket = categories.get(f.category);
      if (!bucket) {
        bucket = [];
        categories.set(f.category, bucket);
        top.push({ value: `\u0001${f.category}`, label: f.category, leaf: false, children: bucket });
      }
      bucket.push(node as FieldNode);
    }
  }
  return top;
}

export interface TreeFieldPickerProps {
  readonly fields: readonly QueryField[];
  readonly separator: string;
  readonly value: string | null;
  readonly onChange: (path: string) => void;
  readonly label: string;
  readonly placeholder: string;
  readonly disabled: boolean;
  readonly className: string;
}

/** The tree field picker of one rule. */
export default function TreeFieldPicker(props: TreeFieldPickerProps): ReactNode {
  const data = fieldTree(props.fields, props.separator);
  const open = (props.value ?? '')
    .split(props.separator)
    .slice(0, -1)
    .map((_, i, parts) => `\u0000${parts.slice(0, i + 1).join(props.separator)}`);
  return (
    <TreeSelect
      aria-label={props.label}
      className={props.className}
      data={data}
      getItemValue={(n: FieldNode) => n.value}
      getItemLabel={(n: FieldNode) => n.label}
      getChildren={(n: FieldNode) => n.children}
      isItemSelectable={(n: FieldNode) => n.leaf}
      defaultExpanded={open}
      value={props.value}
      placeholder={props.placeholder}
      disabled={props.disabled}
      onValueChange={(v: unknown) => typeof v === 'string' && props.onChange(v)}
    />
  );
}
