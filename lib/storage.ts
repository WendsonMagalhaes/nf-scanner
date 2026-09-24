/**
 * Dados guardados no navegador do usuário (localStorage).
 * Só use em componentes "use client". Nada disso vai para o servidor.
 */
import type { TipoDoc } from "./extract";

const LS_FORNECEDORES = "nf-fornecedores";
const LS_HISTORICO = "nf-historico";
const HISTORICO_MAX = 2000;

function ler<T>(chave: string, padrao: T): T {
  try {
    const raw = localStorage.getItem(chave);
    return raw ? (JSON.parse(raw) as T) : padrao;
  } catch {
    return padrao;
  }
}

function gravar(chave: string, valor: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* navegador sem localStorage / cheio: segue sem gravar */
  }
}

/* ------------------------------ Fornecedores ------------------------------ */

/** Correções do usuário: CNPJ (8 ou 14 dígitos) -> nome. */
export function lerAprendidos(): Record<string, string> {
  return ler<Record<string, string>>(LS_FORNECEDORES, {});
}

export function salvarAprendidos(mapa: Record<string, string>) {
  gravar(LS_FORNECEDORES, mapa);
}

export function normalizarCnpj(valor: string): string {
  const d = valor.replace(/\D/g, "");
  // com 14 dígitos guardamos só a raiz (8): vale para qualquer filial
  return d.length >= 8 ? d.slice(0, 8) : "";
}

export function memorizarFornecedor(cnpj: string | undefined, nome: string) {
  const raiz = normalizarCnpj(cnpj ?? "");
  if (!raiz || !nome.trim()) return;
  salvarAprendidos({ ...lerAprendidos(), [raiz]: nome.trim().toUpperCase() });
}

export function formatarRaiz(raiz: string): string {
  return raiz.length === 8 ? raiz.replace(/^(\d{2})(\d{3})(\d{3})$/, "$1.$2.$3/…") : raiz;
}

/* -------------------------------- Histórico ------------------------------- */

export interface RegistroHistorico {
  id: string;
  /** ISO 8601 de quando o .zip foi gerado */
  quando: string;
  arquivoOriginal: string;
  nomeFinal: string;
  tipo: TipoDoc;
  data: string;
  numero: string;
  fornecedor: string;
}

export function lerHistorico(): RegistroHistorico[] {
  return ler<RegistroHistorico[]>(LS_HISTORICO, []);
}

export function adicionarHistorico(novos: Omit<RegistroHistorico, "id" | "quando">[]) {
  const quando = new Date().toISOString();
  const registros = novos.map((n) => ({
    ...n,
    id: Math.random().toString(36).slice(2, 10),
    quando,
  }));
  gravar(LS_HISTORICO, [...registros, ...lerHistorico()].slice(0, HISTORICO_MAX));
}

export function salvarHistorico(lista: RegistroHistorico[]) {
  gravar(LS_HISTORICO, lista);
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
