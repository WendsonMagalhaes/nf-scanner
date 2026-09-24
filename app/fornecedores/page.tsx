"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Trash2, Download, Upload, Lock } from "lucide-react";
import { FORNECEDORES } from "@/lib/fornecedores";
import {
  baixarTexto,
  formatarRaiz,
  lerAprendidos,
  normalizarCnpj,
  salvarAprendidos,
} from "@/lib/storage";

export default function FornecedoresPage() {
  const [meus, setMeus] = useState<Record<string, string>>({});
  const [carregado, setCarregado] = useState(false);
  const [cnpj, setCnpj] = useState("");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const arquivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMeus(lerAprendidos());
    setCarregado(true);
  }, []);

  function atualizar(novo: Record<string, string>) {
    setMeus(novo);
    salvarAprendidos(novo);
  }

  function adicionar() {
    const raiz = normalizarCnpj(cnpj);
    if (!raiz) return setErro("Informe o CNPJ (pelo menos os 8 primeiros dígitos).");
    if (!nome.trim()) return setErro("Informe o nome do fornecedor.");
    setErro("");
    atualizar({ ...meus, [raiz]: nome.trim().toUpperCase() });
    setCnpj("");
    setNome("");
  }

  function editar(raiz: string, novoNome: string) {
    if (!novoNome.trim() || novoNome.trim().toUpperCase() === meus[raiz]) return;
    atualizar({ ...meus, [raiz]: novoNome.trim().toUpperCase() });
  }

  function remover(raiz: string) {
    const { [raiz]: _, ...resto } = meus;
    atualizar(resto);
  }

  function exportar() {
    baixarTexto("fornecedores.json", JSON.stringify(meus, null, 2), "application/json");
  }

  async function importar(file: File) {
    try {
      const dados = JSON.parse(await file.text());
      const novo: Record<string, string> = { ...meus };
      for (const [k, v] of Object.entries(dados)) {
        const raiz = normalizarCnpj(k);
        if (raiz && typeof v === "string" && v.trim()) novo[raiz] = v.trim().toUpperCase();
      }
      atualizar(novo);
      setErro("");
    } catch {
      setErro("Arquivo inválido. Use um JSON no formato { \"cnpj\": \"NOME\" }.");
    }
  }

  const q = busca.trim().toLowerCase();
  const meusFiltrados = useMemo(
    () => Object.entries(meus).filter(([k, v]) => !q || `${k} ${v}`.toLowerCase().includes(q)).sort((a, b) => a[1].localeCompare(b[1])),
    [meus, q]
  );
  const padrao = useMemo(
    () =>
      Object.entries(FORNECEDORES)
        .filter(([k, v]) => !q || `${k} ${v}`.toLowerCase().includes(q))
        .sort((a, b) => a[1].localeCompare(b[1])),
    [q]
  );

  return (
    <main className="px-4 py-10 sm:px-8 lg:px-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Fornecedores</h1>
          <p className="mt-1 text-sm text-ink/60">
            O CNPJ é lido com segurança; o nome, no OCR, pode sair com erro. Aqui você define como cada
            fornecedor deve aparecer no arquivo — as notas dele passam a sair certas e marcadas como “pronto”.
          </p>
        </div>

        {/* Adicionar */}
        <div className="rounded-2xl border border-ink/10 bg-white/60 p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink/50">Novo fornecedor</p>
          <div className="flex flex-wrap gap-2">
            <input
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              placeholder="CNPJ (ex.: 08.915.713/0001-97)"
              className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-clay focus:outline-none sm:w-64"
            />
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && adicionar()}
              placeholder="Nome no arquivo (ex.: FRIGORIFICO VALENCIO LTDA)"
              className="min-w-[220px] flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-clay focus:outline-none"
            />
            <button
              onClick={adicionar}
              className="inline-flex items-center gap-1.5 rounded-lg bg-clay px-4 py-2 text-sm font-medium text-paper hover:bg-clayDark"
            >
              <Plus size={15} /> Adicionar
            </button>
          </div>
          {erro && <p className="mt-2 text-xs text-red-600">{erro}</p>}
          <p className="mt-2 text-[11px] text-ink/40">
            Vale para todas as filiais (usa os 8 primeiros dígitos do CNPJ).
          </p>
        </div>

        {/* Busca + backup */}
        <div className="my-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou CNPJ"
              className="w-full rounded-lg border border-ink/15 bg-white py-2 pl-9 pr-3 text-sm focus:border-clay focus:outline-none"
            />
          </div>
          <button
            onClick={exportar}
            disabled={Object.keys(meus).length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-3 py-2 text-xs font-medium text-ink/70 hover:border-clay hover:text-clayDark disabled:opacity-40"
          >
            <Download size={14} /> Exportar
          </button>
          <button
            onClick={() => arquivoRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-3 py-2 text-xs font-medium text-ink/70 hover:border-clay hover:text-clayDark"
          >
            <Upload size={14} /> Importar
          </button>
          <input
            ref={arquivoRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importar(f);
              e.target.value = "";
            }}
          />
        </div>

        {/* Meus fornecedores */}
        <h2 className="mb-2 mt-6 text-sm font-semibold">Meus fornecedores ({meusFiltrados.length})</h2>
        <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-sand/60 text-left text-xs uppercase tracking-wide text-ink/50">
                <th className="px-4 py-3 font-medium">CNPJ (raiz)</th>
                <th className="px-4 py-3 font-medium">Nome no arquivo</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {meusFiltrados.map(([raiz, n]) => (
                <tr key={raiz} className="border-b border-ink/5 last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-ink/70">{formatarRaiz(raiz)}</td>
                  <td className="px-4 py-2.5">
                    <input
                      defaultValue={n}
                      key={n}
                      onBlur={(e) => editar(raiz, e.target.value)}
                      className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-xs hover:border-ink/15 focus:border-clay focus:bg-white focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => remover(raiz)} title="Remover" className="text-ink/30 hover:text-red-600">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {carregado && meusFiltrados.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-ink/50">
                    Nenhum fornecedor seu ainda. Adicione acima ou corrija um nome na tela de renomear — o app memoriza.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Padrão do sistema */}
        <h2 className="mb-2 mt-8 flex items-center gap-1.5 text-sm font-semibold">
          <Lock size={13} className="text-ink/40" /> Já incluídos no sistema ({padrao.length})
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white/40">
          <table className="w-full text-sm">
            <tbody>
              {padrao.map(([raiz, n]) => (
                <tr key={raiz} className="border-b border-ink/5 last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-ink/50">{formatarRaiz(raiz)}</td>
                  <td className="px-4 py-2.5 text-xs text-ink/70">{n}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right text-[11px] text-moss">
                    {meus[raiz] ? "substituído por você" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-ink/40">
          Sua lista fica só neste navegador. Para usar em outro computador, use Exportar/Importar — ou peça para
          incluir no arquivo <span className="font-mono">lib/fornecedores.ts</span>.
        </p>
      </div>
    </main>
  );
}
