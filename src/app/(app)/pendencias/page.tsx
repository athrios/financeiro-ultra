import type { Metadata } from "next";

import { ModulePage } from "@/components/shell/module-page";

export const metadata: Metadata = {
  title: "Pendências de reconhecimento",
};

// Módulo ainda não implementado (placeholder da FND). O papel é conferido em ModulePage.
export default function Page() {
  return <ModulePage href="/pendencias" />;
}
