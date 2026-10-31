/**
 * Autenticação própria, sem serviço externo. Usa só Web Crypto, então roda
 * tanto no middleware (edge) quanto nas rotas Node.
 *
 *  - Senhas: PBKDF2-SHA256 com salt aleatório (nunca guardamos a senha).
 *  - Sessão: cookie HttpOnly com token assinado (HMAC-SHA256): "id.expiracao.assinatura".
 *    Não precisa de tabela de sessões. Defina AUTH_SECRET no .env.local
 *    (string longa e aleatória, 32+ caracteres — ex.: `openssl rand -hex 32`).
 */

export const COOKIE_SESSAO = "nf_sessao";
/** Validade da sessão: 30 dias. */
export const DURACAO_SESSAO_S = 30 * 24 * 60 * 60;
const ITERACOES = 210_000;

const enc = new TextEncoder();

function segredo(): string {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    // falha fechada: sem segredo forte ninguém entra
    throw new Error("AUTH_SECRET não configurada (mínimo 16 caracteres)");
  }
  // só para desenvolvimento local
  return "dev-only-insecure-secret-defina-AUTH_SECRET";
}

const toHex = (buf: ArrayBuffer | Uint8Array): string =>
  Array.from(new Uint8Array(buf as ArrayBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const fromHex = (h: string): Uint8Array => {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
};

function igualSeguro(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function derivar(senha: string, salt: Uint8Array, iteracoes: number): Promise<ArrayBuffer> {
  const base = await crypto.subtle.importKey("raw", enc.encode(senha), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: iteracoes, hash: "SHA-256" }, base, 256);
}

/** Gera o hash guardado no banco: "pbkdf2$iteracoes$salt$hash". */
export async function hashSenha(senha: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derivar(senha, salt, ITERACOES);
  return `pbkdf2$${ITERACOES}$${toHex(salt)}$${toHex(bits)}`;
}

export async function verificarSenha(senha: string, guardado: string): Promise<boolean> {
  const partes = String(guardado ?? "").split("$");
  if (partes.length !== 4 || partes[0] !== "pbkdf2") return false;
  const iteracoes = Number(partes[1]);
  if (!Number.isInteger(iteracoes) || iteracoes < 1) return false;
  const bits = new Uint8Array(await derivar(senha, fromHex(partes[2]), iteracoes));
  return igualSeguro(bits, fromHex(partes[3]));
}

async function chaveHmac(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(segredo()), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function criarToken(usuarioId: string): Promise<string> {
  const exp = Date.now() + DURACAO_SESSAO_S * 1000;
  const corpo = `${usuarioId}.${exp}`;
  const assinatura = await crypto.subtle.sign("HMAC", await chaveHmac(), enc.encode(corpo));
  return `${corpo}.${toHex(assinatura)}`;
}

/** Devolve o id do usuário se o token for válido e não estiver vencido; senão null. */
export async function lerToken(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  const [id, exp, assinatura] = partes;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(exp) || !/^[0-9a-f]+$/i.test(assinatura)) return null;
  if (Number(exp) < Date.now()) return null;
  const ok = await crypto.subtle.verify(
    "HMAC",
    await chaveHmac(),
    fromHex(assinatura),
    enc.encode(`${id}.${exp}`)
  );
  return ok ? id : null;
}

/** Id do usuário logado a partir da requisição (ou null). */
export function usuarioIdDaRequisicao(req: {
  cookies: { get(nome: string): { value: string } | undefined };
}): Promise<string | null> {
  return lerToken(req.cookies.get(COOKIE_SESSAO)?.value);
}
