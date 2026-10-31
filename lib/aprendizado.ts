/**
 * Aprendizado a partir das correções do usuário (funções puras: servidor e tela).
 *
 * Toda vez que o usuário corrige um campo extraído do PDF (ex.: o OCR leu
 * "INPORTADORA" e ele mudou para "IMPORTADORA"), a correção é guardada. Na
 * próxima nota em que o mesmo valor aparecer, a correção é aplicada sozinha.
 */

/** Chave de comparação: sem acento, maiúsculas, espaços normalizados. */
export function chaveNome(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Troca o nome extraído pelo que o usuário já corrigiu antes, se houver. */
export function aplicarNomeAprendido(
  nome: string | null | undefined,
  mapa: Record<string, string>
): { nome: string; aprendido: boolean } {
  if (!nome) return { nome: nome ?? "", aprendido: false };
  const certo = mapa[chaveNome(nome)];
  if (certo && certo !== nome) return { nome: certo, aprendido: true };
  return { nome, aprendido: false };
}
