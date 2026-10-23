import type { Metadata } from "next";

import { ModulePage } from "@/components/shell/module-page";

export const metadata: Metadata = {
  title: "Importar comprovantes",
};

// Módulo ainda não implementado (placeholder da FND). O papel é conferido em ModulePage.
export default function Page() {
  return <ModulePage href="/importar-comprovantes" />;
}
