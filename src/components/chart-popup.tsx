"use client";

import { themePart } from "@graphical/components/library/component-theme";

/*
 * The theme's preview card parts, for the hover cards on charts. The charts
 * are server components that show their cards with CSS on hover and focus,
 * so they take the themed parts, not Base UI's PreviewCard with its portal.
 */
export const ChartPopup = themePart("div", "preview-card", "popover", "ui-popup ui-popover");
export const ChartPopupTitle = themePart("div", "preview-card", "title", "ui-title");
export const ChartPopupDescription = themePart("div", "preview-card", "description", "ui-copy");
