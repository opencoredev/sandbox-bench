'use client';

import { IconTheme } from "./icon";
import { componentRadius } from "../../lib/component-radius";
import { iconWeightVariables } from "../../lib/theme-icon-weight";
import { useReducedMotion } from 'motion/react';
import {
  motionCurveFromVariables,
  motionDuration,
  resolveMotionTransition,
} from "../../lib/theme-motion";

import {
  Fragment,
  createContext,
  createElement,
  useContext,
  useMemo,
  type CSSProperties,
  type ElementType,
  type ReactNode,
  type ComponentProps,
} from 'react';
import {
  getComponentParts,
  resolveComponentPartStyle,
  type ComponentPartId,
} from "../../lib/component-parts";
import {
  componentBoxShadow,
  withFocusBorder,
  previewCssVariables,
  DEFAULT_DOCUMENT,
  type ComponentId,
  type ComponentState,
  type ComponentStyle,
  type ThemeDocument,
  type ColorMode,
} from "../../lib/theme-model";

export type PartAppearances = Partial<
  Record<ComponentPartId, Partial<Record<ComponentState, ComponentStyle>>>
>;
type ThemeValue = {
  appearances: PartAppearances;
  variables: CSSProperties;
  component?: ComponentId;
  resolveComponent?: (component: ComponentId) => PartAppearances;
};
const ThemeContext = createContext<ThemeValue | null>(null);
export const APPEARANCE_STATES: ComponentState[] = [
  'rest',
  'hover',
  'focus',
  'open',
  'highlighted',
  'selected',
  'checked',
  'indeterminate',
  'pressed',
  'readonly',
  'valid',
  'invalid',
  'loading',
  'complete',
  'low',
  'high',
  'disabled',
];
export function resolvePartAppearances(
  document: ThemeDocument,
  mode: ColorMode,
  component: ComponentId,
): PartAppearances {
  return Object.fromEntries(
    getComponentParts(component).map((part) => [
      part.id,
      Object.fromEntries(
        APPEARANCE_STATES.map((state) => [
          state,
          resolveComponentPartStyle(document, mode, component, part.id, state),
        ]),
      ),
    ]),
  );
}

/** Cache each referenced component independently of the containing specimen. */
export function createAppearanceResolver(
  document: ThemeDocument,
  mode: ColorMode,
) {
  const cache = new Map<ComponentId, PartAppearances>();
  return (component: ComponentId) => {
    if (!cache.has(component))
      cache.set(component, resolvePartAppearances(document, mode, component));
    return cache.get(component)!;
  };
}

/** A library theme scope also reaches portals through React context. No editor provider is required. */
export function ComponentTheme({
  appearances,
  variables,
  component,
  resolveComponent,
  children,
}: {
  appearances: PartAppearances;
  variables: CSSProperties;
  component?: ComponentId;
  resolveComponent?: (component: ComponentId) => PartAppearances;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ appearances, variables, component, resolveComponent }),
    [appearances, variables, component, resolveComponent],
  );
  return (
    <ThemeContext value={value}>
      <IconTheme variables={variables}>{children}</IconTheme>
    </ThemeContext>
  );
}
export function appearanceVariables(
  states: Partial<Record<ComponentState, ComponentStyle>>,
): CSSProperties {
  const result: Record<string, string | number> = {};
  for (const name of APPEARANCE_STATES) {
    const s = states[name] ?? states.rest;
    if (!s) continue;
    const icon = iconWeightVariables(s.fontWeight);
    const properties = {
      background: s.background,
      opacity: s.opacity ?? 1,
      filter: s.blur ? `blur(${s.blur}px)` : 'none',
      'backdrop-filter': s.backdropBlur ? `blur(${s.backdropBlur}px)` : 'none',
      'background-image': s.backgroundImage ?? 'none',
      bevel: s.bevelShadow ?? 'none',
      'bevel-content':
        s.bevelShadow && s.bevelShadow !== 'none' ? '""' : 'none',
      color: s.foreground,
      radius: componentRadius(s),
      'inner-radius': componentRadius(s, s.borderWidth),
      shadow: componentBoxShadow(s),
      'border-shadow': componentBoxShadow({ ...s, shadow: 'none' }),
      // A transparent zero layer composes with one-sided dividers; `none` cannot.
      elevation: s.shadow === 'none' ? '0 0 0 0 transparent' : s.shadow,
      top: `${s.paddingTop}px`,
      bottom: `${s.paddingBottom}px`,
      x: `${s.paddingX}px`,
      left: `${s.paddingLeft ?? s.paddingX}px`,
      right: `${s.paddingRight ?? s.paddingX}px`,
      gap: `${s.gap}px`,
      font: s.fontFamily,
      size: `${s.fontSize}px`,
      weight: s.fontWeight,
      'icon-stroke-width': icon['--icon-stroke-width'],
      'icon-light-display': icon['--icon-light-display'],
      'icon-regular-display': icon['--icon-regular-display'],
      'icon-bold-display': icon['--icon-bold-display'],
      line: `${s.lineHeight}px`,
      'letter-spacing': `${s.letterSpacing ?? 0}em`,
      control: `${s.controlSize}px`,
      edge: s.borderColor,
      'edge-width': `${s.borderWidth}px`,
      'border-authored': s.borderAuthored ? 1 : 0,
    };
    for (const [property, value] of Object.entries(properties))
      result[`--ui-${name}-${property}`] = value;
    if (name === 'checked' || name === 'indeterminate') {
      const focused = withFocusBorder(s, states.focus);
      result[`--ui-${name}-focused-shadow`] = componentBoxShadow(focused);
      result[`--ui-${name}-focused-edge`] = focused.borderColor;
      result[`--ui-${name}-focused-edge-width`] = `${focused.borderWidth}px`;
      result[`--ui-${name}-focused-inner-radius`] = componentRadius(
        focused,
        focused.borderWidth,
      );
    }
  }
  const focusOutline = (states.focus ?? states.rest)?.focusOutline;
  if (focusOutline) result['--focus-ring-outline'] = focusOutline;
  return result as CSSProperties;
}
const defaultVariables = previewCssVariables(DEFAULT_DOCUMENT.theme, 'light');
/** Live motion tokens follow the same React scope as styles, including portals. */
export function useThemeMotion(role: 'small' | 'large' = 'small') {
  const theme = useContext(ThemeContext);
  const reduced = useReducedMotion() === true;
  const curve = motionCurveFromVariables(
    (theme?.variables ?? defaultVariables) as Record<string, string | number>,
    role,
  );
  return {
    curve,
    disabled: reduced || motionDuration(curve) === 0,
    transition: resolveMotionTransition(curve, reduced),
  };
}
const defaults = new Map<ComponentId, PartAppearances>();
function defaultAppearances(component: ComponentId) {
  if (!defaults.has(component))
    defaults.set(
      component,
      resolvePartAppearances(DEFAULT_DOCUMENT, 'light', component),
    );
  return defaults.get(component)!;
}
export function usePartAppearance(
  component: ComponentId,
  part: ComponentPartId,
  state: ComponentState = 'rest',
) {
  const theme = useContext(ThemeContext);
  const appearances =
    theme?.component && theme.component !== component && theme.resolveComponent
      ? theme.resolveComponent(component)[part]
      : theme?.appearances[part];
  return (appearances ?? defaultAppearances(component)[part])?.[state];
}
const partAppearances = (theme: ThemeValue | null, component: ComponentId, part: ComponentPartId) =>
  (theme?.component && theme.component !== component && theme.resolveComponent
    ? theme.resolveComponent(component)[part]
    : theme?.appearances[part]) ?? defaultAppearances(component)[part];

function usePartSources(component: ComponentId, part: ComponentPartId) {
  const theme = useContext(ThemeContext);
  const appearances = partAppearances(theme, component, part);
  const variables = theme?.variables ?? defaultVariables;
  return { theme, variables, appearances };
}

export function usePartStyle(
  component: ComponentId,
  part: ComponentPartId,
): CSSProperties {
  const { variables, appearances } = usePartSources(component, part);
  return useMemo(
    () => ({ ...variables, ...appearanceVariables(appearances ?? {}) }),
    [variables, appearances],
  );
}

/*
 * Sandbox bench adaptation: the resolved variables for a part are identical on
 * every instance, so they go in class rules that React 19 hoists and dedupes
 * by href, instead of ~20 KB of inline style on each element. The values and
 * their cascade position (unlayered, element level) are unchanged.
 *
 * A part's variables are the scope's theme variables plus its own appearance
 * values, so they go in two rules: the scope's, shared by every part, and the
 * part's, holding only what differs from the scope. The part's rule sits in a
 * later precedence group, so where both name a variable the part's value wins,
 * as it did when the two were merged into one rule.
 */
type HoistedRule = { className: string; css: string };
/** The classes a part's element carries and the rules that define them, scope first. */
type PartRules = { className: string; rules: readonly [HoistedRule, ...HoistedRule[]] };
const hoisted = new Map<string, HoistedRule>();
const cssProperty = (key: string) => (key.startsWith('--') ? key : key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
function hoistVariables(variables: CSSProperties) {
  const body = Object.entries(variables)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${cssProperty(key)}:${String(value)}`)
    .join(';');
  let entry = hoisted.get(body);
  if (!entry) {
    // FNV-1a: a short stable name for the same declarations on server and client.
    let hash = 0x811c9dc5;
    for (let i = 0; i < body.length; i++) hash = Math.imul(hash ^ body.charCodeAt(i), 0x01000193);
    const className = `gt-${(hash >>> 0).toString(36)}`;
    entry = { className, css: `.${className}{${body}}` };
    hoisted.set(body, entry);
  }
  return entry;
}

/** The variables a part sets on top of its scope's: changed or added ones, and `inherit` for any the merge removed. */
function partOnly(variables: CSSProperties, merged: CSSProperties): CSSProperties {
  const set = (v: unknown) => v !== undefined && v !== null && v !== '';
  const scope = variables as Record<string, unknown>;
  const all = merged as Record<string, unknown>;
  const own: Record<string, string> = {};
  for (const [key, value] of Object.entries(all))
    if (set(value) && String(value) !== String(scope[key])) own[key] = String(value);
  for (const [key, value] of Object.entries(scope)) if (set(value) && !set(all[key])) own[key] = 'inherit';
  return own as CSSProperties;
}

/*
 * Every part's variables include ~550 appearance values, mostly the same from
 * part to part. The scope's rule also carries one part's, the tab panel's, as
 * a baseline, so each part's own rule lists only where it differs: about 4 KB
 * a part instead of 18 KB.
 */
const BASELINE = { component: 'tabs', part: 'panel' } as const satisfies { component: ComponentId; part: ComponentPartId };
const noTheme = {};
const scopeCache = new WeakMap<object, CSSProperties>();
function scopeVariables(theme: ThemeValue | null, variables: CSSProperties): CSSProperties {
  const key = theme ?? noTheme;
  let scope = scopeCache.get(key);
  if (!scope) {
    scope = { ...variables, ...appearanceVariables(partAppearances(theme, BASELINE.component, BASELINE.part) ?? {}) };
    scopeCache.set(key, scope);
  }
  return scope;
}

const partRuleCache = new WeakMap<CSSProperties, Map<string, PartRules>>();
function partRules(scopeVars: CSSProperties, merged: CSSProperties): PartRules {
  const scope = hoistVariables(scopeVars);
  const own = hoistVariables(partOnly(scopeVars, merged));
  const key = own.className;
  let byPart = partRuleCache.get(scopeVars);
  if (!byPart) partRuleCache.set(scopeVars, (byPart = new Map()));
  let entry = byPart.get(key);
  if (!entry) byPart.set(key, (entry = { className: `${scope.className} ${own.className}`, rules: [scope, own] }));
  return entry;
}

/** A part's variables as hoisted class rules, for parts that set their own style: add `className` and wrap with `withHoistedStyle`. */
export function usePartClass(component: ComponentId, part: ComponentPartId): PartRules {
  const { theme, variables } = usePartSources(component, part);
  const style = usePartStyle(component, part);
  return useMemo(() => partRules(scopeVariables(theme, variables), style), [theme, variables, style]);
}
/** The scope's rules in one precedence group and each part's in a later one, so a part's own values win. */
export function withHoistedStyle(rule: HoistedRule | PartRules, element: ReactNode) {
  const styles =
    'rules' in rule
      ? rule.rules.map((r, i) => createElement('style', { key: r.className, href: r.className, precedence: i === 0 ? 'graphical' : 'graphical-part' }, r.css))
      : [createElement('style', { key: rule.className, href: rule.className, precedence: 'graphical' }, rule.css)];
  return createElement(Fragment, null, ...styles, element);
}

/** Structural portal containers need theme variables without a component surface. */
export function themeContainer<C extends ElementType>(
  Base: C,
  structure: string,
): C {
  function ThemedContainer(props: ComponentProps<C>) {
    const theme = useContext(ThemeContext);
    const { className, style, ...rest } = props as {
      className?: string | ((state: unknown) => string | undefined);
      style?: CSSProperties | ((state: unknown) => CSSProperties | undefined);
    };
    const variables = theme?.variables ?? defaultVariables;
    const rule = useMemo(() => hoistVariables(variables), [variables]);
    const classes = (value?: string) =>
      [structure, rule.className, value].filter(Boolean).join(' ');
    return withHoistedStyle(
      rule,
      createElement(Base, {
        ...rest,
        className:
          typeof className === 'function'
            ? (state: unknown) => classes(className(state))
            : classes(className),
        style,
      }),
    );
  }
  ThemedContainer.displayName = `Themed(${structure})`;
  return ThemedContainer as unknown as C;
}

/** Preserve Base UI's complete prop/ref/render contracts while adding token styles. */
export function themePart<C extends ElementType>(
  Base: C,
  component: ComponentId,
  part: ComponentPartId,
  structure = '',
): C {
  function ThemedPart(props: ComponentProps<C>) {
    const rule = usePartClass(component, part);
    const {
      className,
      style: consumerStyle,
      ...rest
    } = props as {
      className?: string | ((state: unknown) => string | undefined);
      style?: CSSProperties | ((state: unknown) => CSSProperties | undefined);
    };
    const classes = (value?: string) =>
      ['ui-part', structure, rule.className, value].filter(Boolean).join(' ');
    // Base UI's style/className state callbacks are not DOM prop getters.
    // Resolve them at the primitive boundary instead of flattening them in mergeProps.
    return withHoistedStyle(
      rule,
      createElement(Base, {
        ...rest,
        'data-ui-part': part,
        'data-ui-component': component,
        className:
          typeof className === 'function'
            ? (state: unknown) => classes(className(state))
            : classes(className),
        style: consumerStyle,
      }),
    );
  }
  ThemedPart.displayName = `Themed(${component}.${part})`;
  return ThemedPart as unknown as C;
}
