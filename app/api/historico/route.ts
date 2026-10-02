import { NextRequest, NextResponse } from "next/server";
import { BancoIndisponivel } from "@/lib/db";
import { inserirHistorico, limparHistorico, listarHistorico, removerHistorico, type NovoRegistro } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function falha(e: unknown) {
  if (e instanceof BancoIndisponivel) {
    console.error("[historico]", e.message);
    return NextResponse.json({ error: e.message, configurado: e.configurado }, { status: 503 });
  }
  console.error(e);
  return NextResponse.json({ error: "Erro inesperado" }, { status: 500 });
}

/** Lista o histórico (mais recentes primeiro). */
export async function GET() {
  try {
    return NextResponse.json({ registros: await listarHistorico() });
  } catch (e) {
    return falha(e);
  }
}

/** Grava um lote de notas: { registros: [...] } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const registros: NovoRegistro[] = Array.isArray(body?.registros) ? body.registros : [];
    const validos = registros.filter(
      (r) => r && typeof r.nomeFinal === "string" && typeof r.arquivoOriginal === "string" && typeof r.numero === "string" && typeof r.fornecedor === "string"
    );
    return NextResponse.json({ gravados: await inserirHistorico(validos) });
  } catch (e) {
    return falha(e);
  }
}

/** ?id=123 apaga um registro; ?todos=1 apaga o histórico inteiro. */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    if (searchParams.get("todos") === "1") await limparHistorico();
    else await removerHistorico(searchParams.get("id"));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return falha(e);
  }
}
