/**
 * Orquestra a leitura de um PDF (só servidor):
 *  1) tenta o texto embutido (PDFs digitais) com pdf-parse;
 *  2) se não bastar (PDF escaneado), faz OCR em etapas e PARA assim que os
 *     dados estiverem confirmados — a maioria das notas resolve em 1–3 passadas.
 */
import { extractFromText, type ExtractedData, type ExtractHints } from "./extract";
import { openPdfPages, ocrImage, type PdfPages, type Rotacao } from "./ocr";
import { lerChaveDoBarcode } from "./barcode";

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

type Regiao = "topo" | "base";

interface Passada {
  page: number;
  psm: "auto" | "sparse";
  regiao: Regiao;
}

// Palavras que aparecem em qualquer DANFE/NFS-e. Página girada => quase nenhuma é lida.
const PALAVRAS_CHAVE = [
  "DANFE", "CHAVE DE ACESSO", "NATUREZA DA OPERACAO", "DESTINATARIO", "CALCULO DO IMPOSTO",
  "INSCRICAO ESTADUAL", "TRANSPORTADOR", "EMISSAO", "PRESTADOR DE SERVICOS", "TOMADOR", "NOTA FISCAL",
  "PROTOCOLO", "RAZAO SOCIAL", "CNPJ",
];
function pontuarTexto(t: string): number {
  const f = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return PALAVRAS_CHAVE.filter((k) => f.includes(k)).length;
}

/** Testa a página em outras orientações (leitura rápida) e devolve a que "faz sentido". */
async function escolherRotacao(pages: PdfPages, candidatas: Rotacao[]): Promise<{ rot: Rotacao; pontos: number }> {
  let melhorRot: Rotacao = candidatas[0];
  let melhorPts = -1;
  for (const rot of candidatas) {
    const png = await pages.renderRegion(1, { y0: 0, y1: 0.5, rotacao: rot, escala: 0.75 });
    const pts = pontuarTexto(await ocrImage(png, "auto"));
    if (process.env.NF_DEBUG) console.log(`[nf] rotação ${rot}° -> ${pts} palavras-chave`);
    if (pts > melhorPts) [melhorRot, melhorPts] = [rot, pts];
    if (pts >= 6) break; // claramente na posição certa
  }
  return { rot: melhorRot, pontos: melhorPts };
}

/** NFS-e: o nº fica num quadro cinza no canto; lê só esse quadro, ampliado e em P&B. */
async function lerNumeroNfse(pages: PdfPages, rot: Rotacao): Promise<string | null> {
  const png = await pages.renderRegion(1, { y0: 0, y1: 0.1, x0: 0.72, x1: 1, rotacao: rot, escala: 3, binarizar: 140 });
  const t = await ocrImage(png, "sparse");
  const m = t.replace(/(?<=\d)\s+(?=\d)/g, "").match(/(?<!\d)(\d{7})(?!\d)/g);
  return m?.find((x) => !/^20\d{5}$/.test(x)) ?? null;
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

export async function extractFromPdfBuffer(
  buffer: Buffer,
  fornecedoresExtras?: Record<string, string>
): Promise<ExtractResult> {
  // 1) texto embutido
  const textoNativo = await lerTextoNativo(buffer);
  const doTexto = extractFromText(textoNativo, { fornecedoresExtras });
  if (doTexto.confidence === "alta") return { ...doTexto, method: "texto" };

  // 2) código de barras + OCR
  const pages = await openPdfPages(buffer);
  try {
    const ultimaPagina = Math.min(pages.numPages, MAX_PAGINAS);
    const hints: ExtractHints = { fornecedoresExtras };

    // 2a) chave pelo código de barras (rápido, à prova de erro de OCR, e diz se a página está girada)
    const bc = await lerChaveDoBarcode(pages, 1);
    let rot: Rotacao = 0;
    if (bc) {
      hints.chave = bc.chave;
      rot = ((360 - Math.round(bc.orientacao / 90) * 90 + 360) % 360) as Rotacao;
      if (process.env.NF_DEBUG) console.log(`[nf] barcode -> chave ${bc.chave} (orientação ${bc.orientacao}°, giro ${rot}°)`);
    }

    let proximaPagina = 2;
    let sparseFeito = false;
    let baseFeita = false;
    let rotacaoVerificada = !!bc; // com barcode a orientação já é conhecida

    const proxima = (res: ExtractedData): Passada | null => {
      const semChave = !res.chaveAcesso && res.docType === "NFe";
      if (semChave && !sparseFeito) {
        sparseFeito = true;
        return { page: 1, psm: "sparse", regiao: "topo" };
      }
      // sem chave o canhoto (rodapé) traz nº, data e nome do emitente
      if (semChave && !baseFeita) {
        baseFeita = true;
        return { page: 1, psm: "auto", regiao: "base" };
      }
      if (proximaPagina <= ultimaPagina) return { page: proximaPagina++, psm: "auto", regiao: "topo" };
      if (!sparseFeito) {
        sparseFeito = true;
        return { page: 1, psm: "sparse", regiao: "topo" };
      }
      return null;
    };

    const regioes: Record<Regiao, { y0: number; y1: number }> = {
      topo: { y0: 0, y1: CROP_TOPO },
      base: { y0: 0.62, y1: 1 },
    };

    let textoOcr = "";
    let resultado: ExtractedData | null = null;
    let passada: Passada | null = { page: 1, psm: "auto", regiao: "topo" };

    while (passada) {
      const { page, psm, regiao } = passada;
      // só a página 1 é a DANFE/NFS-e; as demais (boletos) nunca vêm giradas
      const r = page === 1 ? rot : 0;
      const png = await pages.renderRegion(page, { ...regioes[regiao], rotacao: r });
      const texto = await ocrImage(png, psm);

      // sem barcode: se o texto não parece uma nota, a página deve estar girada
      if (!rotacaoVerificada && page === 1 && regiao === "topo") {
        rotacaoVerificada = true;
        if (pontuarTexto(texto) < 3) {
          const t = await escolherRotacao(pages, [90, 270, 180]);
          if (t.pontos > pontuarTexto(texto)) {
            rot = t.rot;
            if (process.env.NF_DEBUG) console.log(`[nf] página girada: usando ${rot}°`);
            passada = { page: 1, psm: "auto", regiao: "topo" };
            continue; // refaz a leitura já na orientação certa
          }
        }
      }

      textoOcr += "\n" + texto;
      resultado = extractFromText(textoOcr, hints);

      // NFS-e: o nº fica num quadro à parte (leitura dedicada, uma vez)
      if (resultado.docType === "NFSe" && !hints.nfseNumero) {
        hints.nfseNumero = (await lerNumeroNfse(pages, rot)) ?? "";
        resultado = extractFromText(textoOcr, hints);
      }

      if (process.env.NF_DEBUG) {
        console.log(
          `[nf] OCR pág ${page} ${regiao} (${psm}) -> tipo=${resultado.docType} conf=${resultado.confidence} nf=${resultado.nfNumber} data=${resultado.date} forn=${resultado.supplier}`
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
