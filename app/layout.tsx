import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppHeader from "@/components/AppHeader";
import AppFooter from "@/components/AppFooter";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Renomeador de Notas Fiscais",
  description: "Renomeie NF-e em lote a partir dos dados extraídos do PDF",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="flex min-h-screen flex-col bg-paper font-sans text-ink antialiased">
        <AppHeader />
        <div className="flex-1">{children}</div>
        <AppFooter />
      </body>
    </html>
  );
}