/**
 * Testa as gravações/leituras do banco usando um Postgres em memória (PGlite),
 * sem precisar do Neon:  npx tsx test/db.ts
 */
import { PGlite } from "@electric-sql/pglite";
import { usarExecutor } from "../lib/db";
import {
  correcoesDeFornecedor, criarUsuario, dataParaIso, fornecedoresParaExtracao, inserirHistorico,
  limparHistorico, listarFornecedores, listarHistorico, registrarCorrecoes, removerFornecedor,
  removerHistorico, resumoCorrecoes, salvarFornecedor, type Usuario,
} from "../lib/repo";
import { hashSenha } from "../lib/auth";

let falhas = 0;
function esperar(titulo: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "OK  " : "FAIL"} ${titulo}${ok ? "" : `\n     obtido:   ${JSON.stringify(obtido)}\n     esperado: ${JSON.stringify(esperado)}`}`);
}

(async () => {
  const pg = new PGlite();
  usarExecutor(async (text, params) => (await pg.query(text, params as any[])).rows as any[]);

  const ana: Usuario = await criarUsuario("ana@teste.com", "Ana", await hashSenha("senha-da-ana"));
  const bruno: Usuario = await criarUsuario("bruno@teste.com", "Bruno", await hashSenha("senha-do-bruno"));
  const A = ana.id;
  const B = bruno.id;

  // datas
  esperar("data válida", dataParaIso("15-09-2026"), "2026-09-15");
  esperar("data inexistente (31/02)", dataParaIso("31-02-2026"), null);
  esperar("data vazia", dataParaIso(""), null);

  // fornecedores
  esperar("começa vazio", await listarFornecedores(A), []);
  await salvarFornecedor(A, "08.915.713/0001-97", { nome: " frigorifico valencio ltda " });
  await salvarFornecedor(A, "54307872000100", { categoria: "produto" });
  esperar("nome vira maiúsculo, raiz de 8 dígitos", await listarFornecedores(A), [
    { cnpj: "08915713", nome: "FRIGORIFICO VALENCIO LTDA", categoria: null },
    { cnpj: "54307872", nome: null, categoria: "produto" },
  ]);
  await salvarFornecedor(A, "08915713", { categoria: "padrao" }); // não pode apagar o nome
  await salvarFornecedor(A, "54307872", { nome: "PRIMUS CENTRO AUTOMOTIVO LTDA" }); // não pode apagar a categoria
  esperar("atualização parcial preserva o outro campo", await fornecedoresParaExtracao(A), {
    nomes: { "08915713": "FRIGORIFICO VALENCIO LTDA", "54307872": "PRIMUS CENTRO AUTOMOTIVO LTDA" },
    categorias: { "08915713": "padrao", "54307872": "produto" },
  });
  await salvarFornecedor(A, "54307872", { categoria: null, nome: null });
  esperar("limpar os dois campos remove a linha", (await listarFornecedores(A)).map((f) => f.cnpj), ["08915713"]);
  esperar("CNPJ curto é ignorado", await salvarFornecedor(A, "123", { nome: "X" }), false);
  await removerFornecedor(A, "08915713");
  esperar("remover fornecedor", await listarFornecedores(A), []);

  // isolamento entre usuários
  await salvarFornecedor(B, "08915713", { nome: "VALENCIO DO BRUNO" });
  await salvarFornecedor(A, "08915713", { nome: "VALENCIO DA ANA" });
  esperar("mesmo CNPJ, nomes separados por usuário",
    [(await fornecedoresParaExtracao(A)).nomes["08915713"], (await fornecedoresParaExtracao(B)).nomes["08915713"]],
    ["VALENCIO DA ANA", "VALENCIO DO BRUNO"]);

  // histórico
  const chave = "25260908915713000197550010001616831123456786";
  const n = await inserirHistorico(A, [
    { arquivoOriginal: "1725.pdf", nomeFinal: "15-09-2026 - NF-e 000161683 - FRIGORIFICO VALENCIO LTDA.pdf", tipo: "NFe",
      categoria: "padrao", data: "15-09-2026", numero: "000161683", fornecedor: "FRIGORIFICO VALENCIO LTDA",
      cnpj: "08.915.713/0001-97", chaveAcesso: chave },
    { quando: "2026-09-01T10:00:00.000Z", arquivoOriginal: "1716.pdf", nomeFinal: "14-09-2026 - NF-e 0000693 - PRIMUS - SERVIÇOS.pdf",
      tipo: "NFSe", categoria: "servico", data: "data-ruim", numero: "0000693", fornecedor: "PRIMUS CENTRO AUTOMOTIVO LTDA" },
  ]);
  esperar("inseriu 2 de uma vez", n, 2);
  const lista = await listarHistorico(A);
  esperar("2 registros", lista.length, 2);
  const nfe = lista.find((r) => r.tipo === "NFe")!;
  const nfse = lista.find((r) => r.tipo === "NFSe")!;
  esperar("data volta em dd-mm-aaaa", nfe.data, "15-09-2026");
  esperar("cnpj guardado só com dígitos", nfe.cnpj, "08915713000197");
  esperar("chave guardada", nfe.chaveAcesso, chave);
  esperar("data inválida vira vazio, sem derrubar a gravação", nfse.data, "");
  esperar("data/hora de origem preservada (importação)", nfse.quando, "2026-09-01T10:00:00Z");
  esperar("ordem: mais recente primeiro", lista[0].tipo, "NFe");
  esperar("histórico de outro usuário fica vazio", await listarHistorico(B), []);
  esperar("lista vazia não insere", await inserirHistorico(A, []), 0);
  await removerHistorico(B, nfe.id);
  esperar("outro usuário não consegue apagar o registro da Ana", (await listarHistorico(A)).length, 2);
  await removerHistorico(A, nfe.id);
  esperar("remover um", (await listarHistorico(A)).length, 1);
  await removerHistorico(A, "1; DROP TABLE nf_historico");
  esperar("id malicioso é ignorado", (await listarHistorico(A)).length, 1);
  await limparHistorico(A);
  esperar("limpar tudo", (await listarHistorico(A)).length, 0);

  // correções (aprendizado)
  esperar("sem correções ainda", await correcoesDeFornecedor(A), {});
  const gravadas = await registrarCorrecoes(A, [
    { campo: "fornecedor", cnpj: "08915713000197", arquivo: "x.pdf", valorExtraido: "INPORTADORA JBS", valorCorrigido: "IMPORTADORA JBS" },
    { campo: "fornecedor", cnpj: null, arquivo: "y.pdf", valorExtraido: "inportadora jbs", valorCorrigido: "IMPORTADORA JBS" },
    { campo: "numero", arquivo: "z.pdf", valorExtraido: "000161683", valorCorrigido: "000161638" },
    { campo: "fornecedor", arquivo: "w.pdf", valorExtraido: "IGUAL", valorCorrigido: "IGUAL" }, // não mudou: ignora
    { campo: "bobagem" as any, valorExtraido: "a", valorCorrigido: "b" }, // campo inválido: ignora
  ]);
  esperar("grava só as correções reais", gravadas, 3);
  esperar("nome lido errado vira o certo (chave sem acento/caixa)", await correcoesDeFornecedor(A), {
    "INPORTADORA JBS": "IMPORTADORA JBS",
  });
  esperar("correções de outro usuário não vazam", await correcoesDeFornecedor(B), {});
  const resumo = await resumoCorrecoes(A);
  esperar("resumo conta as correções", resumo.total, 3);

  console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo");
  process.exit(falhas ? 1 : 0);
})();
