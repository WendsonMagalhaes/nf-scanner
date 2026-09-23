/**
 * Extração dos dados da NF-e a partir do TEXTO do PDF (nativo ou vindo de OCR).
 * Este arquivo não usa nada de Node — o page.tsx importa buildFilename daqui.
 *
 * Estratégia (do mais confiável para o menos):
 *  - Nº da NF, CNPJ do emitente e mês/ano  -> chave de acesso de 44 dígitos,
 *    validada pelo dígito verificador + CNPJ + modelo 55 (à prova de erro de OCR).
 *  - Dia da emissão -> datas perto de "DATA DE/DA EMISSÃO", no mês da chave.
 *  - Fornecedor -> votação entre "RECEBEMOS DE ...", nomes com LTDA/EIRELI/S.A.
 *    e o "Beneficiário Final" dos boletos (confirmado pelo CNPJ da chave),
 *    ignorando destinatário, pagador e transportadora.
 */

export type Confianca = "alta" | "baixa";

export interface ExtractedData {
  date: string | null; // dd-mm-aaaa
  nfNumber: string | null; // 9 dígitos
  supplier: string | null;
  supplierCnpj: string | null;
  chaveAcesso: string | null;
  /** "alta" = chave validada + fornecedor confirmado; "baixa" = conferir na tela. */
  confidence: Confianca;
  rawTextPreview: string;
}

/* -------------------------------------------------------------------------- */
/* Utilitários                                                                */
/* -------------------------------------------------------------------------- */

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        last + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      last = tmp;
    }
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/* Chave de acesso                                                            */
/* -------------------------------------------------------------------------- */

const UF_IBGE = new Set([
  11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 32, 33,
  35, 41, 42, 43, 50, 51, 52, 53,
]);

function cnpjValido(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1+$/.test(cnpj)) return false;
  const dv = (base: string) => {
    let w = base.length - 7;
    let sum = 0;
    for (const ch of base) {
      sum += Number(ch) * w--;
      if (w < 2) w = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(cnpj.slice(0, 12)) === Number(cnpj[12]) && dv(cnpj.slice(0, 13)) === Number(cnpj[13]);
}

function dvChave(c43: string): number {
  let sum = 0;
  let w = 2;
  for (let i = 42; i >= 0; i--) {
    sum += Number(c43[i]) * w;
    w = w === 9 ? 2 : w + 1;
  }
  const r = sum % 11;
  return r < 2 ? 0 : 11 - r;
}

/** cUF(2) AAMM(4) CNPJ(14) mod(2) série(3) nNF(9) tpEmis(1) cNF(8) cDV(1) */
export function chaveValida(k: string): boolean {
  if (!/^\d{44}$/.test(k)) return false;
  if (!UF_IBGE.has(Number(k.slice(0, 2)))) return false;
  const mm = Number(k.slice(4, 6));
  if (mm < 1 || mm > 12) return false;
  if (k.slice(20, 22) !== "55") return false; // NF-e
  if (!cnpjValido(k.slice(6, 20))) return false;
  return dvChave(k.slice(0, 43)) === Number(k[43]);
}

function acharChave(lines: string[]): string | null {
  const count = new Map<string, number>();
  const scan = (s: string) => {
    const d = s.replace(/\D/g, "");
    for (let i = 0; i + 44 <= d.length; i++) {
      const k = d.slice(i, i + 44);
      if (chaveValida(k)) count.set(k, (count.get(k) ?? 0) + 1);
    }
  };
  lines.forEach(scan);
  // a chave às vezes quebra em duas linhas
  for (let i = 0; i + 1 < lines.length; i++) scan(lines[i] + " " + lines[i + 1]);

  let best: string | null = null;
  let bestN = 0;
  for (const [k, n] of count) if (n > bestN) [best, bestN] = [k, n];
  return best;
}

function formatCnpj(c: string): string {
  return c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

/* -------------------------------------------------------------------------- */
/* Data de emissão                                                            */
/* -------------------------------------------------------------------------- */

// A data de emissão aparece em vários lugares da DANFE. Cada lugar é um "campo".
// Contamos cada campo UMA vez por dia candidato: passadas repetidas de OCR erram
// do mesmo jeito na mesma região, então repetir não é evidência independente.
type CampoData = "caixa" | "canhoto" | "saida" | "protocolo" | "outro";
const PESO_DATA: Record<CampoData, number> = {
  caixa: 3, // "DATA DA EMISSÃO" (fonte grande, mais confiável)
  canhoto: 1.5, // "DATA DE EMISSÃO:" no canhoto (fonte minúscula)
  saida: 1, // data de saída/entrada (quase sempre igual)
  protocolo: 1, // data do protocolo de autorização
  outro: 0.25, // qualquer outra data no mês da chave
};

function acharData(
  lines: string[],
  chave: string | null
): { date: string | null; confirmada: boolean } {
  const chaveAno = chave ? 2000 + Number(chave.slice(2, 4)) : null;
  const chaveMes = chave ? chave.slice(4, 6) : null;

  const campos = new Map<string, Set<CampoData>>();
  lines.forEach((line, i) => {
    const ctx = fold(line);
    const prev = i > 0 ? fold(lines[i - 1]) : "";

    for (const m of line.matchAll(/(?<!\d)(\d{2})[\/.\-](\d{2})[\/.\-](\d{4})(?!\d)/g)) {
      const [, dd, mm, yyyy] = m;
      if (Number(dd) < 1 || Number(dd) > 31 || Number(mm) < 1 || Number(mm) > 12) continue;
      if (chaveMes && mm !== chaveMes) continue; // só o mês da chave
      if (/VENC/.test(ctx)) continue; // vencimento não é emissão

      let campo: CampoData = "outro";
      const rotulo = /EMISS/.test(ctx) ? ctx : /EMISS/.test(prev) ? prev : null;
      if (rotulo) campo = /DATA\s+DA\s+EMISS/.test(rotulo) ? "caixa" : "canhoto";
      else if (/SAIDA|ENTRADA/.test(ctx) || /SAIDA|ENTRADA/.test(prev)) campo = "saida";
      else if (/PROTOCOLO|AUTORIZ/.test(ctx) || /PROTOCOLO|AUTORIZ/.test(prev)) campo = "protocolo";

      // com chave, mês/ano vêm dela e só o dia é votado; sem chave, vota a data toda
      const key = chave ? dd : `${dd}-${mm}-${yyyy}`;
      if (!campos.has(key)) campos.set(key, new Set());
      campos.get(key)!.add(campo);
    }
  });

  const ranking = [...campos.entries()]
    .map(([key, set]) => ({
      key,
      distintos: [...set].filter((c) => c !== "outro").length,
      pontos: [...set].reduce((sum, c) => sum + PESO_DATA[c], 0),
    }))
    .sort((a, b) => b.pontos - a.pontos);

  const top = ranking[0];
  if (!top || top.pontos < 1) return { date: null, confirmada: false };

  const segundo = ranking[1];
  // confirmada: pelo menos 2 campos distintos concordam e ninguém disputa de perto
  const confirmada = top.distintos >= 2 && (!segundo || segundo.pontos < top.pontos * 0.7);
  const date = chave ? `${top.key}-${chaveMes}-${chaveAno}` : top.key;
  return { date, confirmada };
}

/* -------------------------------------------------------------------------- */
/* Número da NF (quando não há chave válida)                                  */
/* -------------------------------------------------------------------------- */

function acharNumeroNF(lines: string[]): string | null {
  const votes = new Map<string, number>();
  const vote = (digits: string, w: number) => {
    if (digits.length < 3 || digits.length > 9) return;
    const k = digits.padStart(9, "0");
    votes.set(k, (votes.get(k) ?? 0) + w);
  };

  for (const line of lines) {
    // "Nº 000.161.683" (formato do DANFE)
    for (const m of line.matchAll(/(?<![\d.,])(\d{3}\.\d{3}\.\d{3})(?![\d]|[.,]\d)/g)) {
      vote(m[1].replace(/\D/g, ""), 2);
    }
    // boleto: "Número do documento 161683/1"
    const doc = fold(line).match(/(?:DOCUMENTO|NUMERO)\D{0,20}?(\d{4,9})\s*\/\s*\d/);
    if (doc) vote(doc[1], 1);
  }

  let best: string | null = null;
  let bestN = 0;
  for (const [k, n] of votes) if (n > bestN) [best, bestN] = [k, n];
  return best;
}

/* -------------------------------------------------------------------------- */
/* Fornecedor                                                                 */
/* -------------------------------------------------------------------------- */

type Fonte = "boleto" | "linha" | "canhoto";
const PESO_FONTE: Record<Fonte, number> = { boleto: 10, linha: 2, canhoto: 2 };
const PRIORIDADE_FONTE: Record<Fonte, number> = { boleto: 3, linha: 2, canhoto: 1 };

const SUFIXO = /^(LTDA\.?|EIRELI|EPP|MEI|S\/A|S\.A\.?|SA)$/;
const ROTULOS = /^.*\b(RECEBEMOS DE|RAZAO SOCIAL|EMITENTE|BENEFICIARIO FINAL|BENEFICIARIO|PAGADOR|CNPJ\/CPF|CNPJ)\s+/;

function limparNome(nome: string): string | null {
  let n = nome.replace(ROTULOS, "").trim();
  const tokens = n.split(" ");
  // tira lixo de OCR no começo (números soltos, letras isoladas, "DE" sobrando)
  while (tokens.length > 1 && (/^[\d.\-\/]+$/.test(tokens[0]) || tokens[0].length === 1 || tokens[0] === "DE")) {
    tokens.shift();
  }
  n = tokens.join(" ").replace(/^[^A-Z0-9]+|[\s\-–—|_:;,]+$/g, "").trim();
  if (n.length < 5 || /FIDC|MULTISSETORIAL/.test(n)) return null;
  if (tokens.length < 2) return null;
  return n;
}

/** Nomes que terminam em LTDA/EIRELI/S.A... numa linha (já em maiúsculas sem acento). */
function nomesComSufixo(linhaFold: string): Array<{ nome: string; fonte: Fonte }> {
  const prep = linhaFold.replace(/([A-Z]{3,})(LTDA|EIRELI)\b/g, "$1 $2");
  const tokens = prep.split(/\s+/);
  const out: Array<{ nome: string; fonte: Fonte }> = [];

  tokens.forEach((t, idx) => {
    if (!SUFIXO.test(t)) return;
    let start = idx;
    while (start > 0 && idx - (start - 1) <= 8 && /^[A-Z0-9&.'\/-]+$/.test(tokens[start - 1])) start--;
    const bruto = tokens.slice(start, idx + 1).join(" ");
    const nome = limparNome(bruto);
    if (nome) out.push({ nome, fonte: /RECEBEMOS\s+DE/.test(bruto) ? "canhoto" : "linha" });
  });
  return out;
}

interface Variante {
  nome: string;
  fontes: Set<Fonte>;
}

function acharFornecedor(
  lines: string[],
  cnpjEmitente: string | null
): { nome: string | null; confianca: Confianca } {
  const L = lines.map(fold);

  // 1) nomes que NÃO são o fornecedor: destinatário, pagador, transportadora
  const outros: string[] = [];
  const addOutros = (idxs: number[]) =>
    idxs.forEach((i) => {
      if (L[i]) nomesComSufixo(L[i]).forEach((c) => outros.push(c.nome));
    });
  L.forEach((l, i) => {
    const cnpjs = [...l.matchAll(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g)].map((m) => m[0].replace(/\D/g, ""));
    // Com a chave sabemos o CNPJ do emitente: qualquer outro CNPJ na linha é de terceiros.
    // Sem a chave, o destinatário é quem aparece na MESMA linha do próprio CNPJ
    // (o nome do emitente fica sozinho no cabeçalho). Linhas de boleto ficam de fora.
    if (!/BENEFICI/.test(l)) {
      if (cnpjEmitente ? cnpjs.some((c) => c !== cnpjEmitente) : cnpjs.length > 0) addOutros([i]);
    }
    if (/DESTINATARIO/.test(l)) addOutros([i + 1, i + 2]);
    if (/\bPAGADOR\b/.test(l)) addOutros([i, i + 1]);
    if (/TRANSPORTADOR/.test(l)) addOutros([i + 1, i + 2]);
  });
  const ehOutro = (nome: string) => outros.some((o) => similarity(o, nome) >= 0.75);

  // 2) candidatos
  const variantes = new Map<string, Variante>();
  const add = (nome: string, fonte: Fonte) => {
    if (ehOutro(nome)) return;
    const v = variantes.get(nome) ?? { nome, fontes: new Set<Fonte>() };
    v.fontes.add(fonte);
    variantes.set(nome, v);
  };
  let confirmado: string | null = null;

  L.forEach((l) => {
    // boleto: "Beneficiário Final <NOME> - CNPJ: 08.915.713/0001-97"
    const bf = l.match(/BENEFICI\w*\s+FINAL\s+(.+?)\s*[-–—]?\s*CNPJ\s*:?\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
    if (bf) {
      const nome = limparNome(bf[1]);
      const cnpj = bf[2].replace(/\D/g, "");
      if (nome && (!cnpjEmitente || cnpj === cnpjEmitente)) {
        add(nome, "boleto");
        if (cnpjEmitente && cnpj === cnpjEmitente) confirmado = nome;
      }
    }

    // canhoto: "RECEBEMOS DE <NOME> OS PRODUTOS/SERVIÇOS..." (vale mesmo sem LTDA)
    const rc = l.match(/RECEBEMOS\s+DE\s+(.{4,80}?)\s+(?:OS|05|0S)\s+PRODUTOS/);
    if (rc) {
      const nome = limparNome(rc[1]);
      if (nome) add(nome, "canhoto");
    }

    nomesComSufixo(l).forEach((c) => add(c.nome, c.fonte));
  });

  if (variantes.size === 0) return { nome: null, confianca: "baixa" };

  // 3) agrupa grafias parecidas (erro de OCR) e escolhe o grupo mais bem votado
  // - fragmentos de uma palavra só ("LEKCIO LTDA") valem metade: são típicos de linha cortada
  // - dentro de um grupo NÃO soma: passadas repetidas erram igual, não são evidência independente
  const palavras = (v: Variante) => v.nome.split(" ").filter((t) => !SUFIXO.test(t)).length;
  const pontos = (v: Variante) =>
    [...v.fontes].reduce((s, f) => s + PESO_FONTE[f], 0) * (palavras(v) >= 2 ? 1 : 0.5);
  const prio = (v: Variante) => Math.max(...[...v.fontes].map((f) => PRIORIDADE_FONTE[f]));
  const ordenadas = [...variantes.values()].sort(
    (a, b) => pontos(b) - pontos(a) || prio(b) - prio(a) || b.nome.length - a.nome.length
  );

  const grupos: Variante[][] = [];
  for (const v of ordenadas) {
    const g = grupos.find((g) => similarity(g[0].nome, v.nome) >= 0.8);
    if (g) g.push(v);
    else grupos.push([v]);
  }
  const total = (g: Variante[]) => pontos(g[0]) + 0.1 * g.slice(1).reduce((s, v) => s + pontos(v), 0);
  grupos.sort((a, b) => total(b) - total(a) || prio(b[0]) - prio(a[0]));
  const melhor = grupos[0][0];

  if (confirmado && grupos[0].some((v) => v.nome === confirmado)) {
    return { nome: confirmado, confianca: "alta" };
  }
  // sem boleto: só é "alta" se canhoto E cabeçalho concordam na mesma grafia
  const concorda = melhor.fontes.has("canhoto") && melhor.fontes.has("linha");
  return { nome: melhor.nome, confianca: concorda ? "alta" : "baixa" };
}

/* -------------------------------------------------------------------------- */
/* Heurísticas antigas (último recurso)                                       */
/* -------------------------------------------------------------------------- */

function legacyDate(text: string): string | null {
  const m = text.match(/(DATA\s*(DE|DA)?\s*EMISS[ÃA]O|EMISS[ÃA]O)[^\d]{0,20}(\d{2}\/\d{2}\/\d{4})/i);
  if (m) return m[3].replace(/\//g, "-");
  return null;
}

function legacySupplier(lines: string[]): string | null {
  const explicit = lines.join("\n").match(/(RAZ[ÃA]O SOCIAL|NOME EMPRESARIAL|EMITENTE)\s*[:\-]?\s*([A-ZÀ-Ÿ0-9][^\n]{3,80})/i);
  return explicit ? explicit[2].trim() : null;
}

/* -------------------------------------------------------------------------- */
/* API pública                                                                */
/* -------------------------------------------------------------------------- */

export function extractFromText(text: string): ExtractedData {
  const lines = toLines(text);
  const chave = acharChave(lines);

  const nfNumber = chave ? chave.slice(25, 34) : acharNumeroNF(lines);
  const data = acharData(lines, chave);
  const date = data.date ?? (chave ? null : legacyDate(text));
  const forn = acharFornecedor(lines, chave ? chave.slice(6, 20) : null);
  const supplier = forn.nome ?? legacySupplier(lines);

  const confidence: Confianca =
    chave && data.confirmada && nfNumber && forn.nome && forn.confianca === "alta" ? "alta" : "baixa";

  return {
    date,
    nfNumber,
    supplier,
    supplierCnpj: chave ? formatCnpj(chave.slice(6, 20)) : null,
    chaveAcesso: chave,
    confidence,
    rawTextPreview: lines.join("\n").slice(0, 400),
  };
}

export function sanitizeForFilename(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[\\/:*?"<>|]/g, "") // caracteres inválidos em nomes de arquivo
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "") // Windows não aceita ponto/espaço no fim do nome
    .trim();
}

export function buildFilename(
  date: string,
  nfNumber: string,
  supplier: string
): string {
  const d = sanitizeForFilename(date);
  const n = sanitizeForFilename(nfNumber);
  const s = sanitizeForFilename(supplier).toUpperCase();
  return `${d} - NF-e ${n} - ${s}.pdf`;
}
