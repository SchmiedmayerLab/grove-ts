//
// This source file is part of the Grove open-source project
//
// SPDX-FileCopyrightText: 2026 Stanford University and the project authors (see CONTRIBUTORS.md)
//
// SPDX-License-Identifier: MIT
//

import { type CSSProperties } from "react";

/**
 * CSS color value.
 * @example rgb(255 255 255)
 */
// eslint-disable-next-line sonarjs/redundant-type-aliases -- The semantic alias documents the value's role in theme tokens.
type RGBColor = string;

/**
 * Interface of theme variables used by the design-system.
 */
export interface Theme {
  [key: string]: string;
  "color-surface": RGBColor;
  "color-surface-primary": RGBColor;
  "color-foreground": RGBColor;
  "color-card": RGBColor;
  "color-card-foreground": RGBColor;
  "color-popover": RGBColor;
  "color-popover-foreground": RGBColor;
  "color-primary": RGBColor;
  "color-primary-foreground": RGBColor;
  "color-secondary": RGBColor;
  "color-secondary-foreground": RGBColor;
  "color-muted": RGBColor;
  "color-muted-foreground": RGBColor;
  "color-accent": RGBColor;
  "color-accent-foreground": RGBColor;
  "color-border": RGBColor;
  "color-input": RGBColor;
  "color-destructive": RGBColor;
  "color-destructive-foreground": RGBColor;
  "color-success": RGBColor;
  "color-success-foreground": RGBColor;
  "color-warning": RGBColor;
  "color-warning-dark": RGBColor;
  "color-warning-foreground": RGBColor;
  "color-inverted": RGBColor;
  "color-inverted-foreground": RGBColor;
  "color-ring": RGBColor;
}

/**
 * Color-scheme preference used by {@link GroveProvider}.
 * `system` follows the browser's `prefers-color-scheme` setting.
 */
export type ColorScheme = "light" | "dark" | "system";

/**
 * A concrete color scheme after resolving a system preference.
 */
export type ResolvedColorScheme = Exclude<ColorScheme, "system">;

/**
 * Theme tokens for each supported color scheme.
 */
export interface GroveThemes {
  light: Theme;
  dark: Theme;
}

export type ThemeCSSProperties = CSSProperties & Record<`--${string}`, string>;

/**
 * Converts Grove theme tokens into inheritable CSS custom properties.
 */
export const themeToCSSProperties = (theme: Theme): ThemeCSSProperties =>
  Object.fromEntries(
    Object.entries(theme).map(([name, value]) => [`--${name}`, value]),
  );
