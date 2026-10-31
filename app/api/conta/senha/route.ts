import { NextRequest, NextResponse } from "next/server";
import { hashSenha, verificarSenha } from "@/lib/auth";
import { falhaApi, semSessao, uidAtivo } from "@/lib/sessao";
import { atualizarSenha, buscarSenhaHash } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Troca a própria senha: { senhaAtual, novaSenha } */
export async function POST(req: NextRequest) {
  const uid = await uidAtivo(req);
  if (!uid) return semSessao();
  try {
    const body = await req.json().catch(() => ({}));
    const senhaAtual = String(body?.senhaAtual ?? "");
    const novaSenha = String(body?.novaSenha ?? "");
    if (novaSenha.length < 8) {
      return NextResponse.json({ error: "A nova senha precisa ter pelo menos 8 caracteres" }, { status: 400 });
    }
    const guardada = await buscarSenhaHash(uid);
    if (!guardada || !(await verificarSenha(senhaAtual, guardada))) {
      return NextResponse.json({ error: "A senha atual está incorreta" }, { status: 403 });
    }
    if (await verificarSenha(novaSenha, guardada)) {
      return NextResponse.json({ error: "A nova senha precisa ser diferente da atual" }, { status: 400 });
    }
    await atualizarSenha(uid, await hashSenha(novaSenha));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return falhaApi(e, "conta/senha");
  }
}
