import type { DbEnums } from "@/lib/supabase/types";

/** Papel do usuário (enum `app_role` do banco). */
export type UserRole = DbEnums["app_role"];

export const USER_ROLES = ["ADMINISTRATOR", "OPERATOR", "VIEWER", "PARTNER"] as const satisfies readonly UserRole[];

/** Rótulos da interface (03-ui-ux.md, 0.2): nunca mostrar o nome técnico do papel. */
export const ROLE_LABEL: Readonly<Record<UserRole, string>> = {
  ADMINISTRATOR: "Administrador",
  OPERATOR: "Operador",
  VIEWER: "Visualizador",
  PARTNER: "Sócio",
};
