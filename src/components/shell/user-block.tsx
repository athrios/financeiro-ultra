import { LogOut } from "lucide-react";

import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

import { initialsOf } from "./initials";

interface UserBlockProps {
  /** Nome, ou e-mail se não houver nome. */
  displayName: string | null;
  /** "Administrador · Sócio Alfa", ou só o papel. */
  roleText: string | null;
}

/**
 * Bloco do usuário (03-ui-ux.md, 2.2): iniciais, nome (ou e-mail), papel e o botão "Sair"
 * sempre visível. Sair não pede confirmação (é reversível).
 */
export function UserBlock({ displayName, roleText }: UserBlockProps) {
  return (
    <div className="shrink-0 border-t p-3">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold">
          {initialsOf(displayName)}
        </span>
        <div className="min-w-0">
          {displayName && <p className="truncate text-sm font-medium">{displayName}</p>}
          {roleText && <p className="truncate text-xs text-muted-foreground">{roleText}</p>}
        </div>
      </div>
      <form action={signOut} className="mt-3">
        <Button type="submit" variant="outline" className="h-11 w-full lg:h-8">
          <LogOut aria-hidden="true" />
          Sair
        </Button>
      </form>
    </div>
  );
}
