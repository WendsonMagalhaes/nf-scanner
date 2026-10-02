/** Leitura e gravação no banco (só servidor). Todo o SQL do app fica aqui. */
import { query } from "./db";
import type { Categoria, TipoDoc } from "./extract";
import type { CategoriaCompra } from "./fornecedores";

/* ------------------------------ Fornecedores ------------------------------ */

export interface FornecedorDb {
  cnpj: string; // raiz, 8 dígitos
  nome: string | null;
  categoria: CategoriaCompra | null;
}

const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export function raizCnpj(v: unknown): string | null {
  const d = soDigitos(v);
  return d.length >= 8 ? d.slice(0, 8) : null;
}

export async function listarFornecedores(): Promise<FornecedorDb[]> {
  const rows = await query<{ cnpj_raiz: string; nome: string | null; categoria: CategoriaCompra | null }>(
    "SELECT cnpj_raiz, nome, categoria FROM nf_fornecedores ORDER BY nome NULLS LAST, cnpj_raiz"
  );
  return rows.map((r) => ({ cnpj: r.cnpj_raiz, nome: r.nome, categoria: r.categoria }));
}

/** Só os campos presentes em `dados` são alterados (null = limpar o campo). */
export async function salvarFornecedor(
  cnpj: unknown,
  dados: { nome?: string | null; categoria?: CategoriaCompra | null }
): Promise<boolean> {
  const raiz = raizCnpj(cnpj);
  if (!raiz) return false;
  const temNome = "nome" in dados;
  const temCat = "categoria" in dados;
  if (!temNome && !temCat) return false;

  const nome = temNome ? (dados.nome?.trim().toUpperCase() || null) : null;
  const categoria = temCat && (dados.categoria === "padrao" || dados.categoria === "produto") ? dados.categoria : null;

  await query(
    `INSERT INTO nf_fornecedores (cnpj_raiz, nome, categoria)
     VALUES ($1, $2, $3)
     ON CONFLICT (cnpj_raiz) DO UPDATE SET
       nome          = CASE WHEN $4::boolean THEN EXCLUDED.nome      ELSE nf_fornecedores.nome      END,
       categoria     = CASE WHEN $5::boolean THEN EXCLUDED.categoria ELSE nf_fornecedores.categoria END,
       atualizado_em = now()`,
    [raiz, nome, categoria, temNome, temCat]
  );
  // linha sem nome e sem categoria não serve para nada
  await query("DELETE FROM nf_fornecedores WHERE cnpj_raiz = $1 AND nome IS NULL AND categoria IS NULL", [raiz]);
  return true;
}

export async function removerFornecedor(cnpj: unknown): Promise<void> {
  const raiz = raizCnpj(cnpj);
  if (raiz) await query("DELETE FROM nf_fornecedores WHERE cnpj_raiz = $1", [raiz]);
}

/** Mapas no formato que o extrator já espera. */
export async function fornecedoresParaExtracao(): Promise<{
  nomes: Record<string, string>;
  categorias: Record<string, CategoriaCompra>;
}> {
  const nomes: Record<string, string> = {};
  const categorias: Record<string, CategoriaCompra> = {};
  for (const f of await listarFornecedores()) {
    if (f.nome) nomes[f.cnpj] = f.nome;
    if (f.categoria) categorias[f.cnpj] = f.categoria;
  }
  return { nomes, categorias };
}

/* -------------------------------- Histórico ------------------------------- */

export interface RegistroHistoricoDb {
  id: string;
  quando: string; // ISO 8601
  arquivoOriginal: string;
  nomeFinal: string;
  tipo: TipoDoc;
  categoria: Categoria | null;
  data: string; // dd-mm-aaaa (ou "" se não houver)
  numero: string;
  fornecedor: string;
  cnpj: string | null;
  chaveAcesso: string | null;
}

export interface NovoRegistro {
  quando?: string;
  arquivoOriginal: string;
  nomeFinal: string;
  tipo: TipoDoc;
  categoria?: string | null;
  data?: string | null; // dd-mm-aaaa
  numero: string;
  fornecedor: string;
  cnpj?: string | null;
  chaveAcesso?: string | null;
}

/** "15-09-2026" -> "2026-09-15" (ou null se não for uma data real). */
export function dataParaIso(ddmmaaaa: string | null | undefined): string | null {
  const m = String(ddmmaaaa ?? "").match(/^(\d{2})[-/.](\d{2})[-/.](\d{4})$/);
  if (!m) return null;
  const [, dd, mm, aaaa] = m;
  const d = new Date(Date.UTC(Number(aaaa), Number(mm) - 1, Number(dd)));
  const ok = d.getUTCFullYear() === Number(aaaa) && d.getUTCMonth() === Number(mm) - 1 && d.getUTCDate() === Number(dd);
  return ok ? `${aaaa}-${mm}-${dd}` : null;
}

export async function listarHistorico(limite = 5000): Promise<RegistroHistoricoDb[]> {
  const rows = await query(
    `SELECT id::text AS id,
            to_char(gerado_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS quando,
            arquivo_original, nome_final, tipo, categoria,
            to_char(data_emissao, 'DD-MM-YYYY') AS data,
            numero, fornecedor, cnpj, chave_acesso
       FROM nf_historico
      ORDER BY gerado_em DESC, id DESC
      LIMIT $1`,
    [limite]
  );
  return rows.map((r) => ({
    id: r.id,
    quando: r.quando,
    arquivoOriginal: r.arquivo_original,
    nomeFinal: r.nome_final,
    tipo: r.tipo,
    categoria: r.categoria,
    data: r.data ?? "",
    numero: r.numero,
    fornecedor: r.fornecedor,
    cnpj: r.cnpj,
    chaveAcesso: r.chave_acesso?.trim() || null,
  }));
}

export async function inserirHistorico(registros: NovoRegistro[]): Promise<number> {
  if (registros.length === 0) return 0;
  const agora = new Date().toISOString();
  const col = <T,>(f: (r: NovoRegistro) => T) => registros.map(f);
  const rows = await query(
    `INSERT INTO nf_historico
       (gerado_em, arquivo_original, nome_final, tipo, categoria, data_emissao, numero, fornecedor, cnpj, chave_acesso)
     SELECT * FROM unnest(
       $1::timestamptz[], $2::text[], $3::text[], $4::text[], $5::text[],
       $6::date[], $7::text[], $8::text[], $9::text[], $10::text[]
     )
     RETURNING id`,
    [
      col((r) => (r.quando && !Number.isNaN(Date.parse(r.quando)) ? r.quando : agora)),
      col((r) => r.arquivoOriginal),
      col((r) => r.nomeFinal),
      col((r) => (r.tipo === "NFSe" ? "NFSe" : "NFe")),
      col((r) => r.categoria ?? null),
      col((r) => dataParaIso(r.data)),
      col((r) => r.numero),
      col((r) => r.fornecedor),
      col((r) => (r.cnpj ? soDigitos(r.cnpj) || null : null)),
      col((r) => (/^\d{44}$/.test(r.chaveAcesso ?? "") ? r.chaveAcesso! : null)),
    ]
  );
  return rows.length;
}

export async function removerHistorico(id: unknown): Promise<void> {
  if (/^\d+$/.test(String(id))) await query("DELETE FROM nf_historico WHERE id = $1", [String(id)]);
}

export async function limparHistorico(): Promise<void> {
  await query("DELETE FROM nf_historico");
}
