"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, UserPlus, Sparkles, ShieldCheck, Zap, FolderOpen, Eye, EyeOff } from "lucide-react";
import { mostrarErro } from "@/lib/notificar";

/** Para onde voltar depois do login (só caminhos internos, sem redirecionar para outro site). */
function destinoPosLogin(): string {
  const p = new URLSearchParams(window.location.search).get("next");
  return p && p.startsWith("/") && !p.startsWith("//") ? p : "/";
}

const campo =
  "w-full rounded-xl border border-[#0d3322]/15 bg-white px-4 py-3 text-sm text-[#171512] placeholder:text-ink/30 transition focus:border-[#f58a1f] focus:outline-none focus:ring-4 focus:ring-[#f58a1f]/20";

const DESTAQUES = [
  { icone: Zap, texto: "Renomeia dezenas de notas em um clique" },
  { icone: FolderOpen, texto: "Baixe uma nota, um .zip ou tudo solto" },
  { icone: Sparkles, texto: "Aprende com as suas correções e com o histórico" },
  { icone: ShieldCheck, texto: "Cada conta com seu histórico e seus fornecedores" },
];

export default function EntrarPage() {
  const router = useRouter();
  const [verificando, setVerificando] = useState(true);
  const [modo, setModo] = useState<"entrar" | "cadastrar">("entrar");
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const setErro = mostrarErro;
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setCadastroAberto(!!j.cadastroAberto);
        if (j.usuario) router.replace(destinoPosLogin());
        else setVerificando(false);
      })
      .catch(() => setVerificando(false));
  }, [router]);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const res = await fetch(modo === "entrar" ? "/api/auth/login" : "/api/auth/cadastro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modo === "entrar" ? { email, senha } : { nome, email, senha }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(j.error ?? "Não foi possível entrar");
        return;
      }
      router.replace(destinoPosLogin());
      router.refresh();
    } catch {
      setErro("Sem conexão com o servidor");
    } finally {
      setEnviando(false);
    }
  }

  if (verificando) {
    return (
      <main className="flex min-h-screen flex-1 items-center justify-center bg-[#0d3322]">
        <Loader2 size={26} className="animate-spin text-[#f58a1f]" />
      </main>
    );
  }

  const cadastrando = modo === "cadastrar" && cadastroAberto;

  return (
    <main className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden bg-gradient-to-br from-[#0d3322] via-[#14472f] to-[#0a2619] px-4 py-12">
      {/* Brilhos decorativos */}
      <div className="pointer-events-none absolute -bottom-48 -right-32 h-[30rem] w-[30rem] rounded-full bg-[#3f8a60]/30 blur-3xl" />
      {/* Órbitas da marca: linhas laranja em camadas, como o anel do logo */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" fill="none">
        <defs>
          <linearGradient id="orbita" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#f58a1f" stopOpacity="0" />
            <stop offset="0.45" stopColor="#f58a1f" stopOpacity="0.9" />
            <stop offset="1" stopColor="#ffb347" stopOpacity="0" />
          </linearGradient>
        </defs>
        <ellipse cx="800" cy="450" rx="760" ry="250" stroke="url(#orbita)" strokeWidth="16" opacity="0.55" transform="rotate(-14 800 450)" />
        <ellipse cx="800" cy="450" rx="700" ry="215" stroke="url(#orbita)" strokeWidth="4" opacity="0.6" transform="rotate(-14 800 450)" />
        <ellipse cx="800" cy="450" rx="840" ry="300" stroke="#f58a1f" strokeWidth="1.5" strokeDasharray="6 14" opacity="0.35" transform="rotate(-10 800 450)" />
        <ellipse cx="800" cy="450" rx="620" ry="180" stroke="#ffb347" strokeWidth="2" opacity="0.3" transform="rotate(-22 800 450)" />
        <ellipse cx="800" cy="450" rx="900" ry="360" stroke="#f58a1f" strokeWidth="10" opacity="0.12" transform="rotate(-6 800 450)" />
      </svg>

      <div className="relative grid w-full max-w-6xl items-center gap-12 lg:grid-cols-2">
        {/* Apresentação */}
        <div className="text-center lg:text-left">
          {/* Logo sem caixa: o contorno branco é feito pelo filtro, seguindo o formato da arte */}
          <img
            src="/logo.png"
            alt="NF Scanner"
            className="logo-contorno mx-auto w-full max-w-sm lg:mx-0 lg:max-w-md"
          />
          <h1 className="mt-10 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
            Suas notas fiscais <span className="bg-gradient-to-r from-[#ffb347] to-[#f58a1f] bg-clip-text text-transparent">prontas</span> em segundos.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-base text-white/70 lg:mx-0">
            Arraste os PDFs, confira os dados e baixe tudo renomeado no padrão da empresa.
          </p>
          <ul className="mx-auto mt-8 grid max-w-md gap-3 text-left lg:mx-0">
            {DESTAQUES.map(({ icone: Icone, texto }) => (
              <li key={texto} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/85 backdrop-blur-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f58a1f]/20 text-[#ffb347]">
                  <Icone size={16} />
                </span>
                {texto}
              </li>
            ))}
          </ul>
          <p className="mt-8 font-mono text-xs tracking-[0.25em] text-white/50">RENOMEIE • ORGANIZE • ACESSE</p>
        </div>

        {/* Cartão de acesso */}
        <div className="mx-auto w-full max-w-md">
          <div className="rounded-3xl bg-white p-8 shadow-2xl shadow-black/40 sm:p-10">
            <div className="mb-7">
              <h2 className="text-2xl font-extrabold tracking-tight text-[#0d3322]">
                {cadastrando ? "Criar sua conta" : "Bem-vindo de volta"}
              </h2>
              <p className="mt-1 text-sm text-ink/55">
                {cadastrando ? "Leva menos de um minuto." : "Entre para acessar suas notas."}
              </p>
            </div>

            <form onSubmit={enviar} className="space-y-4">
              {cadastrando && (
                <label className="block text-xs font-semibold uppercase tracking-wide text-[#0d3322]/70">
                  Nome
                  <input className={`${campo} mt-1.5 normal-case tracking-normal`} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" required />
                </label>
              )}
              <label className="block text-xs font-semibold uppercase tracking-wide text-[#0d3322]/70">
                E-mail
                <input type="email" className={`${campo} mt-1.5 normal-case tracking-normal`} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-[#0d3322]/70">
                Senha
                <div className="relative mt-1.5">
                  <input
                    type={mostrarSenha ? "text" : "password"}
                    className={`${campo} normal-case tracking-normal pr-12`}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    autoComplete={cadastrando ? "new-password" : "current-password"}
                    minLength={cadastrando ? 8 : undefined}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarSenha((v) => !v)}
                    className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#0d3322]/50 transition hover:text-[#f58a1f]"
                    aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                    title={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {cadastrando && <span className="mt-1.5 block text-[0.6875rem] normal-case tracking-normal text-ink/45">Mínimo de 8 caracteres.</span>}
              </label>

              <button
                type="submit"
                disabled={enviando}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#f58a1f] to-[#e06d0c] px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#f58a1f]/30 transition hover:-translate-y-0.5 hover:shadow-xl disabled:translate-y-0 disabled:opacity-50"
              >
                {enviando ? <Loader2 size={17} className="animate-spin" /> : cadastrando ? <UserPlus size={17} /> : <LogIn size={17} />}
                {cadastrando ? "Criar conta e entrar" : "Entrar"}
              </button>
            </form>

            {cadastroAberto && (
              <p className="mt-6 text-center text-sm text-ink/60">
                {modo === "entrar" ? (
                  <button type="button" onClick={() => { setModo("cadastrar"); setErro(""); }} className="font-semibold text-[#0d3322] hover:text-[#f58a1f]">
                    Não tenho conta: criar uma
                  </button>
                ) : (
                  <button type="button" onClick={() => { setModo("entrar"); setErro(""); }} className="font-semibold text-[#0d3322] hover:text-[#f58a1f]">
                    Já tenho conta: entrar
                  </button>
                )}
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
