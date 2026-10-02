import { NextRequest, NextResponse } from "next/server";
import { extractFromPdfBuffer } from "@/lib/extract-pdf";
import type { CategoriaCompra } from "@/lib/fornecedores";

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

    // nomes que o usuário já corrigiu antes (CNPJ raiz -> nome), guardados no navegador
    let extras: Record<string, string> | undefined;
    try {
      const raw = formData.get("fornecedores");
      if (typeof raw === "string" && raw) extras = JSON.parse(raw);
    } catch {
      extras = undefined;
    }

    // categorias (padrão x produto) que o usuário já corrigiu antes, por CNPJ raiz
    let categorias: Record<string, CategoriaCompra> | undefined;
    try {
      const raw = formData.get("categorias");
      if (typeof raw === "string" && raw) categorias = JSON.parse(raw);
    } catch {
      categorias = undefined;
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await extractFromPdfBuffer(buffer, extras, categorias);

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
