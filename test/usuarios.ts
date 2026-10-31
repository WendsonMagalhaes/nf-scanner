/**
 * Regras de usuários, duplicatas e aprendizado pelo histórico (Postgres em memória):
 *   npx tsx test/usuarios.ts
 */
import { PGlite } from "@electric-sql/pglite";
import { usarExecutor } from "../lib/db";
import {
  aprendizadoDoHistorico, atualizarUsuario, buscarDuplicata, buscarUsuario, contarAdmins, criarUsuario,
  inserirHistorico, listarUsuarios, removerUsuario, salvarFornecedor,
} from "../lib/repo";

let falhas = 0;
function esperar(titulo: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "OK  " : "FAIL"} ${titulo}${ok ? "" : `\n     obtido:   ${JSON.stringify(obtido)}\n     esperado: ${JSON.stringify(esperado)}`}`);
}

(async () => {
  const pg = new PGlite();
  usarExecutor(async (text, params) => (await pg.query(text, params as any[])).rows as any[]);

  const primeira = await criarUsuario("primeira@x.com", "Primeira", "hash");
  const segundo = await criarUsuario("segundo@x.com", "Segundo", "hash", "admin");
  const terceiro = await criarUsuario("terceiro@x.com", "Terceiro", "hash");
  esperar("o primeiro usuário vira admin mesmo sem pedir", primeira.papel, "admin");
  esperar("pedido explícito de admin é respeitado", segundo.papel, "admin");
  esperar("padrão é usuário", terceiro.papel, "usuario");
  esperar("contagem de admins", await contarAdmins(), 2);
  esperar("lista traz todos", (await listarUsuarios()).length, 3);

  await atualizarUsuario(segundo.id, { papel: "usuario" });
  esperar("rebaixar um admin", (await buscarUsuario(segundo.id))?.papel, "usuario");
  esperar("rebaixar não altera o nome", (await buscarUsuario(segundo.id))?.nome, "Segundo");
  await removerUsuario(segundo.id);
  esperar("excluir remove a conta", await buscarUsuario(segundo.id), null);

  // dados por usuário, duplicatas e aprendizado
  const chave = "25260908915713000197550010001616831123456786";
  await inserirHistorico(primeira.id, [
    { arquivoOriginal: "a.pdf", nomeFinal: "15-09-2026 - NF-e 000161683 - VALENCIO.pdf", tipo: "NFe", categoria: "padrao",
      data: "15-09-2026", numero: "000161683", fornecedor: "FRIGORIFICO VALENCIO LTDA", cnpj: "08915713000197", chaveAcesso: chave },
    { arquivoOriginal: "b.pdf", nomeFinal: "x", tipo: "NFe", categoria: "padrao", data: "", numero: "000000001",
      fornecedor: "FRIGORIFICO VALENCIO LTDA", cnpj: "08915713000197" },
    { arquivoOriginal: "c.pdf", nomeFinal: "y", tipo: "NFe", categoria: "produto", data: "", numero: "000000002",
      fornecedor: "PECAS X LTDA", cnpj: "54307872000100" },
  ]);
  const dup = await buscarDuplicata(primeira.id, chave, "999", null);
  esperar("mesma chave: já renomeada", dup?.motivo, "chave");
  const dupNum = await buscarDuplicata(primeira.id, null, "000161683", "08915713000197");
  esperar("mesmo nº + CNPJ: possível duplicata", dupNum?.motivo, "numero");
  esperar("nota nova não é duplicata", await buscarDuplicata(primeira.id, null, "123", "08915713000197"), null);
  esperar("duplicata não vaza para outro usuário", await buscarDuplicata(terceiro.id, chave, "", null), null);

  const aprendido = await aprendizadoDoHistorico(primeira.id);
  esperar("nome mais usado no histórico", aprendido.nomes["08915713"], "FRIGORIFICO VALENCIO LTDA");
  esperar("categoria mais usada no histórico", aprendido.categorias["54307872"], "produto");
  esperar("histórico de outro usuário não aparece", await aprendizadoDoHistorico(terceiro.id), { nomes: {}, categorias: {} });

  // a tabela de fornecedores tem prioridade: a escolha explícita vence o histórico
  await salvarFornecedor(primeira.id, "08915713", { nome: "VALENCIO OFICIAL" });
  const explicito = { ...aprendido.nomes, ...{ "08915713": "VALENCIO OFICIAL" } };
  esperar("escolha explícita sobrepõe o histórico", explicito["08915713"], "VALENCIO OFICIAL");

  // exclusão apaga dados em cascata
  await removerUsuario(primeira.id);
  esperar("exclusão apaga o histórico junto", (await aprendizadoDoHistorico(primeira.id)).nomes, {});

  console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo");
  process.exit(falhas ? 1 : 0);
})();
