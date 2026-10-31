"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { History, Building2, HelpCircle, Upload, LogOut, Menu, X, UserCog, Users, ChevronDown } from "lucide-react";

type UsuarioSessao = { id: string; nome: string; email: string; papel: "admin" | "usuario" };

const LINKS = [
  { href: "/", label: "Renomear", icon: Upload },
  { href: "/historico", label: "Histórico", icon: History },
  { href: "/fornecedores", label: "Fornecedores", icon: Building2 },
  { href: "/ajuda", label: "Ajuda", icon: HelpCircle },
];

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [usuario, setUsuario] = useState<UsuarioSessao | null>(null);
  const [menuAberto, setMenuAberto] = useState(false);
  const [perfilAberto, setPerfilAberto] = useState(false);

  useEffect(() => {
    if (pathname === "/entrar") return;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setUsuario(j.usuario ?? null))
      .catch(() => setUsuario(null));
  }, [pathname]);

  // fecha menus ao trocar de página
  useEffect(() => {
    setMenuAberto(false);
    setPerfilAberto(false);
  }, [pathname]);

  if (pathname === "/entrar") return null;

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/entrar");
    router.refresh();
  }

  const links =
    usuario?.papel === "admin"
      ? [...LINKS.slice(0, 3), { href: "/admin/usuarios", label: "Usuários", icon: Users }, LINKS[3]]
      : LINKS;

  const ativo = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-30 border-b-[3px] border-[#0d3322] bg-gradient-to-r from-[#d0734a] via-[#dc8a5f] to-[#e6a27c] text-white [text-shadow:0_1px_1px_rgba(90,40,15,0.25)] shadow-md shadow-[#a8542d]/20">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-8 lg:px-12">
        {/* Marca */}
        <Link href="/" className="flex shrink-0 items-center">
          <img src="/logo.png" alt="NF Scanner" className="logo-contorno logo-contorno-claro h-11 w-auto" />
        </Link>

        {/* Navegação (desktop) */}
        <nav className="hidden items-center gap-1 lg:flex">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={ativo(href) ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                ativo(href) ? "bg-[#0d3322] text-white shadow-sm" : "text-white/90 hover:bg-white/15 hover:text-white"
              }`}
            >
              <Icon size={15} />
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Perfil */}
          {usuario && (
            <div className="relative">
              <button
                onClick={() => setPerfilAberto((v) => !v)}
                className="flex items-center gap-2 rounded-full border border-[#a8542d]/20 bg-[#fbe2cf] py-1 pl-1 pr-2.5 shadow-sm transition-colors hover:bg-[#f9d6bb]"
                aria-expanded={perfilAberto}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0d3322] text-xs font-bold text-white">
                  {iniciais(usuario.nome) || "?"}
                </span>
                <span className="hidden text-left leading-tight md:block">
                  <span className="block max-w-[9rem] truncate text-xs font-semibold text-[#0d3322]">{usuario.nome}</span>
                  <span className="block text-[0.6rem] font-bold uppercase tracking-wide text-[#b4541f]">
                    {usuario.papel === "admin" ? "Administrador" : "Usuário"}
                  </span>
                </span>
                <ChevronDown size={14} className="text-[#0d3322]/50" />
              </button>

              {perfilAberto && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setPerfilAberto(false)} />
                  <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-[#0d3322]/10 bg-white text-[#171512] shadow-xl">
                    <div className="border-b border-[#0d3322]/10 bg-[#f58a1f]/10 px-4 py-3">
                      <p className="truncate text-sm font-semibold text-[#0d3322]">{usuario.nome}</p>
                      <p className="truncate text-xs text-[#0d3322]/60">{usuario.email}</p>
                    </div>
                    <Link href="/conta" className="flex items-center gap-2 px-4 py-2.5 text-sm text-[#0d3322]/85 hover:bg-[#f58a1f]/10">
                      <UserCog size={15} /> Minha conta
                    </Link>
                    {usuario.papel === "admin" && (
                      <Link href="/admin/usuarios" className="flex items-center gap-2 px-4 py-2.5 text-sm text-[#0d3322]/85 hover:bg-[#f58a1f]/10">
                        <Users size={15} /> Gerenciar usuários
                      </Link>
                    )}
                    <button onClick={sair} className="flex w-full items-center gap-2 border-t border-[#0d3322]/10 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50">
                      <LogOut size={15} /> Sair
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Botão do menu (celular/tablet) */}
          <button
            onClick={() => setMenuAberto((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-white hover:bg-white/15 lg:hidden"
            aria-label="Abrir menu"
          >
            {menuAberto ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Menu (celular/tablet) */}
      {menuAberto && (
        <nav className="border-t border-white/20 bg-gradient-to-b from-[#dc8a5f] to-[#d0734a] px-4 py-3 lg:hidden">
          <div className="grid gap-1">
            {links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${
                  ativo(href) ? "bg-[#0d3322] text-white" : "text-white/90 hover:bg-white/15"
                }`}
              >
                <Icon size={16} />
                {label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
