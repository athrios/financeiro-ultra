"use client";

import { Loader2, Mail } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";

import { FieldError } from "@/components/form/field-error";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { textLinkClassName } from "@/components/ui/text-link";

import { requestPasswordReset, type RecoveryState } from "./actions";

/** Intervalo de espera para reenviar (o Supabase hospedado limita o envio por usuário). */
const RESEND_SECONDS = 60;

const initialState: RecoveryState = {
  status: "idle",
  email: "",
  tone: "danger",
  message: null,
  field: null,
  sentCount: 0,
};

export function RecoveryForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  if (state.status === "sent") {
    // key: cada envio bem-sucedido remonta o estado e reinicia a contagem do reenvio.
    return <SentState key={state.sentCount} state={state} formAction={formAction} pending={pending} />;
  }

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      {state.message && <FormMessage tone={state.tone}>{state.message}</FormMessage>}

      <div className="grid gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          defaultValue={state.email}
          aria-invalid={state.field === "email" ? true : undefined}
          aria-describedby={state.field === "email" ? "email-erro" : undefined}
          className="h-11 md:h-9"
          required
          autoFocus
        />
        {state.field === "email" && <FieldError id="email-erro">Informe um e-mail válido.</FieldError>}
      </div>

      <Button type="submit" disabled={pending} className="h-11 w-full md:h-9">
        {pending ? (
          <>
            <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />
            Enviando…
          </>
        ) : (
          "Enviar link"
        )}
      </Button>

      <p className="text-center text-sm">
        <Link
          href="/login"
          className={textLinkClassName}
        >
          Voltar para o login
        </Link>
      </p>
    </form>
  );
}

function SentState({
  state,
  formAction,
  pending,
}: {
  state: RecoveryState;
  formAction: (formData: FormData) => void;
  pending: boolean;
}) {
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const confirmationRef = useRef<HTMLDivElement>(null);

  // O foco vai para a confirmação (03-ui-ux.md, 5.2: sucesso que muda de tela).
  useEffect(() => {
    confirmationRef.current?.focus();
  }, []);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const canResend = secondsLeft <= 0;

  return (
    <div className="grid gap-4 text-center">
      <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full border border-success-border bg-success text-success-foreground">
        <Mail className="size-6" />
      </span>
      <div ref={confirmationRef} role="status" className="grid gap-2 outline-none" tabIndex={-1}>
        <h2 className="text-lg font-semibold">Verifique seu e-mail</h2>
        <p className="text-sm text-muted-foreground">
          Se houver uma conta para <strong className="font-medium break-all text-foreground">{state.email}</strong>,
          enviamos um link para criar uma nova senha. Se não encontrar a mensagem, confira a caixa de spam.
        </p>
      </div>

      <form action={formAction} className="grid gap-2">
        <input type="hidden" name="email" value={state.email} />
        <Button type="submit" variant="outline" disabled={!canResend || pending} className="h-11 w-full md:h-9">
          {pending ? "Enviando…" : "Enviar novamente"}
        </Button>
        {/* Contagem visível, sem anunciar a cada segundo: o anúncio é feito só no início e ao liberar. */}
        <p className="text-sm text-muted-foreground" aria-hidden="true">
          {canResend ? "Já é possível reenviar." : `Disponível em ${secondsLeft} s`}
        </p>
        <p className="sr-only" role="status" aria-live="polite">
          {canResend
            ? "Já é possível reenviar o link."
            : `Você poderá reenviar o link em ${RESEND_SECONDS} segundos.`}
        </p>
        {state.message && <FormMessage tone={state.tone}>{state.message}</FormMessage>}
      </form>

      <p className="text-sm">
        <Link
          href="/login"
          className={textLinkClassName}
        >
          Voltar para o login
        </Link>
      </p>
    </div>
  );
}
