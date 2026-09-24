import Link from "next/link";
import { CheckCircle2, AlertTriangle, FileText, Wrench } from "lucide-react";

const PASSOS = [
  { t: "Envie os PDFs", d: "Arraste vários de uma vez. Pode misturar NF-e, NFS-e, notas giradas e PDFs com boletos junto." },
  { t: "Confira a tabela", d: "Cada linha vem preenchida. Linhas com “conferir dados” pedem uma olhada antes de baixar." },
  { t: "Baixe o .zip", d: "Os PDFs originais saem já com o nome final. O lote fica registrado no Histórico." },
];

const TIPOS = [
  {
    icone: FileText,
    titulo: "NF-e (produto)",
    padrao: "DD-MM-AAAA - NF-e NNNNNNNNN - FORNECEDOR.pdf",
    texto: "DANFE com chave de acesso de 44 dígitos. O número vem do código de barras/chave, validado.",
  },
  {
    icone: Wrench,
    titulo: "NFS-e (serviço)",
    padrao: "DD-MM-AAAA - NFS-e NNNNNNN - PRESTADOR.pdf",
    texto: "Nota de serviço da prefeitura. O número vem do quadro “Nota:” e o nome, do bloco do prestador.",
  },
];

export default function AjudaPage() {
  return (
    <main className="px-4 py-10 sm:px-8 lg:px-16">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-xl font-semibold tracking-tight">Como funciona</h1>
        <p className="mt-1 text-sm text-ink/60">Guia rápido para tirar o melhor resultado do sistema.</p>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {PASSOS.map((p, i) => (
            <div key={p.t} className="rounded-2xl border border-ink/10 bg-white/60 p-4">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-clay text-xs font-semibold text-paper">
                {i + 1}
              </span>
              <p className="mt-3 text-sm font-semibold">{p.t}</p>
              <p className="mt-1 text-xs text-ink/60">{p.d}</p>
            </div>
          ))}
        </div>

        <h2 className="mb-2 mt-10 text-sm font-semibold">Tipos de nota reconhecidos</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {TIPOS.map(({ icone: Icone, titulo, padrao, texto }) => (
            <div key={titulo} className="rounded-2xl border border-ink/10 bg-white/60 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Icone size={16} className="text-clay" /> {titulo}
              </p>
              <p className="mt-2 break-words rounded-md bg-sand/60 px-2 py-1.5 font-mono text-[11px] text-ink/70">{padrao}</p>
              <p className="mt-2 text-xs text-ink/60">{texto}</p>
            </div>
          ))}
        </div>

        <h2 className="mb-2 mt-10 text-sm font-semibold">O que significam os avisos</h2>
        <div className="divide-y divide-ink/5 rounded-2xl border border-ink/10 bg-white/60">
          <div className="flex gap-3 p-4">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-moss" />
            <p className="text-xs text-ink/70">
              <b className="text-moss">pronto</b> — número validado, data confirmada e fornecedor conhecido. Pode baixar.
            </p>
          </div>
          <div className="flex gap-3 p-4">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-clayDark" />
            <p className="text-xs text-ink/70">
              <b className="text-clayDark">conferir dados</b> — algum campo não pôde ser confirmado (normalmente o nome
              de um fornecedor novo). Corrija na tela: o app memoriza para as próximas notas.
            </p>
          </div>
          <div className="flex gap-3 p-4">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
            <p className="text-xs text-ink/70">
              <b className="text-red-600">revisar campos</b> — faltou data, número ou fornecedor; preencha à mão.
            </p>
          </div>
        </div>

        <h2 className="mb-2 mt-10 text-sm font-semibold">Dicas para digitalizar</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-xs text-ink/70">
          <li>Use 200 dpi ou mais e mantenha a nota inteira na imagem — cabeçalho cortado reduz a confiança.</li>
          <li>Uma nota por PDF, com a DANFE na primeira página (boletos e comprovantes podem vir depois).</li>
          <li>Scan de lado não é problema: o sistema gira a página sozinho.</li>
          <li>
            Cadastre seus fornecedores em <Link href="/fornecedores" className="font-medium text-clayDark underline">Fornecedores</Link>{" "}
            para os nomes saírem sempre padronizados.
          </li>
        </ul>

        <p className="mt-10 rounded-xl border border-moss/20 bg-moss/5 px-4 py-3 text-xs text-ink/70">
          <b className="text-moss">Privacidade:</b> os PDFs são lidos só para extrair os dados e não ficam armazenados. Histórico e
          fornecedores ficam apenas no seu navegador.
        </p>
      </div>
    </main>
  );
}
