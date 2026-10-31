/**
 * Estrutura do banco (Postgres/Neon). O app cria/atualiza as tabelas sozinho na
 * primeira vez que acessa o banco (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS, então
 * é seguro rodar de novo). Funciona tanto numa instalação nova quanto sobre a
 * versão anterior (sem contas): os dados antigos ganham dono no primeiro cadastro.
 *
 * Prefixo "nf_" nas tabelas: dá para usar um banco compartilhado com outros sistemas.
 */
export const SCHEMA_SQL: string[] = [
  // Contas de acesso. A senha é guardada só como hash (PBKDF2).
  `CREATE TABLE IF NOT EXISTS nf_usuarios (
    id          BIGSERIAL   PRIMARY KEY,
    email       TEXT        NOT NULL UNIQUE,
    nome        TEXT        NOT NULL,
    senha_hash  TEXT        NOT NULL,
    papel       TEXT        NOT NULL DEFAULT 'usuario' CHECK (papel IN ('admin', 'usuario')),
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  // bancos criados antes do controle de acesso: a coluna é adicionada e o primeiro usuário vira admin
  `ALTER TABLE nf_usuarios ADD COLUMN IF NOT EXISTS papel TEXT NOT NULL DEFAULT 'usuario' CHECK (papel IN ('admin', 'usuario'))`,
  `UPDATE nf_usuarios SET papel = 'admin'
    WHERE id = (SELECT min(id) FROM nf_usuarios)
      AND NOT EXISTS (SELECT 1 FROM nf_usuarios WHERE papel = 'admin')`,

  // Fornecedores que o usuário definiu/corrigiu: nome no arquivo e/ou categoria.
  // Chave = raiz do CNPJ (8 dígitos) + dono. Versões antigas tinham cnpj_raiz como
  // chave única global; o DROP abaixo remove essa restrição.
  `CREATE TABLE IF NOT EXISTS nf_fornecedores (
    cnpj_raiz     CHAR(8)     NOT NULL,
    usuario_id    BIGINT      REFERENCES nf_usuarios(id) ON DELETE CASCADE,
    nome          TEXT,
    categoria     TEXT        CHECK (categoria IN ('padrao', 'produto')),
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE nf_fornecedores ADD COLUMN IF NOT EXISTS usuario_id BIGINT REFERENCES nf_usuarios(id) ON DELETE CASCADE`,
  `ALTER TABLE nf_fornecedores DROP CONSTRAINT IF EXISTS nf_fornecedores_pkey`,
  `CREATE UNIQUE INDEX IF NOT EXISTS nf_fornecedores_usuario_cnpj_idx ON nf_fornecedores (usuario_id, cnpj_raiz)`,

  // Uma linha por nota baixada renomeada (por usuário).
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
    chave_acesso     CHAR(44),
    usuario_id       BIGINT      REFERENCES nf_usuarios(id) ON DELETE CASCADE
  )`,
  `ALTER TABLE nf_historico ADD COLUMN IF NOT EXISTS usuario_id BIGINT REFERENCES nf_usuarios(id) ON DELETE CASCADE`,
  `CREATE INDEX IF NOT EXISTS nf_historico_usuario_idx ON nf_historico (usuario_id, gerado_em DESC)`,
  `CREATE INDEX IF NOT EXISTS nf_historico_chave_idx ON nf_historico (chave_acesso)`,
  `CREATE INDEX IF NOT EXISTS nf_historico_cnpj_idx ON nf_historico (cnpj)`,

  // Log das correções feitas na tela (o "aprendizado"): cada linha é um campo que
  // o sistema leu errado e o usuário corrigiu. É a base para as próximas leituras
  // e, no futuro, para treinar melhorias de extração.
  `CREATE TABLE IF NOT EXISTS nf_correcoes (
    id              BIGSERIAL   PRIMARY KEY,
    usuario_id      BIGINT      NOT NULL REFERENCES nf_usuarios(id) ON DELETE CASCADE,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
    campo           TEXT        NOT NULL CHECK (campo IN ('fornecedor', 'categoria', 'data', 'numero', 'tipo')),
    cnpj_raiz       CHAR(8),
    arquivo         TEXT,
    valor_extraido  TEXT,
    valor_corrigido TEXT        NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS nf_correcoes_usuario_idx ON nf_correcoes (usuario_id, campo, criado_em DESC)`,
];
