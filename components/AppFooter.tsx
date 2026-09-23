import { APP_NAME, APP_SUBTITLE, APP_VERSION, FILENAME_PATTERN } from "@/lib/app-info";

export default function AppFooter() {
    const year = new Date().getFullYear();

    return (
        <footer className="mt-16 border-t border-ink/10 bg-white/60">
            <div className="px-4 sm:px-8 lg:px-16">
                <div className="mx-auto grid max-w-5xl gap-6 py-8 text-sm md:grid-cols-3">
                    <div>
                        <p className="font-semibold tracking-tight">{APP_NAME}</p>
                        <p className="mt-1 text-xs text-ink/50">{APP_SUBTITLE}</p>
                    </div>

                    <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-ink/40">
                            Padrão de nome
                        </p>
                        <p className="mt-1 break-words font-mono text-xs text-ink/70">
                            {FILENAME_PATTERN}.pdf
                        </p>
                    </div>

                    <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-ink/40">
                            Privacidade
                        </p>
                        <p className="mt-1 text-xs text-ink/60">
                            Os PDFs são lidos apenas para extrair os dados. Nenhum arquivo é
                            armazenado pelo sistema.
                        </p>
                    </div>
                </div>
            </div>

            <div className="border-t border-ink/10 px-4 sm:px-8 lg:px-16">
                <div className="mx-auto flex max-w-5xl flex-col gap-1 py-3 text-[11px] text-ink/40 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                        © {year} {APP_NAME}. Todos os direitos reservados.
                    </span>
                    <span className="font-mono">v{APP_VERSION}</span>
                </div>
            </div>
        </footer>
    );
}