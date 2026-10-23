import { LogOut } from "lucide-react";

import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

interface AppHeaderProps {
  userName?: string | null;
  roleLabel?: string;
}

export function AppHeader({ userName, roleLabel }: AppHeaderProps) {
  return (
    <header className="border-b bg-background">
      <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Financeiro
          </p>
          <h1 className="text-lg font-semibold leading-tight">Ultra Contabilidade</h1>
        </div>
        <div className="flex items-center gap-3">
          {userName && (
            <div className="hidden text-right text-sm sm:block">
              <p className="font-medium leading-tight">{userName}</p>
              {roleLabel && <p className="text-xs text-muted-foreground">{roleLabel}</p>}
            </div>
          )}
          <form action={signOut}>
            <Button type="submit" variant="outline" size="sm">
              <LogOut data-icon="inline-start" />
              Sair
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
