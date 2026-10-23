import {
  ArrowLeftRight,
  Banknote,
  Calculator,
  CalendarDays,
  FileUp,
  Handshake,
  KeyRound,
  LayoutDashboard,
  ScanSearch,
  SlidersHorizontal,
  Tags,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { NavIconName } from "@/lib/navigation";

/** Nome do ícone (dado serializável de `lib/navigation`) -> componente lucide. */
export const NAV_ICONS: Readonly<Record<NavIconName, LucideIcon>> = {
  "layout-dashboard": LayoutDashboard,
  "calendar-days": CalendarDays,
  banknote: Banknote,
  "file-up": FileUp,
  "scan-search": ScanSearch,
  calculator: Calculator,
  "arrow-left-right": ArrowLeftRight,
  users: Users,
  handshake: Handshake,
  "key-round": KeyRound,
  tags: Tags,
  "sliders-horizontal": SlidersHorizontal,
};
