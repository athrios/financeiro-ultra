import { FileSearch } from "lucide-react";
import Link from "next/link";

import { Brand } from "@/components/shell/brand";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * 404 de URL que não corresponde a nenhuma rota (03-ui-ux.md, 4.8 caso b). Fica no layout
 * raiz: SEM shell, sem sessão, sem nome nem papel do usuário e sem consultar dados.
 * Sem sessão, o proxy leva a mesma URL ao /login antes de chegar aqui (4.8).
 */
export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-8">
      <title>Página não encontrada · Financeiro Ultra</title>
      <Brand />
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <FileSearch className="size-6" />
          </span>
          <h1 className="text-xl font-semibold">Página não encontrada</h1>
          <p className="text-sm text-muted-foreground">O endereço não existe ou foi removido.</p>
          <Link href="/" className={cn(buttonVariants(), "mt-2 h-11 w-full sm:h-9 sm:w-auto")}>
            Ir para o início
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
