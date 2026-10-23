import { Check, Circle } from "lucide-react";

import { evaluatePassword } from "@/lib/password-policy";

/**
 * Requisitos da senha (03-ui-ux.md, 2.5.2): a lista aparece ANTES de qualquer erro e marca
 * cada item como cumprido ou pendente com ícone + texto. O anúncio ao leitor de tela é um
 * resumo ("2 de 3 requisitos cumpridos") em região polite: o texto só muda quando a contagem
 * muda, então não repete a cada tecla.
 */
export function PasswordRules({ password }: { password: string }) {
  const rules = evaluatePassword(password);
  const metCount = rules.filter((rule) => rule.met).length;
  const touched = password.length > 0;

  return (
    <div>
      <p className="mb-1">A senha precisa ter:</p>
      <ul className="grid gap-0.5">
        {rules.map((rule) => {
          const met = touched && rule.met;
          return (
            <li key={rule.id} className="flex items-center gap-1.5">
              {met ? (
                <Check aria-hidden="true" className="size-3.5 shrink-0 text-success-foreground" />
              ) : (
                <Circle aria-hidden="true" className="size-3.5 shrink-0" />
              )}
              <span>{rule.label}</span>
              <span className="sr-only">{met ? " — cumprido" : " — pendente"}</span>
            </li>
          );
        })}
      </ul>
      <p className="sr-only" role="status" aria-live="polite">
        {touched ? `${metCount} de ${rules.length} requisitos cumpridos` : ""}
      </p>
    </div>
  );
}
