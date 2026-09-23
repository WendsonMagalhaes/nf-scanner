# Renomeador de Notas Fiscais (NF-e)

App Next.js para renomear PDFs de notas fiscais em lote, no padrão:

```
DD-MM-AAAA - NF-e NNNNNNNNN - FORNECEDOR.pdf
```

Exemplo: `15-09-2026 - NF-e 000161683 - FRIGORIFICO VALENCIO LTDA.pdf`

## Como rodar

```bash
npm install
npm run dev
```

Abra http://localhost:3000

## Como funciona

1. Você arrasta (ou seleciona) vários PDFs de uma vez.
2. Cada PDF é enviado para `/api/extract`, que lê o documento em duas etapas:
   - **Texto embutido** (PDFs digitais, `pdf-parse`): instantâneo.
   - **OCR** (PDFs escaneados, `pdfjs-dist` + `tesseract.js`, idioma português):
     lê a página 1 (DANFE) e, se faltar confirmação, as páginas seguintes
     (os boletos confirmam o fornecedor). Para assim que os dados estiverem
     confirmados — em geral 4 a 10 s por arquivo. Tudo roda via npm, não é
     preciso instalar nada no sistema, e funciona offline.
3. Os campos aparecem numa tabela **editável**. Linhas com o aviso
   **"conferir dados"** são aquelas em que não deu para confirmar tudo no
   PDF — revise antes de baixar (editar qualquer campo tira o aviso).
4. "Baixar arquivos renomeados (.zip)" monta o .zip no navegador com os
   PDFs originais já com o nome final.

## Como os dados são extraídos (`lib/extract.ts`)

| Campo | De onde vem |
| --- | --- |
| Nº da NF-e | **Chave de acesso** de 44 dígitos, validada (dígito verificador, CNPJ e modelo 55). Se a chave não for legível, cai para o "Nº 000.000.000" impresso e o nº do documento dos boletos. |
| Data | Dia: campos de emissão do DANFE (votação por campo: caixa "DATA DA EMISSÃO", canhoto, saída, protocolo). Mês/ano: da chave. Vencimentos são ignorados. |
| Fornecedor | Votação entre "RECEBEMOS DE …", nomes com LTDA/EIRELI/S.A. e o "Beneficiário Final" dos boletos (confirmado pelo CNPJ da chave). Destinatário, pagador, transportadora e o FIDC/factoring são descartados. |

Por que assim: em scans, o OCR erra dígitos e letras (ex.: o "15" minúsculo do
canhoto sair "18"). A chave de acesso tem dígito verificador, então um erro de
leitura é detectado em vez de virar um nome de arquivo errado.

Se os PDFs de um fornecedor específico sempre errarem, ajuste as funções
`acharData`, `acharNumeroNF` e `acharFornecedor` em `lib/extract.ts`.

## Ajustes e diagnóstico

- `NF_DEBUG=1 npm run dev` mostra no terminal cada passada de OCR e o que
  foi extraído nela.
- `OCR_WORKERS=4` (padrão 2) aumenta quantos PDFs são lidos por OCR ao mesmo
  tempo, se a máquina tiver CPU/memória de sobra.
- Limitações: assume **uma NF-e por PDF** (DANFE na primeira página); o OCR
  é pesado — em hospedagem serverless (ex.: Vercel) pode estourar tempo/memória,
  o ideal é rodar localmente ou em um servidor comum.

## Stack

- Next.js 14 (App Router) + Tailwind CSS
- pdf-parse (texto embutido, servidor)
- pdfjs-dist + @napi-rs/canvas (renderiza páginas escaneadas, servidor)
- tesseract.js + @tesseract.js-data/por (OCR em português, servidor)
- JSZip (montagem do .zip no navegador)
