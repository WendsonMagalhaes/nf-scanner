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
