/**
 * OCR para PDFs escaneados (só roda no servidor — não importe isso no cliente).
 *
 * Fluxo: PDF -> pdfjs renderiza a página num canvas -> recorta o topo
 * (onde ficam os dados da DANFE) -> tesseract.js lê o texto.
 *
 * Tudo vem de pacotes npm (nada para instalar no sistema). O idioma português
 * vem do pacote @tesseract.js-data/por, então também funciona offline.
 */
import path from "node:path";
import { createWorker, PSM, type Worker } from "tesseract.js";

// Quantos OCRs rodam ao mesmo tempo (cada worker usa bastante CPU/memória).
const POOL_SIZE = Math.max(1, Number(process.env.OCR_WORKERS ?? 2));

// Resolução usada para renderizar as páginas (scanner costuma ser 200 dpi).
const RENDER_DPI = 200;

/* -------------------------------------------------------------------------- */
/* Renderização do PDF                                                        */
/* -------------------------------------------------------------------------- */

export interface PdfPages {
  numPages: number;
  /** PNG da página (1-based), recortado para a fração `cropTop` do topo. */
  renderTop(pageNumber: number, cropTop?: number): Promise<Buffer>;
  destroy(): Promise<void>;
}

export async function openPdfPages(buffer: Buffer): Promise<PdfPages> {
  const canvasLib = await import("@napi-rs/canvas");
  const { createCanvas } = canvasLib;

  // O pdfjs espera essas classes do navegador; no Node vêm do @napi-rs/canvas.
  const g = globalThis as any;
  g.DOMMatrix ??= (canvasLib as any).DOMMatrix;
  g.ImageData ??= (canvasLib as any).ImageData;
  g.Path2D ??= (canvasLib as any).Path2D;

  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.js");

  const canvasFactory = {
    create(width: number, height: number) {
      const canvas = createCanvas(width, height);
      return { canvas, context: canvas.getContext("2d") };
    },
    reset(cc: any, width: number, height: number) {
      cc.canvas.width = width;
      cc.canvas.height = height;
    },
    destroy(cc: any) {
      cc.canvas.width = 0;
      cc.canvas.height = 0;
    },
  };

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    canvasFactory,
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: false,
    verbosity: 0,
  });
  const doc = await loadingTask.promise;

  return {
    numPages: doc.numPages as number,

    async renderTop(pageNumber: number, cropTop = 1) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: RENDER_DPI / 72 });
      const width = Math.ceil(viewport.width);
      const height = Math.ceil(viewport.height);

      const { canvas, context } = canvasFactory.create(width, height);
      // fundo branco (páginas sem fundo sairiam transparentes/pretas no PNG)
      (context as any).fillStyle = "#ffffff";
      (context as any).fillRect(0, 0, width, height);
      await page.render({ canvasContext: context, viewport, canvasFactory }).promise;
      page.cleanup();

      const cropH = Math.max(1, Math.round(height * Math.min(1, cropTop)));
      const out = createCanvas(width, cropH);
      out.getContext("2d").drawImage(canvas as any, 0, 0, width, cropH, 0, 0, width, cropH);
      const png = out.toBuffer("image/png");
      canvasFactory.destroy({ canvas } as any);
      return png;
    },

    async destroy() {
      await doc.destroy();
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Pool de workers do Tesseract                                               */
/* -------------------------------------------------------------------------- */

const idle: Worker[] = [];
const waiters: Array<(w: Worker) => void> = [];
const all: Worker[] = [];
let created = 0;

function tessdataDir() {
  return (
    process.env.TESSDATA_DIR ??
    path.join(process.cwd(), "node_modules", "@tesseract.js-data", "por", "4.0.0_best_int")
  );
}

async function acquire(): Promise<Worker> {
  const free = idle.pop();
  if (free) return free;

  if (created < POOL_SIZE) {
    created++;
    try {
      const worker = await createWorker("por", 1, {
        langPath: tessdataDir(),
        gzip: true,
        cacheMethod: "none", // não grava cache dentro do projeto
      });
      all.push(worker);
      return worker;
    } catch (err) {
      created--;
      throw err;
    }
  }

  return new Promise<Worker>((resolve) => waiters.push(resolve));
}

function release(worker: Worker) {
  const next = waiters.shift();
  if (next) next(worker);
  else idle.push(worker);
}

/** Lê o texto de uma imagem PNG. `psm` muda como o Tesseract segmenta a página. */
export async function ocrImage(png: Buffer, psm: "auto" | "sparse" = "auto"): Promise<string> {
  const worker = await acquire();
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: psm === "sparse" ? PSM.SPARSE_TEXT : PSM.AUTO,
      user_defined_dpi: String(RENDER_DPI),
    });
    const { data } = await worker.recognize(png);
    return data.text ?? "";
  } finally {
    release(worker);
  }
}

/** Encerra os workers (útil em scripts de teste; no servidor Next não precisa). */
export async function terminateOcr() {
  await Promise.all(all.splice(0).map((w) => w.terminate()));
  idle.length = 0;
  created = 0;
}
