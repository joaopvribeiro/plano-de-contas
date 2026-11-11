import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "@fontsource-variable/archivo";
import "@fontsource-variable/figtree";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Carregando } from "@/components/carregando";

export const metadata: Metadata = {
  title: "Resolutto Family",
  description: "Planejamento financeiro da sua família, com a Resolutto.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#010a26" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-dvh">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {/* Todo o app depende da sessão; o esqueleto é a casca estática enquanto os dados chegam. */}
          <Suspense fallback={<Carregando />}>{children}</Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
