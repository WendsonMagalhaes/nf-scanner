import { NextRequest, NextResponse } from "next/server";
import { falhaApi, semSessao, uidAtivo } from "@/lib/sessao";
import { inserirHistorico, limparHistorico, listarHistorico, removerHistorico, type NovoRegistro } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lista o histórico do usuário logado (mais recentes primeiro). */
export async function GET(req: NextRequest) {
  const uid = await uidAtivo(req);
  if (!uid) return semSessao();
  try {
    return NextResponse.json({ registros: await listarHistorico(uid) });
  } catch (e) {
    return falhaApi(e, "historico");
  }
}

/** Grava um lote de notas: { registros: [...] } */
export async function POST(req: NextRequest) {
  const uid = await uidAtivo(req);
  if (!uid) return semSessao();
  try {
    const body = await req.json();
    const registros: NovoRegistro[] = Array.isArray(body?.registros) ? body.registros : [];
    const validos = registros.filter(
      (r) => r && typeof r.nomeFinal === "string" && typeof r.arquivoOriginal === "string" && typeof r.numero === "string" && typeof r.fornecedor === "string"
    );
    return NextResponse.json({ gravados: await inserirHistorico(uid, validos) });
  } catch (e) {
    return falhaApi(e, "historico");
  }
}

/** ?id=123 apaga um registro; ?todos=1 apaga o histórico inteiro. */
export async function DELETE(req: NextRequest) {
  const uid = await uidAtivo(req);
  if (!uid) return semSessao();
  try {
    const { searchParams } = new URL(req.url);
    if (searchParams.get("todos") === "1") await limparHistorico(uid);
    else await removerHistorico(uid, searchParams.get("id"));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return falhaApi(e, "historico");
  }
}
