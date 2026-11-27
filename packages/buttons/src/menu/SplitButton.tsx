'use client';

import { use, useId, useRef, type CSSProperties, type ReactElement, type ReactNode, type Ref } from 'react';
import { Button, type ButtonBaseProps } from '../button/Button.js';
import { ButtonGroup } from '../button/ButtonGroup.js';
import { ButtonGroupContext } from '../button/context.js';
import { CHEVRON, useMenuPopup, type MenuButtonMenuProps } from './MenuButton.js';

/** Parts that accept `classNames` / `styles`. */
export type SplitButtonPart = 'primary' | 'trigger' | 'menu';

export interface SplitButtonProps extends MenuButtonMenuProps, Omit<ButtonBaseProps, 'children' | 'ref' | 'className' | 'style' | 'render' | 'repeat' | 'onRepeat' | 'iconOnly' | 'floating' | 'floatingScope'> {
  /** Primary button content (also the group's accessible name). */
  readonly children?: ReactNode;
  /** Accessible name of the menu trigger (default `"More options"`). */
  readonly menuLabel?: string;
  /** Trigger content (default chevron). */
  readonly indicator?: ReactNode;
  /** Root (`role="group"`) class and style. */
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly classNames?: Partial<Record<SplitButtonPart, string>>;
  readonly styles?: Partial<Record<SplitButtonPart, CSSProperties>>;
  /** The primary `<button>`. */
  readonly ref?: Ref<HTMLButtonElement>;
}

/**
 * A primary `Button` and a menu trigger joined in one group: two tab stops;
 * the trigger follows the Menu Button keys and Alt+ArrowDown on the primary
 * part opens the menu too. `tone`, `variant`, `size` and `disabled` apply to
 * both parts; other DOM props and `onClick` go to the primary button.
 */
export function SplitButton(props: SplitButtonProps): ReactElement {
  const { menu: _menu, items: _items, renderItem: _renderItem, open: _open, defaultOpen: _defaultOpen, onOpenChange: _onOpenChange, onAction: _onAction, placement: _placement, container: _container, submenuOpen: _submenuOpen, hoverDelay: _hoverDelay, menuLabel = 'More options', indicator, className, style, classNames, styles, ref, children, tone, variant, size, disabled, onKeyDown, id, ...primary } = props;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const autoId = useId();
  const primaryId = id ?? autoId;
  const triggerId = useId();
  const popup = useMenuPopup(props, triggerRef, 'SplitButton');
  // Inside an outer ButtonGroup the outer defaults still apply; own props win.
  const outer = use(ButtonGroupContext);
  const isDisabled = disabled ?? outer?.disabled;
  return (
    <ButtonGroup
      attached
      aria-labelledby={primaryId}
      className={className ? `salmon-split-button ${className}` : 'salmon-split-button'}
      style={style}
      variant={variant ?? outer?.variant}
      tone={tone ?? outer?.tone}
      size={size ?? outer?.size}
      disabled={isDisabled}
      data-disabled={isDisabled ? '' : undefined}
    >
      <Button
        {...primary}
        {...(ref ? { ref } : {})}
        id={primaryId}
        className={classNames?.primary ? `salmon-split-button-primary ${classNames.primary}` : 'salmon-split-button-primary'}
        style={styles?.primary}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (!event.defaultPrevented && event.altKey && event.key === 'ArrowDown') {
            event.preventDefault();
            popup.show('keyboard', 'first');
          }
        }}
      >
        {children}
      </Button>
      <Button
        ref={triggerRef}
        id={triggerId}
        iconOnly
        aria-label={menuLabel}
        aria-haspopup="menu"
        aria-expanded={popup.open}
        aria-controls={popup.open ? popup.menuId : undefined}
        data-open={popup.open ? '' : undefined}
        className={classNames?.trigger ? `salmon-split-button-trigger ${classNames.trigger}` : 'salmon-split-button-trigger'}
        style={styles?.trigger}
        onClick={popup.onTriggerClick}
        onKeyDown={popup.onTriggerKeyDown}
      >
        <span className="salmon-menu-button-indicator">{indicator ?? CHEVRON}</span>
      </Button>
      {popup.renderPopup(triggerId, classNames?.menu ? `salmon-menu ${classNames.menu}` : 'salmon-menu', styles?.menu)}
    </ButtonGroup>
  );
}
