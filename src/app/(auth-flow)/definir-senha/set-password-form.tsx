"use client";

import { CircleCheck, Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import { FormMessage } from "@/components/auth/form-message";
import { PasswordField } from "@/components/auth/password-field";
import { PasswordRules } from "@/components/auth/password-rules";
import { Button, buttonVariants } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import type { PasswordMode } from "@/lib/auth-link";
import { cn } from "@/lib/utils";

import { setPassword, type SetPasswordState } from "./actions";
import { SessionExpired } from "./session-expired";

const initialState: SetPasswordState = { status: "idle", passwordError: null, confirmError: null, message: null };

const COPY: Record<PasswordMode, { title: string; description: string; button: string }> = {
  convite: {
    title: "Defina sua senha",
    description: "Bem-vindo ao Financeiro Ultra. Crie uma senha para acessar sua conta.",
    button: "Definir senha",
  },
  recuperacao: {
    title: "Redefinir senha",
    description: "Crie uma nova senha para acessar sua conta.",
    button: "Salvar nova senha",
  },
};

export function SetPasswordForm({ mode }: { mode: PasswordMode }) {
  const [state, formAction, pending] = useActionState(setPassword, initialState);
  const [password, setPasswordValue] = useState("");
  const doneRef = useRef<HTMLHeadingElement>(null);

  // Sucesso na própria página: o foco vai para o título do novo estado (03-ui-ux.md, 2.5.2).
  useEffect(() => {
    if (state.status === "done") doneRef.current?.focus();
  }, [state.status]);

  if (state.status === "expired") return <SessionExpired />;

  if (state.status === "done") {
    return (
      <CardContent className="grid gap-4 text-center">
        <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full border border-success-border bg-success text-success-foreground">
          <CircleCheck className="size-6" />
        </span>
        <div role="status" className="grid gap-2">
          <h1 ref={doneRef} tabIndex={-1} className="font-heading text-xl leading-snug font-medium outline-none">
            Senha definida
          </h1>
          <p className="text-sm text-muted-foreground">Sua senha foi salva.</p>
        </div>
        {/*
          Navegação de documento (não <Link>) de propósito: com cacheComponents o roteador do cliente
          mantém a tela anterior oculta no DOM (Activity), e o status "Senha definida" ficava
          carregado atrás de "Sem acesso ativo" (achado do QA). A navegação completa descarta o
          estado antigo e ainda recarrega a sessão que acabou de mudar (nova senha).
        */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className={cn(buttonVariants(), "h-11 w-full md:h-9")}>
          Ir para o Financeiro Ultra
        </a>
      </CardContent>
    );
  }

  const copy = COPY[mode];
  return (
    <>
      <CardHeader>
        <h1 className="font-heading text-xl leading-snug font-medium">{copy.title}</h1>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4" noValidate>
          {state.message && <FormMessage tone="danger">{state.message}</FormMessage>}

          <PasswordField
            name="password"
            label="Nova senha"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPasswordValue(event.target.value)}
            help={<PasswordRules password={password} />}
            error={state.passwordError}
            required
            autoFocus
          />
          <PasswordField
            name="confirm"
            label="Confirmar nova senha"
            autoComplete="new-password"
            error={state.confirmError}
            required
          />

          <Button type="submit" disabled={pending} className="h-11 w-full md:h-9">
            {pending ? (
              <>
                <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />
                Salvando…
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
