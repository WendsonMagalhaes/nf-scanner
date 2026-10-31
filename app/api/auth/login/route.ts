import { NextRequest, NextResponse } from "next/server";
import { verificarSenha } from "@/lib/auth";
import { falhaApi, respostaComSessao } from "@/lib/sessao";
import { buscarUsuarioPorEmail } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Entra: { email, senha } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const senha = String(body?.senha ?? "");

    const usuario = email ? await buscarUsuarioPorEmail(email) : null;
    // mesma mensagem para e-mail inexistente e senha errada: não revela quais contas existem
    const ok = usuario ? await verificarSenha(senha, usuario.senha_hash) : false;
    if (!usuario || !ok) {
      return NextResponse.json({ error: "E-mail ou senha incorretos" }, { status: 401 });
    }
    return respostaComSessao({ id: usuario.id, email: usuario.email, nome: usuario.nome });
  } catch (e) {
    return falhaApi(e, "auth/login");
  }
}
