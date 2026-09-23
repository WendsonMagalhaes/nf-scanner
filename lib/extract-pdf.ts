/**
 * Orquestra a leitura de um PDF (só servidor):
 *  1) tenta o texto embutido (PDFs digitais) com pdf-parse;
 *  2) se não bastar (PDF escaneado), faz OCR em etapas e PARA assim que os
 *     dados estiverem confirmados — a maioria das notas resolve em 1–3 passadas.
 */
import { extractFromText, type ExtractedData } from "./extract";
import { openPdfPages, ocrImage } from "./ocr";

export type Metodo = "texto" | "ocr";

export interface ExtractResult extends ExtractedData {
  method: Metodo;
}

// Fração do topo da página que contém os dados da DANFE (e o "Beneficiário
// Final" dos boletos). Recortar deixa o OCR mais rápido e mais preciso.
const CROP_TOPO = 0.38;

// Máximo de páginas lidas por OCR (página 1 = DANFE; as seguintes costumam ser
// boletos, cujo "Beneficiário Final" confirma o fornecedor).
const MAX_PAGINAS = 4;

interface Passada {
  page: number;
  psm: "auto" | "sparse";
}

function melhor(a: ExtractedData, b: ExtractedData): ExtractedData {
  const pontos = (d: ExtractedData) =>
    (d.confidence === "alta" ? 10 : 0) +
    (d.chaveAcesso ? 4 : 0) +
    [d.date, d.nfNumber, d.supplier].filter(Boolean).length;
  return pontos(b) > pontos(a) ? b : a;
}

async function lerTextoNativo(buffer: Buffer): Promise<string> {
  try {
    // Importa o arquivo interno: o index.js do pdf-parse tenta abrir um PDF de teste
    // quando é carregado fora do "require" clássico (bug conhecido da lib).
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    const parsed = await pdfParse(buffer);
    return parsed.text ?? "";
  } catch (err) {
    if (process.env.NF_DEBUG) console.log("[nf] pdf-parse falhou:", (err as Error).message);
    return ""; // PDF só com imagem, ou que o pdf-parse não conseguiu abrir
  }
}

export async function extractFromPdfBuffer(buffer: Buffer): Promise<ExtractResult> {
  // 1) texto embutido
  const textoNativo = await lerTextoNativo(buffer);
  const doTexto = extractFromText(textoNativo);
  if (doTexto.confidence === "alta") return { ...doTexto, method: "texto" };

  // 2) OCR
  const pages = await openPdfPages(buffer);
  try {
    const ultimaPagina = Math.min(pages.numPages, MAX_PAGINAS);
    let proximaPagina = 2;
    let sparseFeito = false;

    // Escolhe a próxima passada conforme o que ainda falta:
    //  - sem chave legível -> outro modo de segmentação na página 1;
    //  - com chave mas fornecedor/data sem confirmação -> páginas seguintes (boletos).
    const proxima = (res: ExtractedData): Passada | null => {
      if (!res.chaveAcesso && !sparseFeito) {
        sparseFeito = true;
        return { page: 1, psm: "sparse" };
      }
      if (proximaPagina <= ultimaPagina) return { page: proximaPagina++, psm: "auto" };
      if (!sparseFeito) {
        sparseFeito = true;
        return { page: 1, psm: "sparse" };
      }
      return null;
    };

    const imagens = new Map<number, Buffer>();
    let textoOcr = "";
    let resultado: ExtractedData | null = null;
    let passada: Passada | null = { page: 1, psm: "auto" };

    while (passada) {
      const { page, psm } = passada;
      let png = imagens.get(page);
      if (!png) {
        png = await pages.renderTop(page, CROP_TOPO);
        imagens.set(page, png);
      }
      textoOcr += "\n" + (await ocrImage(png, psm));

      resultado = extractFromText(textoOcr);
      if (process.env.NF_DEBUG) {
        console.log(
          `[nf] OCR pág ${page} (${psm}) -> conf=${resultado.confidence} nf=${resultado.nfNumber} data=${resultado.date} forn=${resultado.supplier}`
        );
      }
      if (resultado.confidence === "alta") break;
      passada = proxima(resultado);
    }

    // se o texto nativo (quando existe) rendeu mais que o OCR, usa ele
    const final = melhor(resultado!, doTexto);
    return { ...final, method: final === resultado ? "ocr" : "texto" };
  } finally {
    await pages.destroy();
  }
}
