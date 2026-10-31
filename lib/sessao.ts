/** Ajudas das rotas de autenticação e da API (só servidor, runtime Node). */
import { NextResponse } from "next/server";
import { BancoIndisponivel } from "./db";
import { COOKIE_SESSAO, DURACAO_SESSAO_S, criarToken, usuarioIdDaRequisicao } from "./auth";
import { buscarUsuario, contarUsuarios, type Usuario } from "./repo";

/** Resposta com o usuário logado e o cookie de sessão. */
export async function respostaComSessao(usuario: { id: string; email: string; nome: string }) {
  const res = NextResponse.json({ usuario });
  res.cookies.set(COOKIE_SESSAO, await criarToken(usuario.id), {
    httpOnly: true,
    sameSite: "lax",
    // em produção exige HTTPS; COOKIE_SEM_HTTPS=1 para uso numa rede interna em http
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SEM_HTTPS !== "1",
    path: "/",
    maxAge: DURACAO_SESSAO_S,
  });
  return res;
}

/** Cadastro: livre só para o primeiro usuário, depois só com CADASTRO_ABERTO=1. */
export async function cadastroPermitido(): Promise<boolean> {
  if (process.env.CADASTRO_ABERTO === "1") return true;
  return (await contarUsuarios()) === 0;
}

export function semSessao() {
  return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
}

/**
 * Id do usuário logado SE a conta ainda existir. Assim, uma conta excluída perde
 * o acesso na hora, mesmo com o cookie ainda válido.
 */
export async function uidAtivo(req: Parameters<typeof usuarioIdDaRequisicao>[0]): Promise<string | null> {
  const uid = await usuarioIdDaRequisicao(req);
  if (!uid) return null;
  return (await buscarUsuario(uid)) ? uid : null;
}

/** Só administradores. Lê o papel no banco a cada chamada (rebaixamento vale na hora). */
export async function exigirAdmin(
  req: Parameters<typeof usuarioIdDaRequisicao>[0]
): Promise<{ ok: true; usuario: Usuario } | { ok: false; res: NextResponse }> {
  const uid = await uidAtivo(req);
  if (!uid) return { ok: false, res: semSessao() };
  const usuario = await buscarUsuario(uid);
  if (!usuario || usuario.papel !== "admin") {
    return { ok: false, res: NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 }) };
  }
  return { ok: true, usuario };
}

/** Erro padrão das rotas: 503 quando o banco não está configurado/disponível. */
export function falhaApi(e: unknown, etiqueta: string) {
  if (e instanceof BancoIndisponivel) {
    console.error(`[${etiqueta}]`, e.message);
    return NextResponse.json({ error: e.message, configurado: e.configurado }, { status: 503 });
  }
  console.error(`[${etiqueta}]`, e);
  return NextResponse.json({ error: "Erro inesperado" }, { status: 500 });
}
