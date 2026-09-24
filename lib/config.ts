/**
 * Configurações da SUA empresa (o destinatário das notas de entrada).
 * Serve para o sistema nunca confundir o seu nome/CNPJ com o do fornecedor.
 * Pode ser sobrescrito por variáveis de ambiente (.env.local).
 */
export const MEU_CNPJ = (process.env.MEU_CNPJ ?? "42.105.489/0001-06").replace(/\D/g, "");

/** Trechos de nome (sem acento, maiúsculos) que identificam a sua empresa. */
export const MEUS_NOMES = (process.env.MEUS_NOMES ?? "FRIOS ESPERANCA,FRIOS ESPERAN")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

/**
 * Nota emitida PELA sua empresa (venda): o "fornecedor" seria você mesmo.
 *  - "destinatario": usa o nome do cliente no nome do arquivo (padrão)
 *  - "emitente": mantém o nome da sua empresa
 */
export const NOME_NOTA_DE_SAIDA: "destinatario" | "emitente" =
  process.env.NOME_NOTA_DE_SAIDA === "emitente" ? "emitente" : "destinatario";
