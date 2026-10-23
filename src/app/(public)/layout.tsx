import { AuthLayout } from "@/components/auth/auth-layout";

// Rotas sem sessão: /login e /recuperar-senha (03-ui-ux.md, 2.1).
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return <AuthLayout>{children}</AuthLayout>;
}
