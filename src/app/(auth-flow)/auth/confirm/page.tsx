import type { Metadata } from "next";
import { Suspense } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { parseAuthLink } from "@/lib/auth-link";

import { ConfirmForm, InvalidLink } from "./confirm-form";

export const metadata: Metadata = {
  title: "Confirmar link",
  // O endereço traz um token de uso único: não deve ser indexado nem enviado como referência.
  // "strict-origin" manda no máximo o domínio (nunca o caminho com o token). Não usar
  // "no-referrer": ele faz o navegador enviar `Origin: null` no envio do formulário sem
  // JavaScript (ou antes da hidratação) e o Next recusa a Server Action (500).
  robots: { index: false, follow: false },
  referrer: "strict-origin",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function ConfirmPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Card>
      <Suspense
        fallback={
          <CardContent aria-busy="true">
            <p className="sr-only" role="status">
              Verificando o link…
            </p>
            <Skeleton className="h-11 w-full md:h-9" />
          </CardContent>
        }
      >
        <ConfirmContent searchParams={searchParams} />
      </Suspense>
    </Card>
  );
}

async function ConfirmContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const link = parseAuthLink({ token_hash: first(params.token_hash), type: first(params.type) });

  // Sem token_hash ou com formato inválido: mesma tela de link inválido (sem detalhe).
  if (!link) return <InvalidLink isInvite={first(params.type) === "invite"} />;

  return <ConfirmForm tokenHash={link.tokenHash} type={link.type} />;
}
