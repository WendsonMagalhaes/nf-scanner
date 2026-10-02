/**
 * Cliente das rotas /api (histórico e fornecedores guardados no banco Neon).
 * Só use em componentes "use client".
 *
 * O localStorage antigo continua sendo LIDO só para a importação única
 * (componente ImportarLocal) — depois de enviado ao banco, é apagado.
 */
import type { Categoria, TipoDoc } from "./extract";
import type { CategoriaCompra } from "./fornecedores";

const LS_FORNECEDORES = "nf-fornecedores";
const LS_CATEGORIAS = "nf-categorias";
const LS_HISTORICO = "nf-historico";

/* --------------------------------- Utilitários ---------------------------- */

export function normalizarCnpj(valor: string): string {
  const d = valor.replace(/\D/g, "");
  // com 14 dígitos guardamos só a raiz (8): vale para qualquer filial
  return d.length >= 8 ? d.slice(0, 8) : "";
}

export function formatarRaiz(raiz: string): string {
  return raiz.length === 8 ? raiz.replace(/^(\d{2})(\d{3})(\d{3})$/, "$1.$2.$3/…") : raiz;
}

/** Baixa um arquivo de texto gerado no navegador. */
export function baixarTexto(nome: string, conteudo: string, mime: string) {
  const blob = new Blob([conteudo], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Resultado de uma chamada: ok, ou o motivo (e se o problema é falta de configuração). */
export interface Resultado<T = undefined> {
  ok: boolean;
  dados?: T;
  erro?: string;
  /** false = DATABASE_URL não foi configurada no servidor */
  configurado?: boolean;
}

async function chamar<T>(url: string, init?: RequestInit): Promise<Resultado<T>> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, erro: json?.error ?? `Erro ${res.status}`, configurado: json?.configurado };
    return { ok: true, dados: json as T };
  } catch {
    return { ok: false, erro: "Sem conexão com o servidor" };
  }
}

const JSON_HEADERS = { "Content-Type": "application/json" };

/* ------------------------------ Fornecedores ------------------------------ */

export interface Fornecedor {
  /** raiz do CNPJ, 8 dígitos */
  cnpj: string;
  nome: string | null;
  categoria: CategoriaCompra | null;
}

export async function listarFornecedores() {
  const r = await chamar<{ itens: Fornecedor[] }>("/api/fornecedores");
  return { ...r, dados: r.dados?.itens };
}

/** Só os campos enviados mudam; null limpa o campo. */
export function salvarFornecedor(item: { cnpj: string; nome?: string | null; categoria?: CategoriaCompra | null }) {
  return chamar("/api/fornecedores", { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(item) });
}

export function salvarFornecedores(itens: { cnpj: string; nome?: string | null; categoria?: CategoriaCompra | null }[]) {
  return chamar("/api/fornecedores", { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ itens }) });
}

export function removerFornecedor(cnpj: string) {
  return chamar(`/api/fornecedores?cnpj=${encodeURIComponent(cnpj)}`, { method: "DELETE" });
}

/** Chamadas "dispara e esquece" da tela de renomear: não travam o uso se o banco falhar. */
export function memorizarFornecedor(cnpj: string | undefined, nome: string) {
  const raiz = normalizarCnpj(cnpj ?? "");
  if (!raiz || !nome.trim()) return;
  void salvarFornecedor({ cnpj: raiz, nome });
}

export function memorizarCategoria(cnpj: string | undefined, categoria: CategoriaCompra) {
  const raiz = normalizarCnpj(cnpj ?? "");
  if (!raiz) return;
  void salvarFornecedor({ cnpj: raiz, categoria });
}

/* -------------------------------- Histórico ------------------------------- */

export interface RegistroHistorico {
  id: string;
  /** ISO 8601 de quando o arquivo foi gerado */
  quando: string;
  arquivoOriginal: string;
  nomeFinal: string;
  tipo: TipoDoc;
  categoria?: Categoria | null;
  data: string;
  numero: string;
  fornecedor: string;
  cnpj?: string | null;
  chaveAcesso?: string | null;
}

export type NovoRegistroHistorico = Omit<RegistroHistorico, "id" | "quando"> & { quando?: string };

export async function listarHistorico() {
  const r = await chamar<{ registros: RegistroHistorico[] }>("/api/historico");
  return { ...r, dados: r.dados?.registros };
}

export function adicionarHistorico(registros: NovoRegistroHistorico[]) {
  return chamar("/api/historico", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ registros }) });
}

export function removerHistorico(id: string) {
  return chamar(`/api/historico?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function limparHistorico() {
  return chamar("/api/historico?todos=1", { method: "DELETE" });
}

/* ------------------- Dados antigos do navegador (importação) --------------- */

function lerLocal<T>(chave: string, padrao: T): T {
  try {
    const raw = localStorage.getItem(chave);
    return raw ? (JSON.parse(raw) as T) : padrao;
  } catch {
    return padrao;
  }
}

export interface PendenteLocal {
  historico: RegistroHistorico[];
  nomes: Record<string, string>;
  categorias: Record<string, CategoriaCompra>;
}

export function lerPendenteLocal(): PendenteLocal {
  return {
    historico: lerLocal<RegistroHistorico[]>(LS_HISTORICO, []),
    nomes: lerLocal<Record<string, string>>(LS_FORNECEDORES, {}),
    categorias: lerLocal<Record<string, CategoriaCompra>>(LS_CATEGORIAS, {}),
  };
}

export function totalPendenteLocal(p: PendenteLocal): number {
  return p.historico.length + Object.keys(p.nomes).length + Object.keys(p.categorias).length;
}

/** Envia tudo que estava no navegador para o banco e, só se deu certo, apaga o local. */
export async function importarLocalParaBanco(p: PendenteLocal = lerPendenteLocal()): Promise<Resultado<{ historico: number; fornecedores: number }>> {
  // une nomes e categorias por CNPJ
  const porCnpj = new Map<string, { cnpj: string; nome?: string | null; categoria?: CategoriaCompra | null }>();
  for (const [k, v] of Object.entries(p.nomes)) {
    const raiz = normalizarCnpj(k);
    if (raiz && typeof v === "string" && v.trim()) porCnpj.set(raiz, { cnpj: raiz, nome: v });
  }
  for (const [k, v] of Object.entries(p.categorias)) {
    const raiz = normalizarCnpj(k);
    if (raiz && (v === "padrao" || v === "produto")) porCnpj.set(raiz, { ...(porCnpj.get(raiz) ?? { cnpj: raiz }), categoria: v });
  }
  const fornecedores = [...porCnpj.values()];

  if (fornecedores.length) {
    const r = await salvarFornecedores(fornecedores);
    if (!r.ok) return { ok: false, erro: r.erro, configurado: r.configurado };
  }
  if (p.historico.length) {
    // do mais antigo para o mais novo, para o banco guardar na ordem certa
    const lote = [...p.historico].reverse().map((h) => ({ ...h, id: undefined }) as unknown as NovoRegistroHistorico);
    const r = await adicionarHistorico(lote);
    if (!r.ok) return { ok: false, erro: r.erro, configurado: r.configurado };
  }

  try {
    localStorage.removeItem(LS_HISTORICO);
    localStorage.removeItem(LS_FORNECEDORES);
    localStorage.removeItem(LS_CATEGORIAS);
  } catch {
    /* sem localStorage: nada a apagar */
  }
  return { ok: true, dados: { historico: p.historico.length, fornecedores: fornecedores.length } };
}
