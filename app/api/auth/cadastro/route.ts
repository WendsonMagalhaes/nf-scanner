import { NextRequest, NextResponse } from "next/server";
import { hashSenha } from "@/lib/auth";
import { cadastroPermitido, falhaApi, respostaComSessao } from "@/lib/sessao";
import { buscarUsuarioPorEmail, criarUsuario } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cria conta: { nome, email, senha } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const nome = String(body?.nome ?? "").trim();
    const senha = String(body?.senha ?? "");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "E-mail inválido" }, { status: 400 });
    }
    if (!nome) return NextResponse.json({ error: "Informe seu nome" }, { status: 400 });
    if (senha.length < 8) {
      return NextResponse.json({ error: "A senha precisa ter pelo menos 8 caracteres" }, { status: 400 });
    }
    if (!(await cadastroPermitido())) {
      return NextResponse.json(
        { error: "Cadastro fechado. Peça ao administrador para criar seu acesso." },
        { status: 403 }
      );
    }
    if (await buscarUsuarioPorEmail(email)) {
      return NextResponse.json({ error: "Já existe uma conta com este e-mail" }, { status: 409 });
    }

    const usuario = await criarUsuario(email, nome, await hashSenha(senha));
    return respostaComSessao(usuario);
  } catch (e) {
    return falhaApi(e, "auth/cadastro");
  }
}
