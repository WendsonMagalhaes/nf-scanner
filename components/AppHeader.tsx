import { FileText, ScanText } from "lucide-react";
import { APP_NAME, APP_SUBTITLE, APP_VERSION } from "@/lib/app-info";

export default function AppHeader() {
    return (
        <header className="sticky top-0 z-30 border-b border-white/10 bg-ink text-paper">
            <div className="px-4 sm:px-8 lg:px-16">
                <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4">
                    {/* Marca */}
                    <a href="/" className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-clay text-paper shadow-sm">
                            <FileText size={18} />
                        </span>
                        <span className="leading-tight">
                            <span className="block text-sm font-semibold tracking-tight">
                                {APP_NAME}
                            </span>
                            <span className="block text-[11px] text-paper/50">{APP_SUBTITLE}</span>
                        </span>
                    </a>

                    {/* Área do sistema */}
                    <div className="flex items-center gap-3 text-xs">
                        <span className="hidden items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-paper/70 sm:inline-flex">
                            <ScanText size={13} className="text-clay" />
                            NF-e · OCR em português
                        </span>
                        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-paper/60">
                            v{APP_VERSION}
                        </span>
                    </div>
                </div>
            </div>
        </header>
    );
}