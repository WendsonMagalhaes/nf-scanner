/**
 * Leitura e gravação no banco (só servidor). Todo o SQL do app fica aqui.
 * Cada função de dados recebe o id do usuário logado: os dados são separados por conta.
 */
import { query } from "./db";
import type { Categoria, TipoDoc } from "./extract";
import type { CategoriaCompra } from "./fornecedores";
import { chaveNome } from "./aprendizado";

const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export function raizCnpj(v: unknown): string | null {
  const d = soDigitos(v);
  return d.length >= 8 ? d.slice(0, 8) : null;
}

/* -------------------------------- Usuários -------------------------------- */

export type Papel = "admin" | "usuario";

export interface Usuario {
  id: string;
  email: string;
  nome: string;
  papel: Papel;
  criadoEm?: string;
}

const COLUNAS_USUARIO = `id::text AS id, email, nome, papel, criado_em::text AS "criadoEm"`;

export async function contarUsuarios(): Promise<number> {
  const rows = await query<{ n: number }>("SELECT count(*)::int AS n FROM nf_usuarios");
  return rows[0]?.n ?? 0;
}

export async function contarAdmins(): Promise<number> {
  const rows = await query<{ n: number }>("SELECT count(*)::int AS n FROM nf_usuarios WHERE papel = 'admin'");
  return rows[0]?.n ?? 0;
}

export async function listarUsuarios(): Promise<Usuario[]> {
  return query<Usuario>(`SELECT ${COLUNAS_USUARIO} FROM nf_usuarios ORDER BY nome, email`);
}

export async function buscarUsuario(id: string): Promise<Usuario | null> {
  const rows = await query<Usuario>(`SELECT ${COLUNAS_USUARIO} FROM nf_usuarios WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function buscarUsuarioPorEmail(email: string) {
  const rows = await query<Usuario & { senha_hash: string }>(
    `SELECT ${COLUNAS_USUARIO}, senha_hash FROM nf_usuarios WHERE email = $1`,
    [email]
  );
  return rows[0] ?? null;
}

export async function buscarSenhaHash(id: string): Promise<string | null> {
  const rows = await query<{ senha_hash: string }>("SELECT senha_hash FROM nf_usuarios WHERE id = $1", [id]);
  return rows[0]?.senha_hash ?? null;
}

/** O primeiro usuário sempre vira admin e recebe os dados que já existiam sem dono. */
export async function criarUsuario(email: string, nome: string, senhaHash: string, papel?: Papel): Promise<Usuario> {
  const primeiro = (await contarUsuarios()) === 0;
  const rows = await query<Usuario>(
    `INSERT INTO nf_usuarios (email, nome, senha_hash, papel) VALUES ($1, $2, $3, $4) RETURNING ${COLUNAS_USUARIO}`,
    [email, nome, senhaHash, primeiro ? "admin" : (papel ?? "usuario")]
  );
  const usuario = rows[0];
  if (primeiro) {
    await query("UPDATE nf_fornecedores SET usuario_id = $1 WHERE usuario_id IS NULL", [usuario.id]);
    await query("UPDATE nf_historico SET usuario_id = $1 WHERE usuario_id IS NULL", [usuario.id]);
  }
  return usuario;
}

export async function atualizarUsuario(
  id: string,
  dados: { nome?: string; email?: string; papel?: Papel }
): Promise<Usuario | null> {
  const rows = await query<Usuario>(
    `UPDATE nf_usuarios SET
       nome  = COALESCE($2::text, nome),
       email = COALESCE($3::text, email),
       papel = COALESCE($4::text, papel)
     WHERE id = $1
     RETURNING ${COLUNAS_USUARIO}`,
    [id, dados.nome ?? null, dados.email ?? null, dados.papel ?? null]
  );
  return rows[0] ?? null;
}

export async function atualizarSenha(id: string, senhaHash: string): Promise<void> {
  await query("UPDATE nf_usuarios SET senha_hash = $2 WHERE id = $1", [id, senhaHash]);
}

/** Apaga a conta e, em cascata, o histórico, os fornecedores e as correções dela. */
export async function removerUsuario(id: string): Promise<void> {
  await query("DELETE FROM nf_usuarios WHERE id = $1", [id]);
}

/* ------------------------------ Fornecedores ------------------------------ */

export interface FornecedorDb {
  cnpj: string; // raiz, 8 dígitos
  nome: string | null;
  categoria: CategoriaCompra | null;
}

export async function listarFornecedores(uid: string): Promise<FornecedorDb[]> {
  const rows = await query<{ cnpj_raiz: string; nome: string | null; categoria: CategoriaCompra | null }>(
    "SELECT cnpj_raiz, nome, categoria FROM nf_fornecedores WHERE usuario_id = $1 ORDER BY nome NULLS LAST, cnpj_raiz",
    [uid]
  );
  return rows.map((r) => ({ cnpj: r.cnpj_raiz, nome: r.nome, categoria: r.categoria }));
}

/** Só os campos presentes em `dados` são alterados (null = limpar o campo). */
export async function salvarFornecedor(
  uid: string,
  cnpj: unknown,
  dados: { nome?: string | null; categoria?: CategoriaCompra | null }
): Promise<boolean> {
  const raiz = raizCnpj(cnpj);
  if (!raiz) return false;
  const temNome = "nome" in dados;
  const temCat = "categoria" in dados;
  if (!temNome && !temCat) return false;

  const nome = temNome ? dados.nome?.trim().toUpperCase() || null : null;
  const categoria = temCat && (dados.categoria === "padrao" || dados.categoria === "produto") ? dados.categoria : null;

  await query(
    `INSERT INTO nf_fornecedores (usuario_id, cnpj_raiz, nome, categoria)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (usuario_id, cnpj_raiz) DO UPDATE SET
       nome          = CASE WHEN $5::boolean THEN EXCLUDED.nome      ELSE nf_fornecedores.nome      END,
       categoria     = CASE WHEN $6::boolean THEN EXCLUDED.categoria ELSE nf_fornecedores.categoria END,
       atualizado_em = now()`,
    [uid, raiz, nome, categoria, temNome, temCat]
  );
  // linha sem nome e sem categoria não serve para nada
  await query(
    "DELETE FROM nf_fornecedores WHERE usuario_id = $1 AND cnpj_raiz = $2 AND nome IS NULL AND categoria IS NULL",
    [uid, raiz]
  );
  return true;
}

export async function removerFornecedor(uid: string, cnpj: unknown): Promise<void> {
  const raiz = raizCnpj(cnpj);
  if (raiz) await query("DELETE FROM nf_fornecedores WHERE usuario_id = $1 AND cnpj_raiz = $2", [uid, raiz]);
}

/** Mapas no formato que o extrator já espera. */
export async function fornecedoresParaExtracao(uid: string): Promise<{
  nomes: Record<string, string>;
  categorias: Record<string, CategoriaCompra>;
}> {
  const nomes: Record<string, string> = {};
  const categorias: Record<string, CategoriaCompra> = {};
  for (const f of await listarFornecedores(uid)) {
    if (f.nome) nomes[f.cnpj] = f.nome;
    if (f.categoria) categorias[f.cnpj] = f.categoria;
  }
  return { nomes, categorias };
}

/* -------------------------------- Correções ------------------------------- */

export const CAMPOS_CORRIGIVEIS = ["fornecedor", "categoria", "data", "numero", "tipo"] as const;
export type CampoCorrigido = (typeof CAMPOS_CORRIGIVEIS)[number];

export interface CorrecaoNova {
  campo: CampoCorrigido;
  cnpj?: string | null;
  arquivo?: string | null;
  /** o que o sistema leu */
  valorExtraido?: string | null;
  /** o que o usuário deixou */
  valorCorrigido: string;
}

/** Grava o log de correções do usuário. Ignora o que não mudou de fato. */
export async function registrarCorrecoes(uid: string, itens: CorrecaoNova[]): Promise<number> {
  const validos = itens.filter(
    (i) =>
      (CAMPOS_CORRIGIVEIS as readonly string[]).includes(i.campo) &&
      typeof i.valorCorrigido === "string" &&
      i.valorCorrigido.trim() !== "" &&
      (i.valorExtraido ?? "").trim() !== i.valorCorrigido.trim()
  );
  if (validos.length === 0) return 0;
  const col = <T,>(f: (r: CorrecaoNova) => T) => validos.map(f);
  await query(
    `INSERT INTO nf_correcoes (usuario_id, campo, cnpj_raiz, arquivo, valor_extraido, valor_corrigido)
     SELECT $1::bigint, t.campo, t.cnpj_raiz, t.arquivo, t.valor_extraido, t.valor_corrigido
       FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
         AS t(campo, cnpj_raiz, arquivo, valor_extraido, valor_corrigido)`,
    [
      uid,
      col((i) => i.campo),
      col((i) => raizCnpj(i.cnpj)),
      col((i) => i.arquivo ?? null),
      col((i) => i.valorExtraido ?? null),
      col((i) => i.valorCorrigido.trim()),
    ]
  );
  return validos.length;
}

/** Nome lido -> nome corrigido pelo usuário (o mais frequente vence). */
export async function correcoesDeFornecedor(uid: string): Promise<Record<string, string>> {
  const rows = await query<{ valor_extraido: string; valor_corrigido: string }>(
    `SELECT valor_extraido, valor_corrigido FROM nf_correcoes
      WHERE usuario_id = $1 AND campo = 'fornecedor' AND valor_extraido IS NOT NULL
      GROUP BY valor_extraido, valor_corrigido
      ORDER BY count(*) DESC, max(criado_em) DESC`,
    [uid]
  );
  const mapa: Record<string, string> = {};
  for (const r of rows) {
    const k = chaveNome(r.valor_extraido);
    if (k && !(k in mapa)) mapa[k] = r.valor_corrigido;
  }
  return mapa;
}

export async function resumoCorrecoes(uid: string) {
  const total = await query<{ n: number }>("SELECT count(*)::int AS n FROM nf_correcoes WHERE usuario_id = $1", [uid]);
  const recentes = await query<{ campo: string; valor_extraido: string | null; valor_corrigido: string; criado_em: string }>(
    `SELECT campo, valor_extraido, valor_corrigido, criado_em::text AS criado_em
       FROM nf_correcoes WHERE usuario_id = $1
      ORDER BY criado_em DESC, id DESC LIMIT 20`,
    [uid]
  );
  return {
    total: total[0]?.n ?? 0,
    recentes: recentes.map((r) => ({
      campo: r.campo,
      valorExtraido: r.valor_extraido,
      valorCorrigido: r.valor_corrigido,
      quando: r.criado_em,
    })),
  };
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

export async function listarHistorico(uid: string, limite = 5000): Promise<RegistroHistoricoDb[]> {
  const rows = await query(
    `SELECT id::text AS id,
            to_char(gerado_em AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS quando,
            arquivo_original, nome_final, tipo, categoria,
            to_char(data_emissao, 'DD-MM-YYYY') AS data,
            numero, fornecedor, cnpj, chave_acesso
       FROM nf_historico
      WHERE usuario_id = $1
      ORDER BY gerado_em DESC, id DESC
      LIMIT $2`,
    [uid, limite]
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

export async function inserirHistorico(uid: string, registros: NovoRegistro[]): Promise<number> {
  if (registros.length === 0) return 0;
  const agora = new Date().toISOString();
  const col = <T,>(f: (r: NovoRegistro) => T) => registros.map(f);
  const rows = await query(
    `INSERT INTO nf_historico
       (gerado_em, arquivo_original, nome_final, tipo, categoria, data_emissao, numero, fornecedor, cnpj, chave_acesso, usuario_id)
     SELECT t.*, $11::bigint FROM unnest(
       $1::timestamptz[], $2::text[], $3::text[], $4::text[], $5::text[],
       $6::date[], $7::text[], $8::text[], $9::text[], $10::text[]
     ) AS t(gerado, arquivo, nome, tipo, categoria, data, numero, fornecedor, cnpj, chave)
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
      uid,
    ]
  );
  return rows.length;
}

export async function removerHistorico(uid: string, id: unknown): Promise<void> {
  if (/^\d+$/.test(String(id))) {
    await query("DELETE FROM nf_historico WHERE id = $1 AND usuario_id = $2", [String(id), uid]);
  }
}

export async function limparHistorico(uid: string): Promise<void> {
  await query("DELETE FROM nf_historico WHERE usuario_id = $1", [uid]);
}

/* ---------------------- Histórico como fonte de aprendizado --------------- */

export interface Duplicata {
  quando: string;
  nomeFinal: string;
  /** "chave": mesma chave de acesso; "numero": mesmo nº e mesmo CNPJ, chave diferente/ausente */
  motivo: "chave" | "numero";
}

/** A nota já foi renomeada antes por este usuário? */
export async function buscarDuplicata(
  uid: string,
  chave: string | null,
  numero: string,
  cnpj: string | null
): Promise<Duplicata | null> {
  if (chave && /^\d{44}$/.test(chave)) {
    const rows = await query<{ quando: string; nome_final: string }>(
      `SELECT gerado_em::text AS quando, nome_final FROM nf_historico
        WHERE usuario_id = $1 AND chave_acesso = $2 ORDER BY gerado_em DESC LIMIT 1`,
      [uid, chave]
    );
    if (rows[0]) return { quando: rows[0].quando, nomeFinal: rows[0].nome_final, motivo: "chave" };
  }
  const raiz = raizCnpj(cnpj);
  if (numero && raiz) {
    const rows = await query<{ quando: string; nome_final: string }>(
      `SELECT gerado_em::text AS quando, nome_final FROM nf_historico
        WHERE usuario_id = $1 AND numero = $2 AND left(cnpj, 8) = $3
        ORDER BY gerado_em DESC LIMIT 1`,
      [uid, numero, raiz]
    );
    if (rows[0]) return { quando: rows[0].quando, nomeFinal: rows[0].nome_final, motivo: "numero" };
  }
  return null;
}

/**
 * Nome e categoria mais usados por CNPJ no histórico do usuário. Serve de
 * sugestão quando o fornecedor ainda não foi salvo na tabela de fornecedores.
 * A tabela de fornecedores (escolha explícita) sempre tem prioridade.
 */
export async function aprendizadoDoHistorico(uid: string): Promise<{
  nomes: Record<string, string>;
  categorias: Record<string, CategoriaCompra>;
}> {
  const nomesRows = await query<{ raiz: string; nome: string }>(
    `SELECT left(cnpj, 8) AS raiz, fornecedor AS nome, count(*)::int AS n
       FROM nf_historico
      WHERE usuario_id = $1 AND cnpj IS NOT NULL AND length(cnpj) >= 8 AND fornecedor <> ''
      GROUP BY 1, 2 ORDER BY 1, n DESC`,
    [uid]
  );
  const catRows = await query<{ raiz: string; categoria: CategoriaCompra }>(
    `SELECT left(cnpj, 8) AS raiz, categoria, count(*)::int AS n
       FROM nf_historico
      WHERE usuario_id = $1 AND tipo = 'NFe' AND cnpj IS NOT NULL AND length(cnpj) >= 8
        AND categoria IN ('padrao', 'produto')
      GROUP BY 1, 2 ORDER BY 1, n DESC`,
    [uid]
  );
  const nomes: Record<string, string> = {};
  for (const r of nomesRows) if (!(r.raiz in nomes)) nomes[r.raiz] = r.nome;
  const categorias: Record<string, CategoriaCompra> = {};
  for (const r of catRows) if (!(r.raiz in categorias)) categorias[r.raiz] = r.categoria;
  return { nomes, categorias };
}
