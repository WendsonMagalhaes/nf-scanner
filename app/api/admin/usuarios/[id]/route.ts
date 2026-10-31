import { NextRequest, NextResponse } from "next/server";
import { hashSenha } from "@/lib/auth";
import { exigirAdmin, falhaApi } from "@/lib/sessao";
import {
  atualizarSenha, atualizarUsuario, buscarUsuario, buscarUsuarioPorEmail, contarAdmins, removerUsuario, type Papel,
} from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: { id: string } };

/**
 * Edita um usuário (só admin): { nome?, email?, papel?, novaSenha? }.
 * novaSenha redefine a senha (útil quando alguém esquece).
 */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const acesso = await exigirAdmin(req);
  if (!acesso.ok) return acesso.res;
  const id = params.id;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Usuário inválido" }, { status: 400 });
  try {
    const alvo = await buscarUsuario(id);
    if (!alvo) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const dados: { nome?: string; email?: string; papel?: Papel } = {};

    if (body?.nome !== undefined) {
      const nome = String(body.nome).trim();
      if (!nome) return NextResponse.json({ error: "Informe o nome" }, { status: 400 });
      dados.nome = nome;
    }
    if (body?.email !== undefined) {
      const email = String(body.email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "E-mail inválido" }, { status: 400 });
      const outro = await buscarUsuarioPorEmail(email);
      if (outro && outro.id !== id) return NextResponse.json({ error: "Já existe uma conta com este e-mail" }, { status: 409 });
      dados.email = email;
    }
    if (body?.papel !== undefined) {
      const papel: Papel = body.papel === "admin" ? "admin" : "usuario";
      // nunca deixa o sistema sem nenhum administrador
      if (alvo.papel === "admin" && papel === "usuario" && (await contarAdmins()) <= 1) {
        return NextResponse.json({ error: "Este é o último administrador. Promova outro usuário antes." }, { status: 409 });
      }
      dados.papel = papel;
    }
    if (body?.novaSenha !== undefined && body.novaSenha !== "") {
      const novaSenha = String(body.novaSenha);
      if (novaSenha.length < 8) return NextResponse.json({ error: "A senha precisa ter pelo menos 8 caracteres" }, { status: 400 });
      await atualizarSenha(id, await hashSenha(novaSenha));
    }

    const usuario = Object.keys(dados).length ? await atualizarUsuario(id, dados) : alvo;
    return NextResponse.json({ usuario });
  } catch (e) {
    return falhaApi(e, "admin/usuarios/id");
  }
}

/** Exclui a conta (só admin). Apaga também o histórico, fornecedores e correções dela. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const acesso = await exigirAdmin(req);
  if (!acesso.ok) return acesso.res;
  const id = params.id;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Usuário inválido" }, { status: 400 });
  if (id === acesso.usuario.id) {
    return NextResponse.json({ error: "Você não pode excluir a própria conta" }, { status: 409 });
  }
  try {
    const alvo = await buscarUsuario(id);
    if (!alvo) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    if (alvo.papel === "admin" && (await contarAdmins()) <= 1) {
      return NextResponse.json({ error: "Este é o último administrador" }, { status: 409 });
    }
    await removerUsuario(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return falhaApi(e, "admin/usuarios/id");
  }
}
