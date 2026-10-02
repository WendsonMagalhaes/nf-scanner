/**
 * Dicionário de fornecedores: CNPJ -> nome que você quer no arquivo.
 *
 * Por que existe: o OCR erra letras ("INPORTADORA"), corta nomes longos e o
 * DANFE às vezes traz o nome abreviado ("JBS SA" / "JBS S/A"). O CNPJ, ao
 * contrário, é lido de forma confiável (código de barras / chave de acesso
 * validada). Com o CNPJ conhecido, o nome sai sempre igual e "confirmado".
 *
 * A chave pode ser o CNPJ completo (14 dígitos) ou só a RAIZ (8 primeiros
 * dígitos = mesma empresa, qualquer filial). Para acrescentar um fornecedor
 * novo basta adicionar uma linha aqui — ou simplesmente corrigir o nome na
 * tela: o app memoriza a correção no navegador.
 */
export const FORNECEDORES: Record<string, string> = {
  "02916265": "JBS SA",
  "05580630": "ICANE INDUSTRIA E COMERCIO DE ALIMENTOS DO NORDESTE EIRELI",
  "08915713": "FRIGORIFICO VALENCIO LTDA",
  "12727145": "GUARAVES GUARABIRA AVES LTDA",
  "83044016": "SEARA COMERCIO DE ALIMENTOS LTDA",
  "03636036": "ASA BRANCA INDUSTRIAL COMERCIAL E IMPORTADORA LTDA",
  "01838723": "BRF SA",
  "54307872": "PRIMUS CENTRO AUTOMOTIVO LTDA",
  "10175806": "A NORDESTINA DISTRIBUIDORA DE PECAS LTDA",
  "05341699": "CEARA DIESEL MECANICA GERAL LTDA",
  "33538090": "A SERTANEJA SERVICOS E DIST DE VEICULOS E PECAS LTDA",
  "32333594": "I R S DE SENA EIRELI",
  "59210696": "GCS SENA LTDA",
};

export function nomePorCnpj(cnpj: string | null | undefined, extra?: Record<string, string>): string | null {
  if (process.env.NF_SEM_DICIONARIO) return null; // só para testar a leitura pura do OCR
  const d = (cnpj ?? "").replace(/\D/g, "");
  if (d.length < 8) return null;
  const tabela = { ...FORNECEDORES, ...(extra ?? {}) };
  return tabela[d] ?? tabela[d.slice(0, 8)] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Categoria de compra por fornecedor (revenda x não revenda)                  */
/* -------------------------------------------------------------------------- */

export type CategoriaCompra = "padrao" | "produto";

/**
 * Raízes de CNPJ (8 dígitos) de fornecedores cujas notas são COMPRA PARA REVENDA
 * (carnes, frios etc.) -> categoria "padrao" (sem sufixo no nome do arquivo).
 */
export const FORNECEDORES_REVENDA = new Set<string>([
  "02916265", // JBS SA
  "05580630", // ICANE
  "08915713", // FRIGORIFICO VALENCIO
  "12727145", // GUARAVES
  "83044016", // SEARA
  "03636036", // ASA BRANCA
  "01838723", // BRF
]);

/**
 * Raízes de CNPJ de fornecedores cujas notas são compra que NÃO é de revenda
 * (peças, manutenção, uso e consumo...) -> categoria "produto" (sufixo PRODUTO).
 */
export const FORNECEDORES_NAO_REVENDA = new Set<string>([
  "54307872", // PRIMUS CENTRO AUTOMOTIVO
  "10175806", // A NORDESTINA DISTRIBUIDORA DE PECAS
  "05341699", // CEARA DIESEL MECANICA GERAL
  "33538090", // A SERTANEJA SERVICOS E DIST DE VEICULOS E PECAS
  "32333594", // I R S DE SENA
  "59210696", // GCS SENA
]);

/**
 * Categoria de compra conhecida para o CNPJ, ou null se for fornecedor novo.
 * Prioridade: o que o usuário já corrigiu na tela (extra) > listas acima.
 */
export function categoriaCompraPorCnpj(
  cnpj: string | null | undefined,
  extra?: Record<string, CategoriaCompra>
): CategoriaCompra | null {
  const d = (cnpj ?? "").replace(/\D/g, "");
  if (d.length < 8) return null;
  const raiz = d.slice(0, 8);
  const aprendida = extra?.[raiz];
  if (aprendida === "padrao" || aprendida === "produto") return aprendida;
  if (process.env.NF_SEM_DICIONARIO) return null;
  if (FORNECEDORES_REVENDA.has(raiz)) return "padrao";
  if (FORNECEDORES_NAO_REVENDA.has(raiz)) return "produto";
  return null;
}
