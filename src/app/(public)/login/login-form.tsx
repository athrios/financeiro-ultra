"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useActionState, type ReactNode } from "react";

import { FieldError } from "@/components/auth/field-error";
import { FormMessage } from "@/components/auth/form-message";
import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { textLinkClassName } from "@/components/ui/text-link";

import { signIn, type LoginState } from "./actions";

const initialState: LoginState = { message: null, tone: "danger", field: null, email: "" };

/**
 * O formulário fica FORA de qualquer <Suspense>: assim a resposta de um envio sem JavaScript
 * já traz a mensagem de erro no HTML (a hidratação do estado só casa com o formulário do
 * primeiro passo de renderização). Os dados que dependem da requisição (aviso e destino)
 * entram por estes dois encaixes, cada um com a sua fronteira.
 */
export function LoginForm({ notice, nextField }: { notice: ReactNode; nextField: ReactNode }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      {nextField}

      {state.message ? <FormMessage tone={state.tone}>{state.message}</FormMessage> : notice}

      <div className="grid gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="username"
          defaultValue={state.email}
          aria-invalid={state.field === "email" ? true : undefined}
          aria-describedby={state.field === "email" ? "email-erro" : undefined}
          className="h-11 md:h-9"
          required
          autoFocus
        />
        {state.field === "email" && <FieldError id="email-erro">Informe um e-mail válido.</FieldError>}
      </div>

      <PasswordField
        name="password"
        label="Senha"
        autoComplete="current-password"
        error={state.field === "password" ? "Informe a senha." : null}
        required
      />

      <Button type="submit" size="lg" disabled={pending} className="h-11 w-full md:h-9">
        {pending ? (
          <>
            <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />
            Entrando…
          </>
        ) : (
          "Entrar"
        )}
      </Button>

      <p className="text-center text-sm">
        <Link
          href="/recuperar-senha"
          className={textLinkClassName}
        >
          Esqueci minha senha
        </Link>
      </p>
    </form>
  );
}
