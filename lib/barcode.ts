/**
 * Leitura do código de barras (Code 128) da DANFE, que codifica a CHAVE DE
 * ACESSO de 44 dígitos. É bem mais confiável que OCR: o código de barras tem
 * checksum próprio e independe da orientação da página (scans girados).
 * Só roda no servidor.
 */
import fs from "node:fs";
import path from "node:path";
import { chaveValida } from "./extract";
import type { PdfPages, RegiaoPagina } from "./ocr";

let pronto: Promise<any> | null = null;

async function carregar() {
  if (!pronto) {
    pronto = (async () => {
      const mod: any = await import("zxing-wasm/reader");
      // o wasm vem do node_modules (sem depender de CDN => funciona offline)
      const wasmPath = path.join(process.cwd(), "node_modules", "zxing-wasm", "dist", "reader", "zxing_reader.wasm");
      await mod.prepareZXingModule({
        overrides: { wasmBinary: fs.readFileSync(wasmPath) },
        fireImmediately: true,
      });
      return mod;
    })();
  }
  return pronto;
}

export interface ChaveDoBarcode {
  chave: string;
  /** graus reportados pelo leitor: 0 = página em pé; ±90/180 = digitalizada girada */
  orientacao: number;
}

const TENTATIVAS: RegiaoPagina[] = [
  { y0: 0, y1: 1, escala: 1 }, // página inteira (acha inclusive páginas giradas)
  { y0: 0, y1: 0.25, escala: 1.5 }, // topo ampliado (barras finas / scan claro)
  { y0: 0, y1: 0.2, escala: 2 },
];

export async function lerChaveDoBarcode(pages: PdfPages, pageNumber = 1): Promise<ChaveDoBarcode | null> {
  let mod: any;
  try {
    mod = await carregar();
  } catch (err) {
    if (process.env.NF_DEBUG) console.log("[nf] zxing indisponível:", (err as Error).message);
    return null;
  }
  for (const regiao of TENTATIVAS) {
    try {
      const px = await pages.renderPixels(pageNumber, regiao);
      const res: any[] = await mod.readBarcodes(px, {
        formats: ["Code128"],
        tryHarder: true,
        tryRotate: true,
        maxNumberOfSymbols: 6,
      });
      for (const r of res) {
        const t = String(r.text ?? "").replace(/\D/g, "");
        if (chaveValida(t)) return { chave: t, orientacao: Number(r.orientation ?? 0) };
      }
    } catch (err) {
      if (process.env.NF_DEBUG) console.log("[nf] barcode falhou:", (err as Error).message);
    }
  }
  return null;
}
