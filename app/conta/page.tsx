"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { mostrarAviso, type Aviso } from "@/lib/notificar";

type Usuario = { id: string; nome: string; email: string; papel: "admin" | "usuario"; criadoEm?: string };

const campo =
  "w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 text-sm focus:border-clay focus:outline-none focus:ring-4 focus:ring-clay/15";
const rotulo = "block text-xs font-semibold uppercase tracking-wide text-ink/50";

export default function ContaPage() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);
  const setAvisoPerfil = mostrarAviso;

  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const setAvisoSenha = mostrarAviso;

  useEffect(() => {
    fetch("/api/conta", { cache: "no-store" }).then(async (r) => {
      if (r.status === 401) return router.replace("/entrar?next=/conta");
      const j = await r.json();
      setUsuario(j.usuario);
      setNome(j.usuario?.nome ?? "");
      setEmail(j.usuario?.email ?? "");
    });
  }, [router]);

  async function salvarPerfil(e: FormEvent) {
    e.preventDefault();
    setAvisoPerfil(null);
    setSalvandoPerfil(true);
    try {
      const res = await fetch("/api/conta", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, email }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return setAvisoPerfil({ tipo: "erro", texto: j.error ?? "Não consegui salvar" });
      setUsuario(j.usuario);
      setAvisoPerfil({ tipo: "ok", texto: "Perfil atualizado." });
    } catch {
      setAvisoPerfil({ tipo: "erro", texto: "Sem conexão com o servidor" });
    } finally {
      setSalvandoPerfil(false);
    }
  }

  async function trocarSenha(e: FormEvent) {
    e.preventDefault();
    setAvisoSenha(null);
    if (novaSenha !== confirmar) return setAvisoSenha({ tipo: "erro", texto: "A confirmação não bate com a nova senha" });
    setSalvandoSenha(true);
    try {
      const res = await fetch("/api/conta/senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senhaAtual, novaSenha }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return setAvisoSenha({ tipo: "erro", texto: j.error ?? "Não consegui trocar a senha" });
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmar("");
      setAvisoSenha({ tipo: "ok", texto: "Senha alterada com sucesso." });
    } catch {
      setAvisoSenha({ tipo: "erro", texto: "Sem conexão com o servidor" });
    } finally {
      setSalvandoSenha(false);
    }
  }

  if (!usuario) {
    return (
      <main className="flex justify-center py-24">
        <Loader2 size={22} className="animate-spin text-ink/40" />
      </main>
    );
  }

  return (
    <main className="px-4 py-10 sm:px-8 lg:px-16">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center gap-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f58a1f] to-[#e06d0c] text-lg font-bold text-white shadow-md shadow-[#f58a1f]/30">
            {usuario.nome.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")}
          </span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#0d3322]">Minha conta</h1>
            <p className="text-sm text-ink/55">
              {usuario.papel === "admin" ? "Administrador" : "Usuário"} · {usuario.email}
            </p>
          </div>
        </div>

        {/* Perfil */}
        <section className="mb-6 rounded-2xl border border-ink/10 bg-white/80 p-6 shadow-sm">
          <h2 className="mb-5 flex items-center gap-2 text-base font-bold text-[#0d3322]">
            <UserRound size={18} className="text-[#f58a1f]" /> Perfil
          </h2>
          <form onSubmit={salvarPerfil} className="grid gap-4 sm:grid-cols-2">
            <label className={rotulo}>
              Nome
              <input className={`${campo} mt-1.5 normal-case tracking-normal`} value={nome} onChange={(e) => setNome(e.target.value)} required />
            </label>
            <label className={rotulo}>
              E-mail
              <input type="email" className={`${campo} mt-1.5 normal-case tracking-normal`} value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
              <span className="inline-flex items-center gap-1.5 text-xs text-ink/50">
                <ShieldCheck size={14} /> Permissão: {usuario.papel === "admin" ? "administrador" : "usuário"} (definida por um administrador)
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={salvandoPerfil}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0d3322] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#14472f] disabled:opacity-50"
                >
                  {salvandoPerfil ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar perfil
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* Senha */}
        <section className="rounded-2xl border border-ink/10 bg-white/80 p-6 shadow-sm">
          <h2 className="mb-5 flex items-center gap-2 text-base font-bold text-[#0d3322]">
            <KeyRound size={18} className="text-[#f58a1f]" /> Trocar senha
          </h2>
          <form onSubmit={trocarSenha} className="grid gap-4 sm:grid-cols-3">
            <label className={rotulo}>
              Senha atual
              <input type="password" className={`${campo} mt-1.5 normal-case tracking-normal`} value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} autoComplete="current-password" required />
            </label>
            <label className={rotulo}>
              Nova senha
              <input type="password" minLength={8} className={`${campo} mt-1.5 normal-case tracking-normal`} value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} autoComplete="new-password" required />
            </label>
            <label className={rotulo}>
              Confirmar nova
              <input type="password" minLength={8} className={`${campo} mt-1.5 normal-case tracking-normal`} value={confirmar} onChange={(e) => setConfirmar(e.target.value)} autoComplete="new-password" required />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-3">
              <span className="text-xs text-ink/45">Mínimo de 8 caracteres.</span>
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={salvandoSenha}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0d3322] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#14472f] disabled:opacity-50"
                >
                  {salvandoSenha ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Alterar senha
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
