/**
 * Estrutura única de navegação do shell (03-ui-ux.md, 2.3 e 3.4).
 *
 * Fonte para a barra lateral, o painel móvel, as páginas-placeholder e os testes.
 * Módulos do Brain 05, na ordem do fluxo operacional (04), com "Sócios" no lugar de
 * "Partes" (RAT-D017). NÃO existe "Regras de divisão" (RAT-D015).
 *
 * `roles` serve APENAS para a experiência (o que o menu mostra). A autorização real é
 * do servidor e do RLS. Para o papel PARTNER nada é mostrado enquanto a P-02b estiver
 * aberta (negar por padrão).
 */

import type { UserRole } from "@/lib/roles";

export type NavIconName =
  | "layout-dashboard"
  | "calendar-days"
  | "banknote"
  | "file-up"
  | "scan-search"
  | "calculator"
  | "arrow-left-right"
  | "users"
  | "handshake"
  | "key-round"
  | "tags"
  | "sliders-horizontal";

export type NavSectionId = "inicio" | "operacao" | "fechamento" | "cadastros" | "configuracoes";

export interface NavItem {
  label: string;
  href: string;
  icon: NavIconName;
  section: NavSectionId;
  /** Papéis para os quais o item aparece no menu (somente UX). */
  roles: readonly UserRole[];
  /** `false` = módulo ainda não implementado: selo "Em breve" e página-placeholder. */
  available: boolean;
  /** Texto de apoio da página-placeholder. */
  description: string;
}

const ALL_BUT_PARTNER = ["ADMINISTRATOR", "OPERATOR", "VIEWER"] as const satisfies readonly UserRole[];
const OPERATIONAL = ["ADMINISTRATOR", "OPERATOR"] as const satisfies readonly UserRole[];
const ADMIN_ONLY = ["ADMINISTRATOR"] as const satisfies readonly UserRole[];

export const NAV_SECTION_LABELS: Readonly<Record<NavSectionId, string | null>> = {
  inicio: null,
  operacao: "Operação",
  fechamento: "Fechamento",
  cadastros: "Cadastros",
  configuracoes: "Configurações",
};

export const NAV_ITEMS: readonly NavItem[] = [
  {
    label: "Dashboard",
    href: "/",
    icon: "layout-dashboard",
    section: "inicio",
    roles: ALL_BUT_PARTNER,
    available: true,
    description: "Visão geral do que exige a sua decisão.",
  },
  {
    label: "Competências",
    href: "/competencias",
    icon: "calendar-days",
    section: "operacao",
    roles: ALL_BUT_PARTNER,
    available: false,
    description: "Abertura, conferência, apuração, liquidação e reabertura de competências.",
  },
  {
    label: "Recebimentos",
    href: "/recebimentos",
    icon: "banknote",
    section: "operacao",
    roles: ALL_BUT_PARTNER,
    available: false,
    description: "Registro e consulta dos recebimentos dos clientes.",
  },
  {
    label: "Importar comprovantes",
    href: "/importar-comprovantes",
    icon: "file-up",
    section: "operacao",
    roles: OPERATIONAL,
    available: false,
    description: "Envio e reconhecimento de comprovantes de recebimento.",
  },
  {
    label: "Pendências de reconhecimento",
    href: "/pendencias",
    icon: "scan-search",
    section: "operacao",
    roles: ALL_BUT_PARTNER,
    available: false,
    description: "Comprovantes que aguardam revisão antes de virar recebimento.",
  },
  {
    label: "Apuração",
    href: "/apuracao",
    icon: "calculator",
    section: "fechamento",
    roles: ALL_BUT_PARTNER,
    available: false,
    description: "Resultado da competência por sócio.",
  },
  {
    label: "Compensações",
    href: "/compensacoes",
    icon: "arrow-left-right",
    section: "fechamento",
    roles: ALL_BUT_PARTNER,
    available: false,
    description: "Transferências entre sócios geradas pela apuração.",
  },
  {
    label: "Clientes",
    href: "/clientes",
    icon: "users",
    section: "cadastros",
    roles: ALL_BUT_PARTNER,
    available: true,
    description: "Cadastro de clientes, com documento, mensalidade e sócios.",
  },
  {
    label: "Sócios",
    href: "/configuracoes/socios",
    icon: "handshake",
    section: "configuracoes",
    roles: ADMIN_ONLY,
    available: true,
    description: "Cadastro de sócios, seus recebedores e apelidos.",
  },
  {
    label: "Usuários",
    href: "/configuracoes/usuarios",
    icon: "key-round",
    section: "configuracoes",
    roles: ADMIN_ONLY,
    available: false,
    description: "Gestão de usuários e papéis.",
  },
  {
    // R-G05: "alias" só no código e no banco; o menu diz "Apelidos". A rota segue /configuracoes/aliases
    // (lista consolidada só de leitura, E7 da CAD-001; só o Administrador).
    label: "Apelidos",
    href: "/configuracoes/aliases",
    icon: "tags",
    section: "configuracoes",
    roles: ADMIN_ONLY,
    available: true,
    description: "Nomes, chaves e contas usados para reconhecer quem pagou e quem recebeu.",
  },
  {
    label: "Parâmetros do sistema",
    href: "/configuracoes/parametros",
    icon: "sliders-horizontal",
    section: "configuracoes",
    roles: ADMIN_ONLY,
    available: false,
    description: "Parâmetros gerais do sistema.",
  },
];

export interface NavSection {
  id: NavSectionId;
  label: string | null;
  items: readonly NavItem[];
}

export function canSeeNavItem(role: UserRole, item: NavItem): boolean {
  return item.roles.includes(role);
}

/** Seções com os itens que o papel enxerga, na ordem de NAV_ITEMS. Seções vazias somem. */
export function navSectionsForRole(role: UserRole | null): readonly NavSection[] {
  if (role === null) return [];
  const sections: NavSection[] = [];
  for (const item of NAV_ITEMS) {
    if (!canSeeNavItem(role, item)) continue;
    const last = sections.at(-1);
    if (last && last.id === item.section) {
      (last.items as NavItem[]).push(item);
    } else {
      sections.push({ id: item.section, label: NAV_SECTION_LABELS[item.section], items: [item] });
    }
  }
  return sections;
}

export function findNavItemByHref(href: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.href === href);
}

/** Item ativo para o `aria-current`: a rota exata, ou a mais específica que a contém. */
export function activeNavHref(pathname: string): string | null {
  let best: string | null = null;
  for (const item of NAV_ITEMS) {
    const matches = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && (best === null || item.href.length > best.length)) best = item.href;
  }
  return best;
}
