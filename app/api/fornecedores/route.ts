import { NextRequest, NextResponse } from "next/server";
import { BancoIndisponivel } from "@/lib/db";
import { listarFornecedores, removerFornecedor, salvarFornecedor } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function falha(e: unknown) {
  if (e instanceof BancoIndisponivel) {
    console.error("[fornecedores]", e.message);
    return NextResponse.json({ error: e.message, configurado: e.configurado }, { status: 503 });
  }
  console.error(e);
  return NextResponse.json({ error: "Erro inesperado" }, { status: 500 });
}

export async function GET() {
  try {
    return NextResponse.json({ itens: await listarFornecedores() });
  } catch (e) {
    return falha(e);
  }
}

/**
 * Salva um fornecedor ou vários (importação):
 *   { cnpj, nome?, categoria? }   ou   { itens: [{ cnpj, nome?, categoria? }, ...] }
 * Só os campos enviados são alterados; null limpa o campo.
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const itens: any[] = Array.isArray(body?.itens) ? body.itens : [body];
    let salvos = 0;
    for (const it of itens) {
      const dados: { nome?: string | null; categoria?: "padrao" | "produto" | null } = {};
      if (it && "nome" in it) dados.nome = typeof it.nome === "string" ? it.nome : null;
      if (it && "categoria" in it) dados.categoria = it.categoria === "padrao" || it.categoria === "produto" ? it.categoria : null;
      if (await salvarFornecedor(it?.cnpj, dados)) salvos++;
    }
    return NextResponse.json({ salvos });
  } catch (e) {
    return falha(e);
  }
}

/** ?cnpj=08915713 */
export async function DELETE(req: NextRequest) {
  try {
    await removerFornecedor(new URL(req.url).searchParams.get("cnpj"));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return falha(e);
  }
}
