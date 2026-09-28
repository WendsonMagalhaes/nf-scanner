"use client";

import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { CATEGORIA_LABEL, type Categoria, type TipoDoc } from "@/lib/extract";

/** Campos da linha que o visualizador precisa (compatível com o Row do app/page.tsx). */
export interface ViewerRow {
    id: string;
    file: File;
    date: string;
    nfNumber: string;
    supplier: string;
    docType: TipoDoc;
    categoria: Categoria;
    confidence?: "alta" | "baixa";
}

interface Props {
    row: ViewerRow;
    /** nome final calculado (ou null se faltar campo) */
    finalName: string | null;
    position: number; // 1-based
    total: number;
    onChange: (patch: Partial<ViewerRow>) => void;
    onSupplierBlur: () => void;
    onNavigate: (dir: -1 | 1) => void;
    onClose: () => void;
}

const inputCls =
    "w-full rounded-md border border-ink/15 bg-white px-2.5 py-1.5 text-sm focus:border-clay focus:outline-none";
const labelCls = "mb-1 block text-xs font-medium uppercase tracking-wide text-ink/50";

export default function NotaViewer({
    row,
    finalName,
    position,
    total,
    onChange,
    onSupplierBlur,
    onNavigate,
    onClose,
}: Props) {
    const [url, setUrl] = useState<string | null>(null);

    // URL temporária do PDF para o <iframe> (libera da memória ao trocar/fechar)
    useEffect(() => {
        const objectUrl = URL.createObjectURL(row.file);
        setUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [row.file]);

    // Esc fecha
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-3 sm:p-6"
            onClick={onClose}
        >
            <div
                className="flex h-full max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-paper shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Cabeçalho */}
                <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2">
                        <button
                            onClick={() => onNavigate(-1)}
                            disabled={position <= 1}
                            className="rounded-md p-1 text-ink/60 hover:bg-sand disabled:opacity-30"
                            title="Nota anterior"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <button
                            onClick={() => onNavigate(1)}
                            disabled={position >= total}
                            className="rounded-md p-1 text-ink/60 hover:bg-sand disabled:opacity-30"
                            title="Próxima nota"
                        >
                            <ChevronRight size={18} />
                        </button>
                        <p className="truncate text-sm font-medium">{row.file.name}</p>
                        <span className="shrink-0 text-xs text-ink/40">
                            {position} de {total}
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-md p-1 text-ink/60 hover:bg-sand"
                        title="Fechar (Esc)"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Corpo: PDF à esquerda, campos à direita */}
                <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                    <div className="min-h-0 flex-1 bg-sand/40">
                        {url && (
                            <iframe
                                key={url}
                                src={url}
                                title={`Visualização de ${row.file.name}`}
                                className="h-full w-full"
                            />
                        )}
                    </div>

                    <aside className="w-full shrink-0 space-y-4 overflow-y-auto border-t border-ink/10 p-4 md:w-80 md:border-l md:border-t-0">
                        <div>
                            <label className={labelCls}>Data</label>
                            <input
                                value={row.date}
                                onChange={(e) => onChange({ date: e.target.value })}
                                placeholder="dd-mm-aaaa"
                                className={inputCls}
                            />
                        </div>

                        <div>
                            <label className={labelCls}>Tipo / Nº</label>
                            <div className="flex gap-2">
                                <select
                                    value={row.docType}
                                    onChange={(e) => onChange({ docType: e.target.value as TipoDoc })}
                                    className="rounded-md border border-ink/15 bg-white px-2 py-1.5 text-sm focus:border-clay focus:outline-none"
                                >
                                    <option value="NFe">NF-e</option>
                                    <option value="NFSe">NFS-e</option>
                                </select>
                                <input
                                    value={row.nfNumber}
                                    onChange={(e) => onChange({ nfNumber: e.target.value.replace(/\D/g, "") })}
                                    placeholder="000372196"
                                    className={inputCls}
                                />
                            </div>
                        </div>

                        <div>
                            <label className={labelCls}>Fornecedor</label>
                            <input
                                value={row.supplier}
                                onChange={(e) => onChange({ supplier: e.target.value })}
                                onBlur={onSupplierBlur}
                                placeholder="FORNECEDOR LTDA"
                                className={inputCls}
                            />
                        </div>

                        <div>
                            <label className={labelCls}>Categoria</label>
                            <select
                                value={row.categoria}
                                onChange={(e) => onChange({ categoria: e.target.value as Categoria })}
                                className={inputCls}
                            >
                                {Object.entries(CATEGORIA_LABEL).map(([valor, rotulo]) => (
                                    <option key={valor} value={valor}>
                                        {rotulo}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="rounded-xl border border-ink/10 bg-white/70 p-3">
                            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink/50">
                                Nome final
                            </p>
                            {finalName ? (
                                <p className="break-all font-mono text-xs text-ink/80">{finalName}</p>
                            ) : (
                                <p className="text-xs text-clayDark">Preencha data, número e fornecedor.</p>
                            )}
                        </div>

                        {finalName && row.confidence !== "baixa" && (
                            <p className="inline-flex items-center gap-1 text-xs text-moss">
                                <CheckCircle2 size={14} /> pronto
                            </p>
                        )}
                        {finalName && row.confidence === "baixa" && (
                            <p className="inline-flex items-center gap-1 text-xs text-clayDark">
                                <AlertTriangle size={14} /> conferir dados no PDF ao lado
                            </p>
                        )}
                    </aside>
                </div>
            </div>
        </div>
    );
}