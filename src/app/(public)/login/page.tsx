import type { Metadata } from "next";
import { Suspense } from "react";

import { FormMessage } from "@/components/auth/form-message";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { safeInternalPath } from "@/lib/safe-redirect";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Entrar",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const NOTICES = {
  "sessao-expirada": { tone: "info", text: "Sua sessão expirou. Entre novamente para continuar." },
  "senha-definida": { tone: "success", text: "Senha definida. Entre com a nova senha." },
} as const;

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  // searchParams só existe em tempo de requisição (Cache Components): cada dado que depende dele
  // fica atrás do seu <Suspense>. O formulário em si fica fora, para o envio sem JavaScript
  // devolver a mensagem de erro já no HTML.
  return (
    <Card>
      <CardHeader>
        <h1 className="text-xl leading-snug font-medium">Entrar</h1>
        <CardDescription>Acesse com seu e-mail e senha.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <LoginForm
          notice={
            <Suspense fallback={null}>
              <LoginNotice searchParams={searchParams} />
            </Suspense>
          }
          nextField={
            <Suspense fallback={<input type="hidden" name="next" value="/" />}>
              <NextField searchParams={searchParams} />
            </Suspense>
          }
        />
        <p className="text-center text-xs text-muted-foreground">
          O acesso é por convite. Se você ainda não recebeu um, procure um Administrador.
        </p>
      </CardContent>
    </Card>
  );
}

async function LoginNotice({ searchParams }: { searchParams: SearchParams }) {
  const aviso = first((await searchParams).aviso);
  const notice = aviso === "sessao-expirada" || aviso === "senha-definida" ? NOTICES[aviso] : null;
  return notice ? <FormMessage tone={notice.tone}>{notice.text}</FormMessage> : null;
}

async function NextField({ searchParams }: { searchParams: SearchParams }) {
  // Somente caminho interno (anti open redirect); revalidado de novo na Server Action.
  const next = safeInternalPath(first((await searchParams).next));
  return <input type="hidden" name="next" value={next} />;
}
