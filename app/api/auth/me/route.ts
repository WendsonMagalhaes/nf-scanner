import { NextRequest, NextResponse } from "next/server";
import { usuarioIdDaRequisicao } from "@/lib/auth";
import { cadastroPermitido } from "@/lib/sessao";
import { buscarUsuario } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Quem está logado (usuario = null se ninguém). Sempre 200. */
export async function GET(req: NextRequest) {
  try {
    const uid = await usuarioIdDaRequisicao(req);
    const usuario = uid ? await buscarUsuario(uid) : null;
    return NextResponse.json({ usuario, cadastroAberto: await cadastroPermitido() });
  } catch (e) {
    console.error("[auth/me]", e);
    return NextResponse.json({ usuario: null, cadastroAberto: false });
  }
}
