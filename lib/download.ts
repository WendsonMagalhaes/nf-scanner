/**
 * Downloads no navegador (só cliente): um arquivo por vez, ou tudo num .zip.
 */
import JSZip from "jszip";

/** Dispara o download de um arquivo com o nome informado. */
export function baixarBlob(nome: string, arquivo: Blob) {
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/** Se dois arquivos tiverem o mesmo nome final, o segundo vira "nome (2).pdf". */
export function nomesUnicos(nomes: string[]): string[] {
  const usados = new Set<string>();
  return nomes.map((nome) => {
    let final = nome;
    if (usados.has(final)) {
      const base = nome.replace(/\.pdf$/i, "");
      let i = 2;
      while (usados.has(`${base} (${i}).pdf`)) i++;
      final = `${base} (${i}).pdf`;
    }
    usados.add(final);
    return final;
  });
}

/** Pasta do zip não pode ter caracteres proibidos em nomes de arquivo. */
const nomePasta = (p: string) => p.replace(/[\/:*?"<>|]/g, "-").trim();

/** Junta os PDFs num .zip. Com `pasta`, o arquivo entra numa pasta dentro do zip. */
export async function gerarZip(itens: { nome: string; arquivo: Blob; pasta?: string }[]): Promise<Blob> {
  const zip = new JSZip();
  for (const it of itens) zip.file(it.pasta ? `${nomePasta(it.pasta)}/${it.nome}` : it.nome, it.arquivo);
  // PDFs já vêm compactados: guardar sem recompactar é bem mais rápido e pesa quase o mesmo
  return zip.generateAsync({ type: "blob", compression: "STORE" });
}
