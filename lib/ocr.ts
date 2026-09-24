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

export type Rotacao = 0 | 90 | 180 | 270;

export interface RegiaoPagina {
  /** fração vertical inicial/final (0..1) da página JÁ girada */
  y0?: number;
  y1?: number;
  /** recorte horizontal (0..1); útil para o quadro do nº da NFS-e no canto */
  x0?: number;
  x1?: number;
  /** converte para preto e branco (ajuda em fundos cinza) */
  binarizar?: number;
  /** giro horário, em graus, aplicado antes do recorte */
  rotacao?: Rotacao;
  /** multiplicador sobre RENDER_DPI (ex.: 0.5 = leitura rápida, 1.5 = detalhe) */
  escala?: number;
}

export interface PdfPages {
  numPages: number;
  /** PNG da página (1-based), recortado para a fração `cropTop` do topo. */
  renderTop(pageNumber: number, cropTop?: number): Promise<Buffer>;
  /** PNG de uma região da página, com giro/escala opcionais. */
  renderRegion(pageNumber: number, regiao?: RegiaoPagina): Promise<Buffer>;
  /** Pixels crus (para leitura de código de barras). */
  renderPixels(pageNumber: number, regiao?: RegiaoPagina): Promise<{ data: Uint8ClampedArray; width: number; height: number }>;
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

  // Sem Web Worker no Node, o pdfjs faz `eval("require")("./pdf.worker.js")` — um
  // require dinâmico que o bundler/tracing da Vercel não enxerga, então o arquivo
  // não vai no deploy ("Cannot find module './pdf.worker.js'"). Importando o worker
  // de forma estática aqui, ele entra no bundle e o pdfjs o usa via globalThis.
  if (!g.pdfjsWorker?.WorkerMessageHandler) {
    const worker: any = await import("pdfjs-dist/legacy/build/pdf.worker.js");
    g.pdfjsWorker = { WorkerMessageHandler: (worker.WorkerMessageHandler ?? worker.default?.WorkerMessageHandler) };
  }

  // Diagnóstico: o pdfjs só repassa a mensagem do erro ao montar o "fake worker".
  // Aguardar o carregamento aqui expõe o erro original (com stack) nos logs da Vercel.
  try {
    await pdfjs.PDFWorker._setupFakeWorkerGlobal;
  } catch (err) {
    console.error("[nf] falha ao carregar o worker do pdfjs:", (err as Error)?.stack ?? err);
    throw err;
  }

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

  // Página inteira renderizada uma única vez (várias passadas reaproveitam).
  const cache = new Map<number, any>();
  async function paginaCompleta(pageNumber: number) {
    const hit = cache.get(pageNumber);
    if (hit) return hit;
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
    cache.set(pageNumber, canvas);
    return canvas;
  }

  async function recortar(pageNumber: number, r: RegiaoPagina = {}) {
    const src = await paginaCompleta(pageNumber);
    const rot = r.rotacao ?? 0;
    let base = src;
    if (rot !== 0) {
      const swap = rot === 90 || rot === 270;
      const w = swap ? src.height : src.width;
      const h = swap ? src.width : src.height;
      base = createCanvas(w, h);
      const ctx = base.getContext("2d");
      if (rot === 90) ctx.translate(w, 0);
      else if (rot === 180) ctx.translate(w, h);
      else ctx.translate(0, h);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.drawImage(src as any, 0, 0);
    }
    const y0 = Math.round(base.height * Math.max(0, r.y0 ?? 0));
    const y1 = Math.round(base.height * Math.min(1, r.y1 ?? 1));
    const x0 = Math.round(base.width * Math.max(0, r.x0 ?? 0));
    const x1 = Math.round(base.width * Math.min(1, r.x1 ?? 1));
    const cropH = Math.max(1, y1 - y0);
    const cropW = Math.max(1, x1 - x0);
    const k = r.escala ?? 1;
    const outW = Math.max(1, Math.round(cropW * k));
    const outH = Math.max(1, Math.round(cropH * k));
    const out = createCanvas(outW, outH);
    const octx = out.getContext("2d");
    octx.fillStyle = "#ffffff";
    octx.fillRect(0, 0, outW, outH);
    octx.drawImage(base as any, x0, y0, cropW, cropH, 0, 0, outW, outH);
    if (r.binarizar) {
      const img = octx.getImageData(0, 0, outW, outH);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const g = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
        d[i] = d[i + 1] = d[i + 2] = g < r.binarizar ? 0 : 255;
      }
      octx.putImageData(img, 0, 0);
    }
    return out;
  }

  return {
    numPages: doc.numPages as number,

    async renderTop(pageNumber: number, cropTop = 1) {
      const out = await recortar(pageNumber, { y0: 0, y1: cropTop });
      return out.toBuffer("image/png");
    },

    async renderRegion(pageNumber: number, regiao?: RegiaoPagina) {
      const out = await recortar(pageNumber, regiao);
      return out.toBuffer("image/png");
    },

    async renderPixels(pageNumber: number, regiao?: RegiaoPagina) {
      const out = await recortar(pageNumber, regiao);
      const img = out.getContext("2d").getImageData(0, 0, out.width, out.height);
      return { data: img.data, width: out.width, height: out.height };
    },

    async destroy() {
      cache.clear();
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