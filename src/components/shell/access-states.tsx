import { Hourglass, Lock, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { roleLabel } from "@/server/authorization";
import type { UserRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

import { RecheckAccessButton } from "./recheck-access-button";
import { StatePage } from "./state-page";

/**
 * 2.7.1 — autenticado sem perfil ativo (sem perfil, sem papel ou inativo). A mesma tela
 * cobre os três casos, para não revelar diferenças de configuração (P-10).
 */
export function NoActiveAccessState({ email }: { email: string | null }) {
  return (
    <StatePage
      tone="warning"
      icon={ShieldAlert}
      title="Sem acesso ativo"
      actions={<RecheckAccessButton unchangedMessage="Verificamos novamente. Seu acesso continua sem alteração." />}
    >
      <p>
        Sua conta {email ? <strong className="font-medium text-foreground break-all">{email}</strong> : null} foi
        autenticada, mas não tem acesso ativo ao Financeiro Ultra. Se você esperava ter acesso, peça a um
        Administrador para verificar o seu cadastro.
      </p>
    </StatePage>
  );
}

/**
 * 2.7.3 — papel Sócio sem escopo definido (P-02b). Informativo, sem "negado", sem vermelho
 * e sem o nome do sócio vinculado.
 */
export function PartnerNoScopeState() {
  return (
    <StatePage
      tone="info"
      icon={Hourglass}
      title="Acesso de sócio ainda não disponível"
      actions={<RecheckAccessButton unchangedMessage="Verificamos novamente. Nada mudou no seu acesso." />}
    >
      <p>
        Sua conta está ativa e vinculada a um cadastro de sócio, mas as informações disponíveis para sócios ainda
        estão sendo definidas. Quando forem liberadas, você as verá aqui.
      </p>
    </StatePage>
  );
}

/** 2.7.4 — perfil ativo, área não permitida ao papel. */
export function ForbiddenState({ role }: { role: UserRole }) {
  return (
    <StatePage
      tone="neutral"
      icon={Lock}
      title="Sem permissão"
      actions={
        <Link href="/" className={cn(buttonVariants({ variant: "default" }), "h-11 w-full md:h-9")}>
          Voltar ao Dashboard
        </Link>
      }
    >
      <p>Seu papel ({roleLabel(role)}) não permite acessar esta área.</p>
    </StatePage>
  );
}
