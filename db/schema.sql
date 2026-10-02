-- NF Scanner: tabelas no Postgres/Neon. O app já cria isto sozinho; use só se preferir rodar à mão.

CREATE TABLE IF NOT EXISTS nf_fornecedores (
    cnpj_raiz     CHAR(8)     PRIMARY KEY,
    nome          TEXT,
    categoria     TEXT        CHECK (categoria IN ('padrao', 'produto')),
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
  );

CREATE TABLE IF NOT EXISTS nf_historico (
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
  );

CREATE INDEX IF NOT EXISTS nf_historico_gerado_em_idx ON nf_historico (gerado_em DESC);

CREATE INDEX IF NOT EXISTS nf_historico_chave_idx ON nf_historico (chave_acesso);

CREATE INDEX IF NOT EXISTS nf_historico_cnpj_idx ON nf_historico (cnpj);
