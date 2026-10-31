import { NextRequest, NextResponse } from "next/server";
import { falhaApi, semSessao, uidAtivo } from "@/lib/sessao";
import { registrarCorrecoes, resumoCorrecoes, type CorrecaoNova } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Quantas correções o usuário já fez e as mais recentes. */
export async function GET(req: NextRequest) {
  const uid = await uidAtivo(req);
  if (!uid) return semSessao();
  try {
    return NextResponse.json(await resumoCorrecoes(uid));
  } catch (e) {
    return falhaApi(e, "correcoes");
  }
}

/** Registra correções: { itens: [{ campo, cnpj?, arquivo?, valorExtraido?, valorCorrigido }] } */
export async function POST(req: NextRequest) {
  const uid = await uidAtivo(req);
  if (!uid) return semSessao();
  try {
    const body = await req.json();
    const itens: CorrecaoNova[] = Array.isArray(body?.itens) ? body.itens : [];
    return NextResponse.json({ gravados: await registrarCorrecoes(uid, itens) });
  } catch (e) {
    return falhaApi(e, "correcoes");
  }
}
