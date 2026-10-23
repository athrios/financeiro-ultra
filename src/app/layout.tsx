import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Formato do título (03-ui-ux.md, 0.1): "{Página} · Financeiro Ultra".
export const metadata: Metadata = {
  title: {
    template: "%s · Financeiro Ultra",
    default: "Financeiro Ultra",
  },
  description: "Recebimentos, distribuição econômica e compensação entre sócios.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background">{children}</body>
    </html>
  );
}
