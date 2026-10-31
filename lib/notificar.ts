/**
 * Mensagens para o usuário em toast (Sonner). Ponto único para erros e avisos:
 * as telas chamam estas funções em vez de guardar a mensagem num estado.
 */
import { toast } from "sonner";

export type Aviso = { tipo: "ok" | "erro"; texto: string } | null;

/** Erro. Texto vazio não mostra nada (útil para "limpar" o aviso). */
export function mostrarErro(msg: string | null | undefined) {
  if (msg) toast.error(msg);
}

/** Sucesso ou erro, conforme o tipo. null não mostra nada. */
export function mostrarAviso(a: Aviso | undefined) {
  if (!a) return;
  if (a.tipo === "ok") toast.success(a.texto);
  else toast.error(a.texto);
}
