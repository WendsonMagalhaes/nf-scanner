"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, Search, Trash2, History as HistoryIcon, Copy, Check } from "lucide-react";
import {
  baixarTexto,
  lerHistorico,
  salvarHistorico,
  type RegistroHistorico,
} from "@/lib/storage";
import { rotuloTipo } from "@/lib/extract";

function formatarQuando(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function HistoricoPage() {
  const [lista, setLista] = useState<RegistroHistorico[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<"todos" | "NFe" | "NFSe">("todos");
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => {
    setLista(lerHistorico());
    setCarregado(true);
  }, []);

  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter(
      (r) =>
        (tipo === "todos" || r.tipo === tipo) &&
        (!q || `${r.nomeFinal} ${r.arquivoOriginal} ${r.fornecedor} ${r.numero}`.toLowerCase().includes(q))
    );
  }, [lista, busca, tipo]);

  const qtdNfe = lista.filter((r) => r.tipo === "NFe").length;
  const qtdNfse = lista.length - qtdNfe;

  function remover(id: string) {
    const nova = lista.filter((r) => r.id !== id);
    setLista(nova);
    salvarHistorico(nova);
  }

  function limpar() {
    if (!confirm("Apagar todo o histórico deste navegador?")) return;
    setLista([]);
    salvarHistorico([]);
  }

  function exportarCsv() {
    const cab = ["Gerado em", "Tipo", "Data", "Número", "Fornecedor", "Nome final", "Arquivo original"];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const linhas = filtrada.map((r) =>
      [formatarQuando(r.quando), rotuloTipo(r.tipo), r.data, r.numero, r.fornecedor, r.nomeFinal, r.arquivoOriginal]
        .map(esc)
        .join(";")
    );
    // BOM + ";" para o Excel brasileiro abrir com acentos e colunas certas
    baixarTexto("historico-notas.csv", "\ufeff" + [cab.map(esc).join(";"), ...linhas].join("\r\n"), "text/csv;charset=utf-8");
  }

  async function copiar(r: RegistroHistorico) {
    try {
      await navigator.clipboard.writeText(r.nomeFinal);
      setCopiado(r.id);
      setTimeout(() => setCopiado(null), 1500);
    } catch {
      /* sem permissão de área de transferência */
    }
  }

  return (
    <main className="px-4 py-10 sm:px-8 lg:px-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Histórico</h1>
            <p className="mt-1 text-sm text-ink/60">
              Notas que já saíram em um .zip neste navegador. Fica só no seu computador.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportarCsv}
              disabled={filtrada.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-moss px-3 py-2 text-xs font-medium text-paper hover:bg-moss/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download size={14} /> Exportar CSV
            </button>
            <button
              onClick={limpar}
              disabled={lista.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-3 py-2 text-xs font-medium text-ink/70 hover:border-red-300 hover:text-red-600 disabled:opacity-40"
            >
              <Trash2 size={14} /> Limpar
            </button>
          </div>
        </div>

        {/* Resumo */}
        <div className="mb-4 grid grid-cols-3 gap-3">
          {[
            { rotulo: "Total", valor: lista.length },
            { rotulo: "NF-e (produtos)", valor: qtdNfe },
            { rotulo: "NFS-e (serviços)", valor: qtdNfse },
          ].map((c) => (
            <div key={c.rotulo} className="rounded-xl border border-ink/10 bg-white/60 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink/40">{c.rotulo}</p>
              <p className="mt-1 text-2xl font-semibold text-clayDark">{c.valor}</p>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por fornecedor, número ou nome do arquivo"
              className="w-full rounded-lg border border-ink/15 bg-white py-2 pl-9 pr-3 text-sm focus:border-clay focus:outline-none"
            />
          </div>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as typeof tipo)}
            className="rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-clay focus:outline-none"
          >
            <option value="todos">Todos os tipos</option>
            <option value="NFe">NF-e</option>
            <option value="NFSe">NFS-e</option>
          </select>
        </div>

        {carregado && lista.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-ink/15 bg-white/50 px-6 py-16 text-center">
            <HistoryIcon size={32} className="text-ink/30" />
            <p className="font-medium">Nada por aqui ainda</p>
            <p className="max-w-sm text-sm text-ink/50">
              Quando você baixar um .zip com notas renomeadas, elas aparecem nesta lista.
            </p>
            <Link href="/" className="mt-1 rounded-lg bg-clay px-4 py-2 text-sm font-medium text-paper hover:bg-clayDark">
              Renomear notas
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10 bg-sand/60 text-left text-xs uppercase tracking-wide text-ink/50">
                  <th className="px-4 py-3 font-medium">Gerado em</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Nome final</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtrada.map((r) => (
                  <tr key={r.id} className="border-b border-ink/5 last:border-0 hover:bg-sand/30">
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-ink/60">{formatarQuando(r.quando)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                          r.tipo === "NFSe" ? "bg-moss/10 text-moss" : "bg-clay/10 text-clayDark"
                        }`}
                      >
                        {rotuloTipo(r.tipo)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="break-all font-mono text-xs">{r.nomeFinal}</p>
                      <p className="mt-0.5 text-[11px] text-ink/40">original: {r.arquivoOriginal}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button onClick={() => copiar(r)} title="Copiar nome" className="mr-2 text-ink/30 hover:text-clay">
                        {copiado === r.id ? <Check size={15} className="text-moss" /> : <Copy size={15} />}
                      </button>
                      <button onClick={() => remover(r.id)} title="Remover" className="text-ink/30 hover:text-red-600">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
                {carregado && lista.length > 0 && filtrada.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-ink/50">
                      Nenhuma nota encontrada com esse filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
