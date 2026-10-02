import { NextRequest, NextResponse } from "next/server";
import { extractFromPdfBuffer } from "@/lib/extract-pdf";
import { fornecedoresParaExtracao } from "@/lib/repo";

// pdf-parse, pdfjs e tesseract precisam de runtime Node (não funcionam no edge)
export const runtime = "nodejs";
// OCR de PDFs escaneados leva alguns segundos por arquivo
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    // Nomes e categorias de fornecedor que você definiu/corrigiu (guardados no banco).
    // Se o banco estiver fora do ar, a leitura segue só com a lista que já vem no sistema.
    let nomes: Record<string, string> | undefined;
    let categorias: Record<string, "padrao" | "produto"> | undefined;
    try {
      ({ nomes, categorias } = await fornecedoresParaExtracao());
    } catch (e) {
      console.warn("[extract] sem banco, usando só a lista do sistema:", (e as Error).message);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await extractFromPdfBuffer(buffer, nomes, categorias);

    return NextResponse.json({
      originalName: file.name,
      ...result,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Falha ao processar o PDF" },
      { status: 500 }
    );
  }
}
