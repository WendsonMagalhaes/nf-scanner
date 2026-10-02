/**
 * Conexão com o Neon (Postgres). Só servidor (rotas /api).
 * Configure DATABASE_URL no .env.local (veja .env.example).
 */
import { neon } from "@neondatabase/serverless";
import { SCHEMA_SQL } from "./db-schema";

export type Linha = Record<string, any>;
export type Executor = (text: string, params: unknown[]) => Promise<Linha[]>;

export class BancoIndisponivel extends Error {
  constructor(
    message: string,
    /** false = falta configurar DATABASE_URL */
    public configurado: boolean
  ) {
    super(message);
  }
}

let executor: Executor | null = null;
let schemaPronto: Promise<void> | null = null;

function executorPadrao(): Executor {
  const url = process.env.DATABASE_URL;
  if (!url) throw new BancoIndisponivel("DATABASE_URL não configurada", false);
  const sql = neon(url);
  return async (text, params) => (await sql.query(text, params as any[])) as Linha[];
}

/** Para testes: troca o executor (ex.: um Postgres em memória). */
export function usarExecutor(e: Executor | null) {
  executor = e;
  schemaPronto = null;
}

async function garantirSchema(exec: Executor) {
  if (!schemaPronto) {
    schemaPronto = (async () => {
      for (const stmt of SCHEMA_SQL) await exec(stmt, []);
    })().catch((e) => {
      schemaPronto = null; // tenta de novo na próxima chamada
      throw e;
    });
  }
  await schemaPronto;
}

export async function query<T = Linha>(text: string, params: unknown[] = []): Promise<T[]> {
  const exec = (executor ??= executorPadrao());
  try {
    await garantirSchema(exec);
    return (await exec(text, params)) as T[];
  } catch (e) {
    if (e instanceof BancoIndisponivel) throw e;
    throw new BancoIndisponivel((e as Error).message || "falha ao acessar o banco", true);
  }
}
