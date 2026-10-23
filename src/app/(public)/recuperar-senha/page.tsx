import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

import { RecoveryForm } from "./recovery-form";

export const metadata: Metadata = {
  title: "Recuperar senha",
};

export default function RecoverPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <h1 className="font-heading text-xl leading-snug font-medium">Recuperar senha</h1>
        <CardDescription>
          Informe o e-mail da sua conta. Enviaremos um link para criar uma nova senha.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RecoveryForm />
      </CardContent>
    </Card>
  );
}
