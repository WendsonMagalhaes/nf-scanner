/**
 * Estrutura do banco (Postgres/Neon). O app cria as tabelas sozinho na primeira
 * vez que acessa o banco (IF NOT EXISTS, então é seguro rodar de novo).
 * O mesmo SQL está em db/schema.sql, caso prefira rodar à mão no console do Neon.
 *
 * Prefixo "nf_" nas tabelas: dá para usar um banco compartilhado com outros sistemas.
 */
export const SCHEMA_SQL: string[] = [
  // Fornecedores que VOCÊ definiu/corrigiu: nome no arquivo e/ou categoria da compra.
  // Chave = raiz do CNPJ (8 dígitos), vale para qualquer filial.
  `CREATE TABLE IF NOT EXISTS nf_fornecedores (
    cnpj_raiz     CHAR(8)     PRIMARY KEY,
    nome          TEXT,
    categoria     TEXT        CHECK (categoria IN ('padrao', 'produto')),
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  // Uma linha por nota baixada renomeada.
  `CREATE TABLE IF NOT EXISTS nf_historico (
    id               BIGSERIAL   PRIMARY KEY,
    gerado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
    arquivo_original TEXT        NOT NULL,
    nome_final       TEXT        NOT NULL,
    tipo             TEXT        NOT NULL CHECK (tipo IN ('NFe', 'NFSe')),
    categoria        TEXT,
    data_emissao     DATE,
    numero           TEXT        NOT NULL,
    fornecedor       TEXT        NOT NULL,
    cnpj             TEXT,
    chave_acesso     CHAR(44)
  )`,
  `CREATE INDEX IF NOT EXISTS nf_historico_gerado_em_idx ON nf_historico (gerado_em DESC)`,
  `CREATE INDEX IF NOT EXISTS nf_historico_chave_idx ON nf_historico (chave_acesso)`,
  `CREATE INDEX IF NOT EXISTS nf_historico_cnpj_idx ON nf_historico (cnpj)`,
];
