import { NextRequest, NextResponse } from "next/server";
import { falhaApi, semSessao, uidAtivo } from "@/lib/sessao";
import { atualizarUsuario, buscarUsuario, buscarUsuarioPorEmail } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dados do próprio usuário logado. */
export async function GET(req: NextRequest) {
  const uid = await uidAtivo(req);
  if (!uid) return semSessao();
  try {
    return NextResponse.json({ usuario: await buscarUsuario(uid) });
  } catch (e) {
    return falhaApi(e, "conta");
  }
}

/** Edita o próprio nome e e-mail: { nome, email }. Papel não muda aqui. */
export async function PUT(req: NextRequest) {
  const uid = await uidAtivo(req);
  if (!uid) return semSessao();
  try {
    const body = await req.json().catch(() => ({}));
    const nome = String(body?.nome ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!nome) return NextResponse.json({ error: "Informe seu nome" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "E-mail inválido" }, { status: 400 });
    }
    const outro = await buscarUsuarioPorEmail(email);
    if (outro && outro.id !== uid) {
      return NextResponse.json({ error: "Já existe uma conta com este e-mail" }, { status: 409 });
    }
    const usuario = await atualizarUsuario(uid, { nome, email });
    return NextResponse.json({ usuario });
  } catch (e) {
    return falhaApi(e, "conta");
  }
}
