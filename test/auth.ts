/**
 * Testa senha, token de sessão e aprendizado de nomes (sem banco):  npx tsx test/auth.ts
 */
import { criarToken, hashSenha, lerToken, verificarSenha } from "../lib/auth";
import { aplicarNomeAprendido, chaveNome } from "../lib/aprendizado";

let falhas = 0;
function esperar(titulo: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "OK  " : "FAIL"} ${titulo}${ok ? "" : `\n     obtido:   ${JSON.stringify(obtido)}\n     esperado: ${JSON.stringify(esperado)}`}`);
}

(async () => {
  // senhas
  const h = await hashSenha("minha-senha-123");
  esperar("hash não guarda a senha em texto", h.includes("minha-senha"), false);
  esperar("senha certa confere", await verificarSenha("minha-senha-123", h), true);
  esperar("senha errada não confere", await verificarSenha("minha-senha-124", h), false);
  esperar("hash lixo não confere", await verificarSenha("x", "lixo"), false);
  esperar("dois hashes da mesma senha são diferentes (salt)", h === (await hashSenha("minha-senha-123")), false);

  // sessão
  const t = await criarToken("42");
  esperar("token válido devolve o id", await lerToken(t), "42");
  esperar("token adulterado é recusado", await lerToken(t.replace(/^42\./, "43.")), null);
  esperar("token sem assinatura é recusado", await lerToken("42.9999999999999.abc"), null);
  esperar("token vazio é recusado", await lerToken(undefined), null);
  esperar("token vencido é recusado", await lerToken(`42.${Date.now() - 1000}.${t.split(".")[2]}`), null);

  // aprendizado
  esperar("chave ignora acento, caixa e espaços", chaveNome("  Frigorífico   valêncio "), "FRIGORIFICO VALENCIO");
  const mapa = { "INPORTADORA JBS": "IMPORTADORA JBS" };
  esperar("nome aprendido é aplicado", aplicarNomeAprendido("inportadora  jbs", mapa), { nome: "IMPORTADORA JBS", aprendido: true });
  esperar("nome desconhecido passa intacto", aplicarNomeAprendido("OUTRA LTDA", mapa), { nome: "OUTRA LTDA", aprendido: false });
  esperar("sem nome não quebra", aplicarNomeAprendido(null, mapa), { nome: "", aprendido: false });

  console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo");
  process.exit(falhas ? 1 : 0);
})();
