"use client";

import {
  Archive,
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  Award,
  Bell,
  Bold,
  BookOpen,
  Bookmark,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  CreditCard,
  Download,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  Gift,
  Globe,
  House,
  Inbox,
  Info,
  Italic,
  ListOrdered,
  LoaderCircle,
  Mailbox,
  MapPin,
  Minus,
  Package,
  PanelLeft,
  Paperclip,
  Pause,
  Pencil,
  Play,
  Plus,
  Printer,
  Redo2,
  Save,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Stamp,
  Tag,
  Timer,
  Trash2,
  TrendingUp,
  Truck,
  Underline,
  Undo2,
  UsersRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { GraphicalProvider, IconRendererProvider, theme } from "@graphical";
import type { ColorMode, ThemeIconName, ThemeIconRenderProps } from "@graphical";

/** Every icon the themed components ask for, drawn from Lucide, the theme's selected pack. */
const lucide: Record<ThemeIconName, LucideIcon> = {
  home: House,
  folder: Folder,
  team: UsersRound,
  settings: Settings,
  inboxTray: Inbox,
  shoppingBag: ShoppingBag,
  gift: Gift,
  creditCard: CreditCard,
  award: Award,
  pause: Pause,
  play: Play,
  bookmark: Bookmark,
  arrowRight: ArrowRight,
  archive: Archive,
  inbox: ArrowDownToLine,
  adjust: SlidersHorizontal,
  document: FileText,
  search: Search,
  paperclip: Paperclip,
  bell: Bell,
  trash: Trash2,
  stamp: Stamp,
  globe: Globe,
  pencil: Pencil,
  mailbox: Mailbox,
  panelLeft: PanelLeft,
  check: Check,
  chevronDown: ChevronDown,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  minus: Minus,
  plus: Plus,
  close: X,
  info: Info,
  bold: Bold,
  italic: Italic,
  underline: Underline,
  copy: Copy,
  download: Download,
  filePlus: FilePlus,
  folderOpen: FolderOpen,
  printer: Printer,
  save: Save,
  undo: Undo2,
  redo: Redo2,
  arrowUp: ArrowUp,
  calendarPlus: CalendarPlus,
  calendarDays: CalendarDays,
  mapPin: MapPin,
  tag: Tag,
  package: Package,
  truck: Truck,
  listOrdered: ListOrdered,
  loader: LoaderCircle,
  timer: Timer,
  bookOpen: BookOpen,
  checkCheck: CheckCheck,
  shieldCheck: ShieldCheck,
  trendingUp: TrendingUp,
};

/**
 * Lucide is outline-only. A filled request falls through to the bundled
 * renderer, which carries its own filled Lucide artwork.
 */
function renderIcon({ name, family, variant, weight: _weight, hugeiconsVariant: _variant, ...svg }: ThemeIconRenderProps) {
  if (family !== "Lucide" || variant !== "outlined") return undefined;
  const Icon = lucide[name];
  return <Icon data-icon-family="Lucide" data-icon-style="outlined" strokeWidth="var(--icon-stroke-width, 2)" {...svg} />;
}

/** The Untitled theme around the whole page, in the page's colour mode, with Lucide icons. */
export function Theme({ colorMode, children }: { colorMode: ColorMode; children: ReactNode }) {
  return (
    <GraphicalProvider document={theme} colorMode={colorMode}>
      <IconRendererProvider renderIcon={renderIcon}>{children}</IconRendererProvider>
    </GraphicalProvider>
  );
}
