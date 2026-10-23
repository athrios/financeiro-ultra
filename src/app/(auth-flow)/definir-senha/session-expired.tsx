import { CircleAlert } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** /definir-senha sem sessão (03-ui-ux.md, 2.5.2 e UX-11). */
export function SessionExpired() {
  return (
    <CardContent className="grid gap-4 text-center">
      <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full border border-danger-border bg-danger text-danger-foreground">
        <CircleAlert className="size-6" />
      </span>
      <div className="grid gap-2" role="alert">
        <h1 className="font-heading text-xl leading-snug font-medium">Sessão expirada</h1>
        <p className="text-sm text-muted-foreground">
          Sua sessão para definir a senha expirou. Solicite um novo link.
        </p>
      </div>
      <Link href="/recuperar-senha" className={cn(buttonVariants(), "h-11 w-full md:h-9")}>
        Solicitar novo link
      </Link>
    </CardContent>
  );
}
