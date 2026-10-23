import type { Metadata } from "next";
import { Suspense } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { parsePasswordMode } from "@/lib/auth-link";
import { isRecentLinkSession } from "@/lib/link-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { SessionExpired } from "./session-expired";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = {
  title: "Definir senha",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function SetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Card>
      <Suspense
        fallback={
          <CardContent aria-busy="true" className="grid gap-4">
            <Skeleton className="h-11 w-full md:h-9" />
            <Skeleton className="h-11 w-full md:h-9" />
          </CardContent>
        }
      >
        <SetPasswordContent searchParams={searchParams} />
      </Suspense>
    </Card>
  );
}

/**
 * O proxy deixa esta rota passar sem sessão para que a página mostre "Sessão expirada"
 * (UX-11). A verificação real é feita aqui e na Server Action: sem sessão válida, nada do
 * formulário é exibido nem processado.
 */
async function SetPasswordContent({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  // Só a sessão aberta há pouco por convite ou recuperação define senha aqui (SEG-E45-01).
  if (!data?.claims?.sub || !isRecentLinkSession(data.claims)) {
    return <SessionExpired />;
  }

  const params = await searchParams;
  const raw = Array.isArray(params.modo) ? params.modo[0] : params.modo;
  return <SetPasswordForm mode={parsePasswordMode(raw)} />;
}
