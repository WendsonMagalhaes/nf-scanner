/**
 * Testa as gravações/leituras do banco usando um Postgres em memória (PGlite),
 * sem precisar do Neon:  npx tsx test/db.ts
 */
import { PGlite } from "@electric-sql/pglite";
import { usarExecutor } from "../lib/db";
import {
  dataParaIso, fornecedoresParaExtracao, inserirHistorico, limparHistorico, listarFornecedores,
  listarHistorico, removerFornecedor, removerHistorico, salvarFornecedor,
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

  // datas
  esperar("data válida", dataParaIso("15-09-2026"), "2026-09-15");
  esperar("data inexistente (31/02)", dataParaIso("31-02-2026"), null);
  esperar("data vazia", dataParaIso(""), null);

  // fornecedores
  esperar("começa vazio", await listarFornecedores(), []);
  await salvarFornecedor("08.915.713/0001-97", { nome: " frigorifico valencio ltda " });
  await salvarFornecedor("54307872000100", { categoria: "produto" });
  esperar("nome vira maiúsculo, raiz de 8 dígitos", await listarFornecedores(), [
    { cnpj: "08915713", nome: "FRIGORIFICO VALENCIO LTDA", categoria: null },
    { cnpj: "54307872", nome: null, categoria: "produto" },
  ]);
  await salvarFornecedor("08915713", { categoria: "padrao" }); // não pode apagar o nome
  await salvarFornecedor("54307872", { nome: "PRIMUS CENTRO AUTOMOTIVO LTDA" }); // não pode apagar a categoria
  esperar("atualização parcial preserva o outro campo", await fornecedoresParaExtracao(), {
    nomes: { "08915713": "FRIGORIFICO VALENCIO LTDA", "54307872": "PRIMUS CENTRO AUTOMOTIVO LTDA" },
    categorias: { "08915713": "padrao", "54307872": "produto" },
  });
  await salvarFornecedor("54307872", { categoria: null, nome: null });
  esperar("limpar os dois campos remove a linha", (await listarFornecedores()).map((f) => f.cnpj), ["08915713"]);
  esperar("CNPJ curto é ignorado", await salvarFornecedor("123", { nome: "X" }), false);
  await removerFornecedor("08915713");
  esperar("remover fornecedor", await listarFornecedores(), []);

  // histórico
  const chave = "25260908915713000197550010001616831123456786";
  const n = await inserirHistorico([
    { arquivoOriginal: "1725.pdf", nomeFinal: "15-09-2026 - NF-e 000161683 - FRIGORIFICO VALENCIO LTDA.pdf", tipo: "NFe",
      categoria: "padrao", data: "15-09-2026", numero: "000161683", fornecedor: "FRIGORIFICO VALENCIO LTDA",
      cnpj: "08.915.713/0001-97", chaveAcesso: chave },
    { quando: "2026-09-01T10:00:00.000Z", arquivoOriginal: "1716.pdf", nomeFinal: "14-09-2026 - NF-e 0000693 - PRIMUS - SERVIÇOS.pdf",
      tipo: "NFSe", categoria: "servico", data: "data-ruim", numero: "0000693", fornecedor: "PRIMUS CENTRO AUTOMOTIVO LTDA" },
  ]);
  esperar("inseriu 2 de uma vez", n, 2);
  const lista = await listarHistorico();
  esperar("2 registros", lista.length, 2);
  const nfe = lista.find((r) => r.tipo === "NFe")!;
  const nfse = lista.find((r) => r.tipo === "NFSe")!;
  esperar("data volta em dd-mm-aaaa", nfe.data, "15-09-2026");
  esperar("cnpj guardado só com dígitos", nfe.cnpj, "08915713000197");
  esperar("chave guardada", nfe.chaveAcesso, chave);
  esperar("data inválida vira vazio, sem derrubar a gravação", nfse.data, "");
  esperar("data/hora de origem preservada (importação)", nfse.quando, "2026-09-01T10:00:00Z");
  esperar("ordem: mais recente primeiro", lista[0].tipo, "NFe");
  esperar("lista vazia não insere", await inserirHistorico([]), 0);
  await removerHistorico(nfe.id);
  esperar("remover um", (await listarHistorico()).length, 1);
  await removerHistorico("1; DROP TABLE nf_historico");
  esperar("id malicioso é ignorado", (await listarHistorico()).length, 1);
  await limparHistorico();
  esperar("limpar tudo", (await listarHistorico()).length, 0);

  console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo");
  process.exit(falhas ? 1 : 0);
})();
