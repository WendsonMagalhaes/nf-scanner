"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Pencil, Trash2, X, ShieldAlert, Save } from "lucide-react";
import { mostrarAviso, mostrarErro, type Aviso } from "@/lib/notificar";

type Papel = "admin" | "usuario";
type Usuario = { id: string; nome: string; email: string; papel: Papel; criadoEm?: string };

const campo =
  "w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2.5 text-sm focus:border-clay focus:outline-none focus:ring-4 focus:ring-clay/15";
const rotulo = "block text-xs font-semibold uppercase tracking-wide text-ink/50";

const dataBr = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

export default function AdminUsuariosPage() {
  const router = useRouter();
  const [eu, setEu] = useState<Usuario | null>(null);
  const [lista, setLista] = useState<Usuario[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [proibido, setProibido] = useState(false);
  const [editando, setEditando] = useState<Usuario | "novo" | null>(null);
  const setAviso = mostrarAviso;

  async function carregar() {
    const res = await fetch("/api/admin/usuarios", { cache: "no-store" });
    if (res.status === 401) return router.replace("/entrar?next=/admin/usuarios");
    if (res.status === 403) {
      setProibido(true);
    } else {
      const j = await res.json();
      setLista(j.usuarios ?? []);
    }
    setCarregando(false);
  }

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json()).then((j) => setEu(j.usuario ?? null));
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function excluir(u: Usuario) {
    if (!window.confirm(`Excluir ${u.nome} (${u.email})?\n\nO histórico, os fornecedores e as correções dessa conta também serão apagados. Não tem volta.`)) return;
    const res = await fetch(`/api/admin/usuarios/${u.id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setAviso({ tipo: "erro", texto: j.error ?? "Não consegui excluir" });
    setAviso({ tipo: "ok", texto: `${u.nome} foi excluído.` });
    carregar();
  }

  if (carregando) {
    return <main className="flex justify-center py-24"><Loader2 size={22} className="animate-spin text-ink/40" /></main>;
  }

  if (proibido) {
    return (
      <main className="flex justify-center px-4 py-24">
        <div className="max-w-md rounded-2xl border border-ink/10 bg-white p-8 text-center shadow-sm">
          <ShieldAlert size={36} className="mx-auto text-clayDark" />
          <h1 className="mt-4 text-lg font-bold text-[#0d3322]">Acesso restrito</h1>
          <p className="mt-2 text-sm text-ink/60">Esta área é só para administradores.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="px-4 py-10 sm:px-8 lg:px-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#0d3322]">Usuários</h1>
            <p className="mt-1 text-sm text-ink/55">{lista.length} conta{lista.length === 1 ? "" : "s"} cadastrada{lista.length === 1 ? "" : "s"}</p>
          </div>
          <button
            onClick={() => setEditando("novo")}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#f58a1f] to-[#e06d0c] px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-[#f58a1f]/25 transition hover:-translate-y-0.5"
          >
            <Plus size={16} /> Novo usuário
          </button>
        </div>


        <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white/80 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-[#0d3322]/[0.03] text-left text-xs uppercase tracking-wide text-ink/50">
                <th className="px-5 py-3 font-semibold">Nome</th>
                <th className="px-5 py-3 font-semibold">E-mail</th>
                <th className="px-5 py-3 font-semibold">Permissão</th>
                <th className="px-5 py-3 font-semibold">Criado em</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {lista.map((u) => {
                const voce = eu?.id === u.id;
                return (
                  <tr key={u.id} className="border-b border-ink/5 last:border-0 hover:bg-[#f58a1f]/[0.04]">
                    <td className="px-5 py-3.5 font-medium text-[#0d3322]">
                      {u.nome} {voce && <span className="ml-1 rounded bg-[#0d3322]/10 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase text-[#0d3322]/70">você</span>}
                    </td>
                    <td className="px-5 py-3.5 text-ink/65">{u.email}</td>
                    <td className="px-5 py-3.5">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${u.papel === "admin" ? "bg-[#f58a1f]/15 text-[#b85c0a]" : "bg-ink/5 text-ink/60"}`}>
                        {u.papel === "admin" ? "Administrador" : "Usuário"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-ink/55">{dataBr(u.criadoEm)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setEditando(u)} className="inline-flex items-center gap-1 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-xs font-medium text-ink/70 hover:border-clay hover:text-clayDark">
                          <Pencil size={13} /> Editar
                        </button>
                        <button
                          onClick={() => excluir(u)}
                          disabled={voce}
                          title={voce ? "Você não pode excluir a própria conta" : "Excluir"}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Trash2 size={13} /> Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-ink/45">Administradores podem tudo que um usuário faz e também gerenciar contas. O sistema sempre mantém pelo menos um administrador.</p>
      </div>

      {editando && (
        <FormUsuario
          inicial={editando === "novo" ? null : editando}
          onFechar={() => setEditando(null)}
          onSalvo={(texto) => {
            setEditando(null);
            setAviso({ tipo: "ok", texto });
            carregar();
          }}
        />
      )}
    </main>
  );
}

function FormUsuario({
  inicial,
  onFechar,
  onSalvo,
}: {
  inicial: Usuario | null;
  onFechar: () => void;
  onSalvo: (texto: string) => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [email, setEmail] = useState(inicial?.email ?? "");
  const [papel, setPapel] = useState<Papel>(inicial?.papel ?? "usuario");
  const [senha, setSenha] = useState("");
  const setErro = mostrarErro;
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      if (inicial) {
        const corpo: Record<string, unknown> = { nome, email, papel };
        if (senha) corpo.novaSenha = senha;
        const res = await fetch(`/api/admin/usuarios/${inicial.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) return setErro(j.error ?? "Não consegui salvar");
        onSalvo(`${nome} atualizado${senha ? " (senha redefinida)" : ""}.`);
      } else {
        const res = await fetch("/api/admin/usuarios", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome, email, senha, papel }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) return setErro(j.error ?? "Não consegui cadastrar");
        onSalvo(`${nome} cadastrado. Envie a senha para ele por um canal seguro.`);
      }
    } catch {
      setErro("Sem conexão com o servidor");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d3322]/50 px-4 backdrop-blur-sm">
      <form onSubmit={enviar} className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#0d3322]">{inicial ? "Editar usuário" : "Novo usuário"}</h2>
          <button type="button" onClick={onFechar} className="text-ink/40 hover:text-ink"><X size={20} /></button>
        </div>

        <div className="space-y-4">
          <label className={rotulo}>
            Nome
            <input className={`${campo} mt-1.5 normal-case tracking-normal`} value={nome} onChange={(e) => setNome(e.target.value)} required />
          </label>
          <label className={rotulo}>
            E-mail
            <input type="email" className={`${campo} mt-1.5 normal-case tracking-normal`} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className={rotulo}>
            Permissão
            <select className={`${campo} mt-1.5 normal-case tracking-normal`} value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
              <option value="usuario">Usuário: renomeia e gerencia as próprias notas</option>
              <option value="admin">Administrador: também gerencia usuários</option>
            </select>
          </label>
          <label className={rotulo}>
            {inicial ? "Redefinir senha (opcional)" : "Senha inicial"}
            <input
              type="password"
              minLength={8}
              required={!inicial}
              className={`${campo} mt-1.5 normal-case tracking-normal`}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="new-password"
              placeholder={inicial ? "Deixe em branco para manter" : "Mínimo de 8 caracteres"}
            />
          </label>
        </div>

        <div className="mt-7 flex justify-end gap-3">
          <button type="button" onClick={onFechar} className="rounded-xl border border-ink/15 px-4 py-2.5 text-sm font-medium text-ink/70 hover:bg-ink/5">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0d3322] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#14472f] disabled:opacity-50"
          >
            {enviando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} {inicial ? "Salvar" : "Cadastrar"}
          </button>
        </div>
      </form>
    </div>
  );
}
