"use client";

import { CircleAlert, Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { FormMessage } from "@/components/auth/form-message";
import { Button, buttonVariants } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import type { AuthLinkType } from "@/lib/auth-link";
import { cn } from "@/lib/utils";

import { confirmAuthLink, type ConfirmState } from "./actions";

const initialState: ConfirmState = { status: "idle" };

const COPY: Record<AuthLinkType, { title: string; description: string; button: string }> = {
  invite: {
    title: "Você foi convidado",
    description: "Aceite o convite para criar sua senha e acessar o Financeiro Ultra.",
    button: "Aceitar convite",
  },
  recovery: {
    title: "Redefinir senha",
    description: "Continue para criar uma nova senha de acesso ao Financeiro Ultra.",
    button: "Continuar",
  },
};

/** Tela intermediária: só o clique no botão troca o link por sessão (03-ui-ux.md, 2.5.1). */
export function ConfirmForm({ tokenHash, type }: { tokenHash: string; type: AuthLinkType }) {
  const [state, formAction, pending] = useActionState(confirmAuthLink, initialState);

  if (state.status === "invalid") {
    return <InvalidLink isInvite={type === "invite"} />;
  }

  const copy = COPY[type];
  return (
    <>
      <CardHeader>
        <h1 className="font-heading text-xl leading-snug font-medium">{copy.title}</h1>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          {state.status === "retry" && (
            <FormMessage tone="danger">Não foi possível verificar o link agora. Tente novamente em instantes.</FormMessage>
          )}
          <Button type="submit" disabled={pending} className="h-11 w-full md:h-9">
            {pending ? (
              <>
                <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />
                Verificando…
              </>
            ) : (
              copy.button
            )}
          </Button>
        </form>
      </CardContent>
    </>
  );
}

/** Link inválido, usado ou expirado (03-ui-ux.md, 4.6). */
export function InvalidLink({ isInvite }: { isInvite: boolean }) {
  return (
    <CardContent className="grid gap-4 text-center">
      <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full border border-danger-border bg-danger text-danger-foreground">
        <CircleAlert className="size-6" />
      </span>
      <div className="grid gap-2" role="alert">
        <h1 className="font-heading text-xl leading-snug font-medium">Link inválido ou expirado</h1>
        <p className="text-sm text-muted-foreground">Este link já foi usado ou venceu. Peça um novo para continuar.</p>
        {isInvite && (
          <p className="text-sm text-muted-foreground">
            Se você foi convidado e o link não funciona mais, peça um novo convite a um Administrador.
          </p>
        )}
      </div>
      <div className="grid gap-2">
        <Link href="/recuperar-senha" className={cn(buttonVariants(), "h-11 w-full md:h-9")}>
          Solicitar novo link
        </Link>
        <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "h-11 w-full md:h-9")}>
          Voltar para o login
        </Link>
      </div>
    </CardContent>
  );
}
