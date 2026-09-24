"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, History, Building2, HelpCircle, Upload } from "lucide-react";
import { APP_NAME, APP_SUBTITLE, APP_VERSION } from "@/lib/app-info";

const LINKS = [
    { href: "/", label: "Renomear", icon: Upload },
    { href: "/historico", label: "Histórico", icon: History },
    { href: "/fornecedores", label: "Fornecedores", icon: Building2 },
    { href: "/ajuda", label: "Ajuda", icon: HelpCircle },
];

export default function AppHeader() {
    const pathname = usePathname();

    return (
        <header className="sticky top-0 z-30 border-b-[3px] border-moss bg-gradient-to-r from-clayDark via-clay to-clay text-paper shadow-md shadow-clayDark/20">
            <div className="px-4 sm:px-8 lg:px-16">
                <div className="mx-auto flex max-w-5xl flex-col gap-2 py-2 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:py-0">
                    {/* Marca */}
                    <Link href="/" className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-paper text-clayDark shadow-sm">
                            <FileText size={18} />
                        </span>
                        <span className="leading-tight">
                            <span className="block text-sm font-semibold tracking-tight">
                                {APP_NAME}
                            </span>
                            <span className="block text-[11px] text-paper/70">{APP_SUBTITLE}</span>
                        </span>
                    </Link>

                    {/* Navegação */}
                    <nav className="-mx-1 flex items-center gap-1 overflow-x-auto sm:mx-0">
                        {LINKS.map(({ href, label, icon: Icon }) => {
                            const ativo = href === "/" ? pathname === "/" : pathname.startsWith(href);
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    aria-current={ativo ? "page" : undefined}
                                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${ativo
                                            ? "bg-paper text-clayDark shadow-sm"
                                            : "text-paper/85 hover:bg-white/15 hover:text-paper"
                                        }`}
                                >
                                    <Icon size={14} />
                                    {label}
                                </Link>
                            );
                        })}
                        <span className="ml-2 hidden rounded-md bg-black/15 px-2 py-1 font-mono text-[11px] text-paper/80 sm:inline">
                            v{APP_VERSION}
                        </span>
                    </nav>
                </div>
            </div>
        </header>
    );
}
