import { AuthLayout } from "@/components/auth/auth-layout";

// /auth/confirm cria a sessão; /definir-senha exige a sessão. Moldura de auth, sem menu de
// módulos: quem acabou de aceitar um convite pode não ter perfil ainda (03-ui-ux.md, 2.1).
export default function AuthFlowLayout({ children }: LayoutProps<"/">) {
  return <AuthLayout>{children}</AuthLayout>;
}
