/**
 * Teste da classificação (padrão x produto x serviço) e do nome do arquivo.
 * Usa texto sintético, sem PDF:  npx tsx test/categoria.ts
 */
import { extractFromText, buildFilename, type Categoria } from "../lib/extract";

// monta uma chave de 44 dígitos válida (UF 25, modelo 55) para um CNPJ de emitente
function chaveFalsa(cnpj: string, nNF: string, aamm = "2609"): string {
  const base = "25" + aamm + cnpj + "55" + "001" + nNF.padStart(9, "0") + "1" + "12345678";
  let sum = 0, w = 2;
  for (let i = 42; i >= 0; i--) { sum += Number(base[i]) * w; w = w === 9 ? 2 : w + 1; }
  const r = sum % 11;
  return base + (r < 2 ? 0 : 11 - r);
}

function danfe(cnpj: string, nNF: string, natureza: string) {
  return [
    "DANFE", "DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRONICA",
    `NATUREZA DA OPERAÇÃO ${natureza}`,
    `CHAVE DE ACESSO ${chaveFalsa(cnpj, nNF)}`,
    "DATA DA EMISSÃO 15/09/2026",
  ].join("\n");
}

let falhas = 0;
function esperar(titulo: string, obtido: unknown, esperado: unknown) {
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? "OK  " : "FAIL"} ${titulo}${ok ? "" : `  -> obtido ${obtido}, esperado ${esperado}`}`);
}
const cat = (t: string, hints = {}) => extractFromText(t, hints).categoria as Categoria;

// completa uma raiz de 8 dígitos num CNPJ válido (filial 0001 + dígitos verificadores)
function cnpjDeRaiz(raiz: string): string {
  const dv = (b: string) => {
    let w = b.length - 7, sum = 0;
    for (const ch of b) { sum += Number(ch) * w--; if (w < 2) w = 9; }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const b12 = raiz + "0001";
  const d1 = dv(b12);
  return b12 + d1 + dv(b12 + d1);
}

const VALENCIO = cnpjDeRaiz("08915713");
const PRIMUS = cnpjDeRaiz("54307872"); // a classificação usa só a raiz (8 dígitos)
const DESCONHECIDO = cnpjDeRaiz("11222333");

// --- o bug: natureza normal de revenda NÃO pode virar "produto"
esperar("revenda: VENDA DE MERCADORIA (fornecedor desconhecido)", cat(danfe(DESCONHECIDO, "1", "VENDA DE MERCADORIA")), "padrao");
esperar("revenda: VENDA DE PRODUCAO DO ESTABELECIMENTO", cat(danfe(DESCONHECIDO, "2", "VENDA DE PRODUCAO DO ESTABELECIMENTO")), "padrao");
esperar("revenda: VENDA MERC. ADQ. DE TERCEIROS", cat(danfe(DESCONHECIDO, "3", "VENDA MERC. ADQ. DE TERCEIROS")), "padrao");
esperar("revenda: sem natureza legível", cat(danfe(DESCONHECIDO, "4", "")), "padrao");
esperar("revenda: fornecedor da lista (Valencio) com natureza estranha", cat(danfe(VALENCIO, "5", "OPERACAO DIVERSA XYZ")), "padrao");

// --- não revenda de verdade
esperar("produto: uso e consumo", cat(danfe(DESCONHECIDO, "6", "VENDA PARA USO E CONSUMO")), "produto");
esperar("produto: ativo imobilizado", cat(danfe(DESCONHECIDO, "7", "VENDA DE ATIVO IMOBILIZADO")), "produto");
esperar("produto: fornecedor da lista de não revenda (Primus)", cat(danfe(PRIMUS, "8", "VENDA DE MERCADORIA")), "produto");

// --- aprendizado do usuário vale mais que tudo (menos devolução)
esperar("aprendido: desconhecido marcado como produto", cat(danfe(DESCONHECIDO, "9", "VENDA DE MERCADORIA"), { categoriasExtras: { "11222333": "produto" } }), "produto");
esperar("aprendido: Primus marcado como padrão", cat(danfe(PRIMUS, "10", "VENDA DE MERCADORIA"), { categoriasExtras: { "54307872": "padrao" } }), "padrao");

// --- devolução continua funcionando
esperar("devolução de cliente (entrada)", cat(danfe(DESCONHECIDO, "11", "DEVOLUCAO DE VENDA")), "devolucaoCliente");

// --- nomes de arquivo
esperar("nome padrão", buildFilename("15-09-2026", "000161683", "FRIGORIFICO VALENCIO LTDA", "NFe", "padrao"),
  "15-09-2026 - NF-e 000161683 - FRIGORIFICO VALENCIO LTDA.pdf");
esperar("nome produto", buildFilename("14-09-2026", "000000315", "PRIMUS CENTRO AUTOMOTIVO LTDA", "NFe", "produto"),
  "14-09-2026 - NF-e 000000315 - PRIMUS CENTRO AUTOMOTIVO LTDA - PRODUTO.pdf");
esperar("nome serviço (NF-e ... - SERVIÇOS)", buildFilename("14-09-2026", "0000693", "PRIMUS CENTRO AUTOMOTIVO LTDA", "NFSe", "servico"),
  "14-09-2026 - NF-e 0000693 - PRIMUS CENTRO AUTOMOTIVO LTDA - SERVIÇOS.pdf");
esperar("nome serviço mesmo sem categoria ajustada", buildFilename("14-09-2026", "0000693", "PRIMUS CENTRO AUTOMOTIVO LTDA", "NFSe"),
  "14-09-2026 - NF-e 0000693 - PRIMUS CENTRO AUTOMOTIVO LTDA - SERVIÇOS.pdf");

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo");
process.exit(falhas ? 1 : 0);
