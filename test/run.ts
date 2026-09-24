/**
 * Teste de regressão: roda o extrator nos PDFs de uma pasta e compara com test/expected.json.
 *   npx tsx test/run.ts [pasta-com-pdfs]
 * Para cada PDF novo que der erro, acrescente a linha correta em expected.json.
 * A chave é o prefixo do nome do arquivo (ex.: "1715" para 1715_2609..._002.pdf).
 */
import fs from "node:fs";
import path from "node:path";
import { extractFromPdfBuffer } from "../lib/extract-pdf";
import { terminateOcr } from "../lib/ocr";
import { buildFilename } from "../lib/extract";

const dir = process.argv[2] ?? "/mnt/user-data/uploads";
const expected: Record<string, any> = JSON.parse(fs.readFileSync(path.join(__dirname, "expected.json"), "utf8"));

(async () => {
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf")).sort();
  let ok = 0, total = 0, semGabarito = 0, tempo = 0;
  const falhas: string[] = [];
  for (const f of files) {
    const key = f.split(/[_.]/)[0];
    const exp = expected[key];
    const t = Date.now();
    let r: any;
    try { r = await extractFromPdfBuffer(fs.readFileSync(path.join(dir, f))); } catch (e: any) { console.log(`${key} ERRO ${e.message}`); continue; }
    const ms = Date.now() - t; tempo += ms;
    const nome = r.date && r.nfNumber && r.supplier ? buildFilename(r.date, r.nfNumber, r.supplier, r.docType) : "(incompleto)";
    if (!exp) { semGabarito++; console.log(`${key}  [sem gabarito] ${nome}`); continue; }
    total++;
    const esperado = buildFilename(exp.date, exp.nf, exp.supplier, exp.tipo);
    const certo = nome === esperado;
    if (certo) ok++; else falhas.push(key);
    console.log(`${certo ? "OK  " : "FAIL"} ${key} ${r.confidence.padEnd(5)} ${r.method} ${(ms / 1000).toFixed(1)}s  ${nome}${certo ? "" : `\n         esperado: ${esperado}`}`);
  }
  console.log(`\nCorretos: ${ok}/${total}${semGabarito ? ` (+${semGabarito} sem gabarito)` : ""} · tempo médio ${(tempo / Math.max(1, files.length) / 1000).toFixed(1)}s/arquivo`);
  if (falhas.length) console.log("Falharam:", falhas.join(", "));
  await terminateOcr();
  process.exit(falhas.length ? 1 : 0);
})();
