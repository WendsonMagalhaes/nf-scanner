import { NextRequest, NextResponse } from "next/server";
import { hashSenha } from "@/lib/auth";
import { exigirAdmin, falhaApi } from "@/lib/sessao";
import { buscarUsuarioPorEmail, criarUsuario, listarUsuarios, type Papel } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lista todos os usuários (só admin). */
export async function GET(req: NextRequest) {
  const acesso = await exigirAdmin(req);
  if (!acesso.ok) return acesso.res;
  try {
    return NextResponse.json({ usuarios: await listarUsuarios() });
  } catch (e) {
    return falhaApi(e, "admin/usuarios");
  }
}

/** Cadastra um usuário: { nome, email, senha, papel } (só admin). */
export async function POST(req: NextRequest) {
  const acesso = await exigirAdmin(req);
  if (!acesso.ok) return acesso.res;
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const nome = String(body?.nome ?? "").trim();
    const senha = String(body?.senha ?? "");
    const papel: Papel = body?.papel === "admin" ? "admin" : "usuario";
    if (!nome) return NextResponse.json({ error: "Informe o nome" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "E-mail inválido" }, { status: 400 });
    if (senha.length < 8) return NextResponse.json({ error: "A senha precisa ter pelo menos 8 caracteres" }, { status: 400 });
    if (await buscarUsuarioPorEmail(email)) {
      return NextResponse.json({ error: "Já existe uma conta com este e-mail" }, { status: 409 });
    }
    const usuario = await criarUsuario(email, nome, await hashSenha(senha), papel);
    return NextResponse.json({ usuario }, { status: 201 });
  } catch (e) {
    return falhaApi(e, "admin/usuarios");
  }
}
