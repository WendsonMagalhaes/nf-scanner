import { NextRequest, NextResponse } from "next/server";
import { falhaApi, semSessao, uidAtivo } from "@/lib/sessao";
import { listarFornecedores, removerFornecedor, salvarFornecedor } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const uid = await uidAtivo(req);
  if (!uid) return semSessao();
  try {
    return NextResponse.json({ itens: await listarFornecedores(uid) });
  } catch (e) {
    return falhaApi(e, "fornecedores");
  }
}

/**
 * Salva um fornecedor ou vários (importação):
 *   { cnpj, nome?, categoria? }   ou   { itens: [{ cnpj, nome?, categoria? }, ...] }
 * Só os campos enviados são alterados; null limpa o campo.
 */
export async function PUT(req: NextRequest) {
  const uid = await uidAtivo(req);
  if (!uid) return semSessao();
  try {
    const body = await req.json();
    const itens: any[] = Array.isArray(body?.itens) ? body.itens : [body];
    let salvos = 0;
    for (const it of itens) {
      const dados: { nome?: string | null; categoria?: "padrao" | "produto" | null } = {};
      if (it && "nome" in it) dados.nome = typeof it.nome === "string" ? it.nome : null;
      if (it && "categoria" in it) dados.categoria = it.categoria === "padrao" || it.categoria === "produto" ? it.categoria : null;
      if (await salvarFornecedor(uid, it?.cnpj, dados)) salvos++;
    }
    return NextResponse.json({ salvos });
  } catch (e) {
    return falhaApi(e, "fornecedores");
  }
}

/** ?cnpj=08915713 */
export async function DELETE(req: NextRequest) {
  const uid = await uidAtivo(req);
  if (!uid) return semSessao();
  try {
    await removerFornecedor(uid, new URL(req.url).searchParams.get("cnpj"));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return falhaApi(e, "fornecedores");
  }
}
