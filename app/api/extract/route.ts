import { NextRequest, NextResponse } from "next/server";
import { extractFromPdfBuffer } from "@/lib/extract-pdf";
import { aprendizadoDoHistorico, buscarDuplicata, correcoesDeFornecedor, fornecedoresParaExtracao, type Duplicata } from "@/lib/repo";
import { aplicarNomeAprendido } from "@/lib/aprendizado";
import { semSessao, uidAtivo } from "@/lib/sessao";

// pdf-parse, pdfjs e tesseract precisam de runtime Node (não funcionam no edge)
export const runtime = "nodejs";
// OCR de PDFs escaneados leva alguns segundos por arquivo
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const uid = await uidAtivo(req);
  if (!uid) return semSessao();
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    // Sugestões de nome e categoria: primeiro o que o usuário salvou na tabela de
    // fornecedores; se não houver, o que ele mais usou no histórico para o mesmo CNPJ.
    // Se o banco estiver fora do ar, a leitura segue só com a lista que já vem no sistema.
    let nomes: Record<string, string> | undefined;
    let categorias: Record<string, "padrao" | "produto"> | undefined;
    let nomesCorrigidos: Record<string, string> = {};
    try {
      const salvos = await fornecedoresParaExtracao(uid);
      const historico = await aprendizadoDoHistorico(uid);
      nomes = { ...historico.nomes, ...salvos.nomes };
      categorias = { ...historico.categorias, ...salvos.categorias };
      nomesCorrigidos = await correcoesDeFornecedor(uid);
    } catch (e) {
      console.warn("[extract] sem banco, usando só a lista do sistema:", (e as Error).message);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await extractFromPdfBuffer(buffer, nomes, categorias);
    const fornecedor = aplicarNomeAprendido(result.supplier, nomesCorrigidos);

    // a nota já foi renomeada antes? (aviso, não bloqueia)
    let duplicada: Duplicata | null = null;
    try {
      duplicada = await buscarDuplicata(uid, result.chaveAcesso ?? null, result.nfNumber ?? "", result.supplierCnpj ?? null);
    } catch (e) {
      console.warn("[extract] não consegui checar duplicatas:", (e as Error).message);
    }

    return NextResponse.json({
      originalName: file.name,
      ...result,
      supplier: fornecedor.nome,
      nomeAprendido: fornecedor.aprendido,
      duplicada,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Falha ao processar o PDF" }, { status: 500 });
  }
}
