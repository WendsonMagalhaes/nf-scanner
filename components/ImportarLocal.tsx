"use client";

import { useEffect, useState } from "react";
import { DatabaseZap, Loader2 } from "lucide-react";
import { importarLocalParaBanco, lerPendenteLocal, totalPendenteLocal, type PendenteLocal } from "@/lib/storage";

/**
 * Aviso que aparece só se ainda houver dados antigos neste navegador
 * (histórico, nomes e categorias de fornecedor) para enviar ao banco.
 */
export default function ImportarLocal({ onImportado }: { onImportado: () => void }) {
  const [pendente, setPendente] = useState<PendenteLocal | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const p = lerPendenteLocal();
    if (totalPendenteLocal(p) > 0) setPendente(p);
  }, []);

  if (!pendente) return null;

  async function enviar() {
    setEnviando(true);
    setErro("");
    const r = await importarLocalParaBanco(pendente!);
    setEnviando(false);
    if (!r.ok) return setErro(r.erro ?? "Não consegui enviar para o banco.");
    setPendente(null);
    onImportado();
  }

  const nForn = new Set([...Object.keys(pendente.nomes), ...Object.keys(pendente.categorias)]).size;

  return (
    <div className="mb-4 rounded-xl border border-clay/30 bg-clay/5 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-start gap-2 text-sm text-ink/80">
          <DatabaseZap size={16} className="mt-0.5 shrink-0 text-clayDark" />
          <span>
            Encontrei dados antigos neste navegador: <b>{pendente.historico.length}</b> nota
            {pendente.historico.length !== 1 ? "s" : ""} no histórico e <b>{nForn}</b> fornecedor
            {nForn !== 1 ? "es" : ""}. Quer enviar para o banco?
          </span>
        </p>
        <button
          onClick={enviar}
          disabled={enviando}
          className="inline-flex items-center gap-1.5 rounded-lg bg-clay px-3 py-2 text-xs font-medium text-paper hover:bg-clayDark disabled:opacity-50"
        >
          {enviando && <Loader2 size={14} className="animate-spin" />} Enviar para o banco
        </button>
      </div>
      {erro && <p className="mt-2 text-xs text-red-600">{erro}</p>}
    </div>
  );
}
