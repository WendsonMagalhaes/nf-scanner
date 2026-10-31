"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  UploadCloud,
  Loader2,
  Download,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  FileWarning,
  Eye,
  Archive,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import {
  buildFilename,
  sanitizeForFilename,
  CATEGORIA_LABEL,
  type TipoDoc,
  type Categoria,
} from "@/lib/extract";
import { FILENAME_PATTERN } from "@/lib/app-info";
import NotaViewer from "@/components/NotaViewer";
import {
  adicionarHistorico,
  memorizarCategoria,
  memorizarFornecedor,
  registrarCorrecoes,
  resumoAprendizado,
  type CorrecaoRegistro,
} from "@/lib/storage";
import { baixarBlob, gerarZip, nomesUnicos } from "@/lib/download";
import { mostrarErro } from "@/lib/notificar";
import { toast } from "sonner";

type Status = "pending" | "processing" | "done" | "error";

/** Nome da pasta de cada categoria dentro do .zip (curto, sem "/"). */
const PASTA_CATEGORIA: Record<Categoria, string> = {
  padrao: "Padrão",
  produto: "Produto",
  servico: "Serviço",
  devolucaoCliente: "Devolução de cliente",
  devolucaoFornecedor: "Devolução a fornecedor",
  devolucaoVenda: "Devolução de venda",
};

/** Ordem de saída: Padrão primeiro, depois as demais na ordem do sistema. */
const ORDEM_CATEGORIA = Object.keys(CATEGORIA_LABEL) as Categoria[];

type CampoOrdem = "arquivo" | "data" | "tipo" | "fornecedor" | "categoria" | "status";

/** Valores como vieram do PDF (antes de qualquer correção na tela). */
interface Snapshot {
  date: string;
  nfNumber: string;
  supplier: string;
  docType: TipoDoc;
  categoria: Categoria;
}

interface Row {
  id: string;
  file: File;
  status: Status;
  date: string; // dd-mm-aaaa
  nfNumber: string;
  supplier: string;
  /** NF-e (produto) ou NFS-e (serviço) */
  docType: TipoDoc;
  /** padrão / produto / serviço / devolução... — vira sufixo no final do nome do arquivo */
  categoria: Categoria;
  /** CNPJ do emitente (14 dígitos) — usado para memorizar correções de nome e de categoria */
  cnpj?: string;
  /** chave de acesso de 44 dígitos (só NF-e) — vai para o histórico no banco */
  chaveAcesso?: string;
  /** entrada = nota de terceiro; saída = nota emitida pela sua empresa */
  direcao?: "entrada" | "saida";
  /** "baixa" = dados extraídos sem confirmação (conferir); vira "alta" quando o usuário edita */
  confidence?: "alta" | "baixa";
  error?: string;
  /** como foi extraído; comparado com a tela para aprender com as correções */
  original?: Snapshot;
  /** a nota já foi renomeada antes (pelo histórico do usuário) */
  duplicada?: { quando: string; nomeFinal: string; motivo: "chave" | "numero" } | null;
}

function snapshotDe(r: Row): Snapshot {
  return { date: r.date, nfNumber: r.nfNumber, supplier: r.supplier, docType: r.docType, categoria: r.categoria };
}

/** Diferenças entre o que o sistema leu e o que o usuário deixou. */
function correcoesDe(row: Row): CorrecaoRegistro[] {
  const o = row.original;
  if (!o) return [];
  const base = { cnpj: row.cnpj ?? null, arquivo: row.file.name };
  const itens: CorrecaoRegistro[] = [];
  if (row.supplier.trim() && o.supplier.trim() !== row.supplier.trim())
    itens.push({ ...base, campo: "fornecedor", valorExtraido: o.supplier || null, valorCorrigido: row.supplier });
  if (o.categoria !== row.categoria)
    itens.push({ ...base, campo: "categoria", valorExtraido: o.categoria, valorCorrigido: row.categoria });
  if (row.date && o.date !== row.date)
    itens.push({ ...base, campo: "data", valorExtraido: o.date || null, valorCorrigido: row.date });
  if (row.nfNumber && o.nfNumber !== row.nfNumber)
    itens.push({ ...base, campo: "numero", valorExtraido: o.nfNumber || null, valorCorrigido: row.nfNumber });
  if (o.docType !== row.docType)
    itens.push({ ...base, campo: "tipo", valorExtraido: o.docType, valorCorrigido: row.docType });
  return itens;
}

function mensagemBanco(salvo: { configurado?: boolean; erro?: string }) {
  return salvo.configurado === false
    ? "Arquivos baixados, mas o histórico não foi salvo: falta configurar o banco (DATABASE_URL no .env.local)."
    : `Arquivos baixados, mas não consegui salvar no histórico do banco (${salvo.erro ?? "erro"}).`;
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function Home() {
  const [rows, setRows] = useState<Row[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const setAvisoBanco = mostrarErro;
  /** Ordenação da tabela: clique no cabeçalho alterna crescente, decrescente e original. */
  const [ordem, setOrdem] = useState<{ campo: CampoOrdem; direcao: "asc" | "desc" } | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [totalCorrecoes, setTotalCorrecoes] = useState(0);

  useEffect(() => {
    resumoAprendizado().then((r) => {
      if (r.ok && r.dados) setTotalCorrecoes(r.dados.total);
    });
  }, []);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const pdfFiles = Array.from(fileList).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );
    if (pdfFiles.length === 0) return;

    const newRows: Row[] = pdfFiles.map((file) => ({
      id: newId(),
      file,
      status: "pending",
      date: "",
      nfNumber: "",
      supplier: "",
      docType: "NFe" as TipoDoc,
      categoria: "padrao" as Categoria,
    }));

    setRows((prev) => [...prev, ...newRows]);
    newRows.forEach(processRow);
  }, []);

  async function processRow(row: Row) {
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, status: "processing" } : r))
    );

    try {
      const fd = new FormData();
      fd.append("file", row.file);
      const res = await fetch("/api/extract", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Falha ao extrair dados do PDF");
      const data = await res.json();

      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
              ...r,
              status: "done",
              date: data.date ?? "",
              nfNumber: data.nfNumber ?? "",
              supplier: data.supplier ?? "",
              docType: (data.docType as TipoDoc) ?? "NFe",
              categoria: (data.categoria as Categoria) ?? "padrao",
              cnpj: data.supplierCnpj ?? undefined,
              direcao: data.direcao,
              chaveAcesso: data.chaveAcesso ?? undefined,
              confidence: data.confidence,
              duplicada: data.duplicada ?? null,
              original: {
                date: data.date ?? "",
                nfNumber: data.nfNumber ?? "",
                supplier: data.supplier ?? "",
                docType: (data.docType as TipoDoc) ?? "NFe",
                categoria: (data.categoria as Categoria) ?? "padrao",
              },
            }
            : r
        )
      );
    } catch (e) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, status: "error", error: "Não consegui ler este PDF" }
            : r
        )
      );
    }
  }

  function updateRow(id: string, patch: Partial<Row>) {
    const atual = rows.find((r) => r.id === id);
    const extra: Partial<Row> = {};

    // trocar o tipo já acerta a categoria: NFS-e => Serviço; voltar p/ NF-e tira o "Serviço"
    if (atual && patch.docType && patch.docType !== atual.docType) {
      if (patch.docType === "NFSe") extra.categoria = "servico";
      else if (atual.categoria === "servico") extra.categoria = "padrao";
    }

    // o usuário corrigiu revenda x não revenda: lembra para esse fornecedor nas próximas notas
    const cat = patch.categoria;
    if (atual && (cat === "padrao" || cat === "produto") && atual.direcao !== "saida" && atual.docType === "NFe") {
      memorizarCategoria(atual.cnpj, cat);
    }

    // ao editar um campo, o usuário está conferindo os dados
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch, ...extra, confidence: "alta" } : r))
    );
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setViewingId((cur) => (cur === id ? null : cur));
  }

  function clearAll() {
    setRows([]);
    setViewingId(null);
  }

  function navigateViewer(dir: -1 | 1) {
    const idx = rows.findIndex((r) => r.id === viewingId);
    const next = rows[idx + dir];
    if (next) setViewingId(next.id);
  }

  function suggestedName(row: Row) {
    if (!row.date || !row.nfNumber || !row.supplier) return null;
    return buildFilename(row.date, row.nfNumber, row.supplier, row.docType, row.categoria);
  }

  const viewingIndex = rows.findIndex((r) => r.id === viewingId);
  const viewingRow = viewingIndex >= 0 ? rows[viewingIndex] : null;
  const readyCount = rows.filter((r) => r.status === "done" && suggestedName(r)).length;
  const prontasLista = () => rows.filter((r) => r.status === "done" && suggestedName(r));
  const categoriasProntas = ORDEM_CATEGORIA.map((c) => [c, prontasLista().filter((r) => r.categoria === c).length] as const).filter(
    ([, n]) => n > 0
  );
  function alternarOrdem(campo: CampoOrdem) {
    setOrdem((atual) => {
      if (!atual || atual.campo !== campo) return { campo, direcao: "asc" };
      if (atual.direcao === "asc") return { campo, direcao: "desc" };
      return null;
    });
  }

  /** Ordem de status: pronto, conferir, revisar, processando, pendente, erro. */
  const rankStatus = (r: Row): number => {
    if (r.status === "error") return 5;
    if (r.status === "pending") return 4;
    if (r.status === "processing") return 3;
    if (!suggestedName(r)) return 2;
    return r.confidence === "baixa" ? 1 : 0;
  };

  /** Chave de comparação por coluna (sempre texto, para ordenar sem surpresas). */
  const CHAVE_ORDEM: Record<CampoOrdem, (r: Row) => string> = {
    arquivo: (r) => r.file.name.toLowerCase(),
    data: (r) => {
      const m = r.date.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      return m ? `${m[3]}${m[2]}${m[1]}` : "";
    },
    tipo: (r) => `${r.docType}${r.nfNumber.padStart(12, "0")}`,
    fornecedor: (r) => r.supplier.trim().toUpperCase(),
    categoria: (r) => String(ORDEM_CATEGORIA.indexOf(r.categoria)).padStart(2, "0"),
    status: (r) => String(rankStatus(r)),
  };

  const linhasOrdenadas = useMemo(() => {
    if (!ordem) return rows;
    const chave = CHAVE_ORDEM[ordem.campo];
    const fator = ordem.direcao === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = chave(a);
      const y = chave(b);
      // vazios ficam sempre no fim, em qualquer direção
      if (x === "" && y !== "") return 1;
      if (y === "" && x !== "") return -1;
      return x < y ? -fator : x > y ? fator : 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, ordem]);

  /** Cabeçalho clicável com seta indicando a ordem atual. */
  const cabecalho = (campo: CampoOrdem, rotulo: string) => {
    const ativo = ordem?.campo === campo;
    const Icone = !ativo ? ArrowUpDown : ordem!.direcao === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        onClick={() => alternarOrdem(campo)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-clayDark ${
          ativo ? "text-clayDark" : ""
        }`}
        title="Clique para ordenar"
      >
        {rotulo}
        <Icone size={12} className={ativo ? "" : "opacity-40"} />
      </button>
    );
  };

  /** Guarda no Histórico as notas que saíram e aprende com as correções feitas nelas. */
  async function registrarSaida(lista: Row[]) {
    const correcoes = lista.flatMap(correcoesDe);
    const salvo = await adicionarHistorico(
      lista.map((r) => ({
        arquivoOriginal: r.file.name,
        nomeFinal: suggestedName(r)!,
        tipo: r.docType,
        categoria: r.categoria,
        data: r.date,
        numero: r.nfNumber,
        fornecedor: r.supplier,
        cnpj: r.cnpj ?? null,
        chaveAcesso: r.chaveAcesso ?? null,
      }))
    );
    if (correcoes.length) {
      const aprendidas = await registrarCorrecoes(correcoes);
      if (aprendidas.ok) setTotalCorrecoes((t) => t + (aprendidas.dados?.gravados ?? 0));
    }
    // o valor atual passa a ser a referência: a mesma correção não conta duas vezes
    const ids = new Set(lista.map((r) => r.id));
    setRows((prev) => prev.map((r) => (ids.has(r.id) ? { ...r, original: snapshotDe(r) } : r)));
    return salvo;
  }

  /** Baixa uma nota só, já com o nome final. */
  async function baixarUma(row: Row) {
    const nome = suggestedName(row);
    if (!nome) return;
    setAvisoBanco("");
    baixarBlob(nome, row.file);
    const salvo = await registrarSaida([row]);
    if (!salvo.ok) setAvisoBanco(mensagemBanco(salvo));
    else toast.success("Nota baixada e registrada no histórico.");
  }

  /**
   * Baixa notas prontas: num .zip (uma pasta por categoria) ou soltas, agrupadas
   * por categoria com Padrão primeiro. Os nomes são calculados sobre todas as
   * notas prontas, assim o mesmo arquivo sai com o mesmo nome em qualquer grupo.
   */
  async function baixarLista(lista: Row[], modo: "zip" | "soltos") {
    if (lista.length === 0) return;
    setBaixando(true);
    setAvisoBanco("");
    try {
      const todas = prontasLista();
      const nomeDe = new Map<string, string>();
      nomesUnicos(todas.map((r) => suggestedName(r)!)).forEach((n, i) => nomeDe.set(todas[i].id, n));
      const ordenadas = [...lista].sort((a, b) => ORDEM_CATEGORIA.indexOf(a.categoria) - ORDEM_CATEGORIA.indexOf(b.categoria));

      if (modo === "zip") {
        const zip = await gerarZip(
          ordenadas.map((r) => ({ nome: nomeDe.get(r.id)!, arquivo: r.file, pasta: PASTA_CATEGORIA[r.categoria] }))
        );
        baixarBlob(`notas-renomeadas-${new Date().toISOString().slice(0, 10)}.zip`, zip);
      } else {
        for (const r of ordenadas) {
          baixarBlob(nomeDe.get(r.id)!, r.file);
          // pequena pausa entre os downloads para o navegador não descartar nenhum
          await pausa(400);
        }
      }

      const n = ordenadas.length;
      const s_ = n === 1 ? "" : "s";
      // registra no Histórico (banco). Se falhar, os arquivos já foram baixados normalmente.
      const salvo = await registrarSaida(ordenadas);
      if (!salvo.ok) setAvisoBanco(mensagemBanco(salvo));
      else
        toast.success(
          modo === "zip"
            ? `${n} nota${s_} no .zip, em pastas por categoria. Registrada${s_} no histórico.`
            : `${n} arquivo${s_} baixado${s_}, agrupado${s_} por categoria. Registrado${s_} no histórico.`
        );
    } catch {
      setAvisoBanco("Não consegui gerar os arquivos. Tente de novo.");
    } finally {
      setBaixando(false);
    }
  }

  function baixarTodas(modo: "zip" | "soltos") {
    return baixarLista(prontasLista(), modo);
  }

  function baixarCategoria(categoria: Categoria) {
    return baixarLista(prontasLista().filter((r) => r.categoria === categoria), "soltos");
  }

  return (
    <main className="px-4 py-10 sm:px-8 lg:px-16">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-xl font-semibold tracking-tight">
            Renomear notas fiscais
          </h1>
          <p className="mt-1 text-sm text-ink/60">
            Padrão: <span className="font-mono">{FILENAME_PATTERN}</span>
          </p>
          {totalCorrecoes > 0 && (
            <p className="mt-2 text-xs text-moss">
              Já aprendi com {totalCorrecoes} correç{totalCorrecoes === 1 ? "ão" : "ões"} sua{totalCorrecoes === 1 ? "" : "s"}:
              os nomes e categorias que você corrige passam a sair certos nas próximas notas.
            </p>
          )}
        </div>

        {/* Área de upload */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors ${dragOver
            ? "border-clay bg-clay/5"
            : "border-ink/15 bg-white/50 hover:border-clay/50 hover:bg-white"
            }`}
        >
          <UploadCloud
            size={34}
            className={dragOver ? "text-clay" : "text-ink/40 group-hover:text-clay/70"}
          />
          <div>
            <p className="font-medium">
              Arraste os PDFs aqui ou clique para selecionar
            </p>
            <p className="mt-1 text-sm text-ink/50">
              Envie várias notas fiscais de uma vez. PDFs escaneados são lidos por
              OCR e podem levar alguns segundos cada.
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </div>

        {/* Lista de arquivos */}
        {rows.length > 0 && (
          <div className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-ink/60">
                {rows.length} arquivo{rows.length > 1 ? "s" : ""} · {readyCount} pronto
                {readyCount !== 1 ? "s" : ""} para renomear
              </p>
              <button
                onClick={clearAll}
                className="text-sm text-ink/40 hover:text-clayDark"
              >
                Limpar tudo
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink/10 bg-sand/60 text-left text-xs uppercase tracking-wide text-ink/50">
                    <th className="px-4 py-3 font-medium">{cabecalho("arquivo", "Arquivo original")}</th>
                    <th className="px-4 py-3 font-medium">{cabecalho("data", "Data")}</th>
                    <th className="px-4 py-3 font-medium">{cabecalho("tipo", "Tipo / Nº")}</th>
                    <th className="px-4 py-3 font-medium">{cabecalho("fornecedor", "Fornecedor")}</th>
                    <th className="px-4 py-3 font-medium">{cabecalho("categoria", "Categoria")}</th>
                    <th className="px-4 py-3 font-medium">{cabecalho("status", "Status")}</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {linhasOrdenadas.map((row) => {
                    const name = suggestedName(row);
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-ink/5 last:border-0 hover:bg-sand/30"
                      >
                        <td className="max-w-[11.25rem] truncate px-4 py-3 text-ink/70">
                          {row.file.name}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            value={row.date}
                            onChange={(e) =>
                              updateRow(row.id, { date: e.target.value })
                            }
                            placeholder="dd-mm-aaaa"
                            className="w-24 rounded-md border border-ink/15 bg-white px-2 py-1 text-xs focus:border-clay focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <select
                              value={row.docType}
                              onChange={(e) =>
                                updateRow(row.id, { docType: e.target.value as TipoDoc })
                              }
                              className="rounded-md border border-ink/15 bg-white px-1 py-1 text-xs focus:border-clay focus:outline-none"
                            >
                              <option value="NFe">NF-e</option>
                              <option value="NFSe">NFS-e</option>
                            </select>
                            <input
                              value={row.nfNumber}
                              onChange={(e) =>
                                updateRow(row.id, {
                                  nfNumber: e.target.value.replace(/\D/g, ""),
                                })
                              }
                              placeholder="000372196"
                              className="w-24 rounded-md border border-ink/15 bg-white px-2 py-1 text-xs focus:border-clay focus:outline-none"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            value={row.supplier}
                            onChange={(e) =>
                              updateRow(row.id, { supplier: e.target.value })
                            }
                            onBlur={() => memorizarFornecedor(row.cnpj, row.supplier)}
                            placeholder="FORNECEDOR LTDA"
                            className="w-40 rounded-md border border-ink/15 bg-white px-2 py-1 text-xs focus:border-clay focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={row.categoria}
                            onChange={(e) =>
                              updateRow(row.id, { categoria: e.target.value as Categoria })
                            }
                            className="w-40 rounded-md border border-ink/15 bg-white px-1 py-1 text-xs focus:border-clay focus:outline-none"
                          >
                            {Object.entries(CATEGORIA_LABEL).map(([valor, rotulo]) => (
                              <option key={valor} value={valor}>
                                {rotulo}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          {row.duplicada && (
                            <span
                              className="mb-1 inline-flex items-center gap-1 text-xs text-amber-700"
                              title={`Já renomeada em ${new Date(row.duplicada.quando).toLocaleDateString("pt-BR")} como: ${row.duplicada.nomeFinal}`}
                            >
                              <AlertTriangle size={14} />
                              {row.duplicada.motivo === "chave" ? "já renomeada" : "possível duplicata"}
                            </span>
                          )}
                          {row.status === "processing" && (
                            <span className="inline-flex items-center gap-1 text-xs text-ink/50">
                              <Loader2 size={14} className="animate-spin" /> lendo
                            </span>
                          )}
                          {row.status === "done" && name && row.confidence !== "baixa" && (
                            <span className="inline-flex items-center gap-1 text-xs text-moss">
                              <CheckCircle2 size={14} /> pronto
                            </span>
                          )}
                          {row.status === "done" && name && row.confidence === "baixa" && (
                            <span
                              className="inline-flex items-center gap-1 text-xs text-clayDark"
                              title="Não consegui confirmar todos os campos no PDF. Confira antes de baixar."
                            >
                              <AlertTriangle size={14} /> conferir dados
                            </span>
                          )}
                          {row.status === "done" && !name && (
                            <span className="inline-flex items-center gap-1 text-xs text-clayDark">
                              <AlertTriangle size={14} /> revisar campos
                            </span>
                          )}
                          {row.status === "error" && (
                            <span className="inline-flex items-center gap-1 text-xs text-red-600">
                              <FileWarning size={14} /> erro na leitura
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <button
                              onClick={() => baixarUma(row)}
                              disabled={row.status !== "done" || !suggestedName(row)}
                              className="text-ink/40 hover:text-clayDark disabled:cursor-not-allowed disabled:opacity-30"
                              title="Baixar só esta nota, já renomeada"
                            >
                              <Download size={15} />
                            </button>
                            <button
                              onClick={() => setViewingId(row.id)}
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-ink/15 bg-white px-2 py-1 text-xs text-ink/70 hover:border-clay hover:text-clayDark"
                              title="Ver a nota e editar os campos lado a lado"
                            >
                              <Eye size={14} /> Visualizar
                            </button>
                            <button
                              onClick={() => removeRow(row.id)}
                              className="text-ink/30 hover:text-red-600"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Prévia dos nomes finais */}
            {readyCount > 0 && (
              <div className="mt-4 rounded-xl border border-moss/20 bg-moss/5 px-4 py-3">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-moss">
                  Prévia dos nomes finais
                </p>
                <ul className="space-y-1 text-xs text-ink/70">
                  {rows
                    .filter((r) => r.status === "done" && suggestedName(r))
                    .slice(0, 5)
                    .map((r) => (
                      <li key={r.id} className="truncate font-mono">
                        {suggestedName(r)}
                      </li>
                    ))}
                  {readyCount > 5 && (
                    <li className="text-ink/40">+ {readyCount - 5} outros...</li>
                  )}
                </ul>
              </div>
            )}

            <div className="mt-5 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => baixarTodas("zip")}
                  disabled={readyCount === 0 || baixando}
                  className="flex items-center gap-2 rounded-xl bg-clay px-5 py-3 text-sm font-medium text-paper shadow-sm transition-colors hover:bg-clayDark disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {baixando ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} />}
                  Baixar .zip ({readyCount})
                </button>
                <button
                  onClick={() => baixarTodas("soltos")}
                  disabled={readyCount === 0 || baixando}
                  className="flex items-center gap-2 rounded-xl border border-ink/15 bg-white px-5 py-3 text-sm font-medium text-ink/80 shadow-sm transition-colors hover:border-clay hover:text-clayDark disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download size={16} />
                  Baixar arquivos soltos
                </button>
              </div>

              {categoriasProntas.length > 0 && (
                <div className="rounded-xl border border-ink/10 bg-white/60 px-4 py-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink/40">
                    Baixar só uma categoria (soltos)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {categoriasProntas.map(([cat, n]) => (
                      <button
                        key={cat}
                        onClick={() => baixarCategoria(cat)}
                        disabled={baixando}
                        className="rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-ink/70 hover:border-clay hover:text-clayDark disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {PASTA_CATEGORIA[cat]} ({n})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-xs text-ink/50">
                O .zip tem uma pasta por categoria. Os soltos saem agrupados por categoria, com Padrão primeiro. Cada nota
                também pode ser baixada sozinha pelo ícone na tabela.
              </p>
            </div>
          </div>
        )}
      </div>

      {viewingRow && (
        <NotaViewer
          row={viewingRow}
          finalName={suggestedName(viewingRow)}
          position={viewingIndex + 1}
          total={rows.length}
          onChange={(patch) => updateRow(viewingRow.id, patch)}
          onSupplierBlur={() =>
            memorizarFornecedor(viewingRow.cnpj, viewingRow.supplier)
          }
          onNavigate={navigateViewer}
          onClose={() => setViewingId(null)}
        />
      )}
    </main>
  );
}