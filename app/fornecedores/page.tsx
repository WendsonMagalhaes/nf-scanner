"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Trash2, Download, Upload, Lock, Loader2, AlertTriangle } from "lucide-react";
import { FORNECEDORES, categoriaCompraPorCnpj, type CategoriaCompra } from "@/lib/fornecedores";
import {
  baixarTexto,
  formatarRaiz,
  listarFornecedores,
  normalizarCnpj,
  removerFornecedor,
  salvarFornecedor,
  salvarFornecedores,
} from "@/lib/storage";
import ImportarLocal from "@/components/ImportarLocal";

interface Meu {
  nome: string | null;
  categoria: CategoriaCompra | null;
}

const ROTULO_CATEGORIA: Record<CategoriaCompra, string> = {
  padrao: "Revenda",
  produto: "Não revenda",
};

export default function FornecedoresPage() {
  const [meus, setMeus] = useState<Record<string, Meu>>({});
  const [carregado, setCarregado] = useState(false);
  const [cnpj, setCnpj] = useState("");
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState("");
  const [erroBanco, setErroBanco] = useState("");
  const [busca, setBusca] = useState("");
  const arquivoRef = useRef<HTMLInputElement>(null);

  async function carregar() {
    const r = await listarFornecedores();
    if (r.ok) {
      const mapa: Record<string, Meu> = {};
      for (const f of r.dados ?? []) mapa[f.cnpj] = { nome: f.nome, categoria: f.categoria };
      setMeus(mapa);
      setErroBanco("");
    } else {
      setErroBanco(
        r.configurado === false
          ? "O banco ainda não foi configurado: coloque a DATABASE_URL do Neon no arquivo .env.local e reinicie o app."
          : `Não consegui carregar os fornecedores do banco (${r.erro ?? "erro"}).`
      );
    }
    setCarregado(true);
  }

  useEffect(() => {
    carregar();
  }, []);

  /** Aplica na tela e grava no banco; se o banco recusar, recarrega o que está salvo. */
  async function gravar(raiz: string, patch: Partial<Meu>) {
    setMeus((prev) => ({ ...prev, [raiz]: { ...(prev[raiz] ?? { nome: null, categoria: null }), ...patch } }));
    const r = await salvarFornecedor({ cnpj: raiz, ...patch });
    if (!r.ok) {
      setErro(`Não consegui salvar no banco (${r.erro ?? "erro"}).`);
      carregar();
    } else {
      setErro("");
    }
  }

  function adicionar() {
    const raiz = normalizarCnpj(cnpj);
    if (!raiz) return setErro("Informe o CNPJ (pelo menos os 8 primeiros dígitos).");
    if (!nome.trim()) return setErro("Informe o nome do fornecedor.");
    setErro("");
    gravar(raiz, { nome: nome.trim().toUpperCase() });
    setCnpj("");
    setNome("");
  }

  function editar(raiz: string, novoNome: string) {
    if (!novoNome.trim() || novoNome.trim().toUpperCase() === meus[raiz]?.nome) return;
    gravar(raiz, { nome: novoNome.trim().toUpperCase() });
  }

  function mudarCategoria(raiz: string, valor: string) {
    gravar(raiz, { categoria: valor === "padrao" || valor === "produto" ? valor : null });
  }

  async function remover(raiz: string) {
    setMeus((prev) => {
      const { [raiz]: _, ...resto } = prev;
      return resto;
    });
    const r = await removerFornecedor(raiz);
    if (!r.ok) {
      setErro(`Não consegui remover (${r.erro ?? "erro"}).`);
      carregar();
    }
  }

  function exportar() {
    const saida: Record<string, Meu> = {};
    for (const [k, v] of Object.entries(meus)) saida[k] = v;
    baixarTexto("fornecedores.json", JSON.stringify(saida, null, 2), "application/json");
  }

  /** Aceita { "cnpj": "NOME" } (formato antigo) e { "cnpj": { nome, categoria } }. */
  async function importar(file: File) {
    try {
      const dados = JSON.parse(await file.text());
      const itens: { cnpj: string; nome?: string | null; categoria?: CategoriaCompra | null }[] = [];
      for (const [k, v] of Object.entries(dados)) {
        const raiz = normalizarCnpj(k);
        if (!raiz) continue;
        if (typeof v === "string" && v.trim()) itens.push({ cnpj: raiz, nome: v });
        else if (v && typeof v === "object") {
          const o = v as { nome?: unknown; categoria?: unknown };
          const item: (typeof itens)[number] = { cnpj: raiz };
          if (typeof o.nome === "string" && o.nome.trim()) item.nome = o.nome;
          if (o.categoria === "padrao" || o.categoria === "produto") item.categoria = o.categoria;
          if ("nome" in item || "categoria" in item) itens.push(item);
        }
      }
      if (itens.length === 0) return setErro("Nenhum fornecedor válido no arquivo.");
      const r = await salvarFornecedores(itens);
      if (!r.ok) return setErro(`Não consegui salvar no banco (${r.erro ?? "erro"}).`);
      setErro("");
      carregar();
    } catch {
      setErro('Arquivo inválido. Use um JSON no formato { "cnpj": "NOME" }.');
    }
  }

  const q = busca.trim().toLowerCase();
  const meusFiltrados = useMemo(
    () =>
      Object.entries(meus)
        .filter(([k, v]) => !q || `${k} ${v.nome ?? ""}`.toLowerCase().includes(q))
        .sort((a, b) => (a[1].nome ?? "~").localeCompare(b[1].nome ?? "~")),
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

        <ImportarLocal onImportado={carregar} />

        {erroBanco && (
          <p className="mb-4 flex items-start gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {erroBanco}
          </p>
        )}

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
                <th className="px-4 py-3 font-medium">Categoria da compra</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {meusFiltrados.map(([raiz, m]) => (
                <tr key={raiz} className="border-b border-ink/5 last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-ink/70">{formatarRaiz(raiz)}</td>
                  <td className="px-4 py-2.5">
                    <input
                      defaultValue={m.nome ?? ""}
                      key={m.nome ?? ""}
                      placeholder="(usa o nome lido da nota)"
                      onBlur={(e) => editar(raiz, e.target.value)}
                      className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-xs hover:border-ink/15 focus:border-clay focus:bg-white focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={m.categoria ?? ""}
                      onChange={(e) => mudarCategoria(raiz, e.target.value)}
                      className="rounded-md border border-ink/15 bg-white px-1 py-1 text-xs focus:border-clay focus:outline-none"
                    >
                      <option value="">Automática</option>
                      <option value="padrao">Revenda</option>
                      <option value="produto">Não revenda</option>
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => remover(raiz)} title="Remover" className="text-ink/30 hover:text-red-600">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {meusFiltrados.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-ink/50">
                    {!carregado ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" /> Carregando do banco…
                      </span>
                    ) : (
                      "Nenhum fornecedor seu ainda. Adicione acima ou corrija um nome na tela de renomear — o app memoriza."
                    )}
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
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink/50">
                    {(() => {
                      const c = categoriaCompraPorCnpj(raiz);
                      return c ? ROTULO_CATEGORIA[c] : "";
                    })()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right text-[11px] text-moss">
                    {meus[raiz]?.nome || meus[raiz]?.categoria ? "ajustado por você" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-ink/40">
          Sua lista fica salva no banco e vale em qualquer computador. O que você ajusta aqui tem prioridade sobre a
          lista que já vem no sistema (<span className="font-mono">lib/fornecedores.ts</span>).
        </p>
      </div>
    </main>
  );
}
