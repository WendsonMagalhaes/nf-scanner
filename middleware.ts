import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, lerToken } from "@/lib/auth";

/**
 * Tudo exige login, exceto a tela /entrar e as rotas /api/auth/*.
 * Páginas sem sessão vão para /entrar; a API responde 401.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/entrar" || pathname.startsWith("/api/auth/")) return NextResponse.next();

  const logado = await lerToken(req.cookies.get(COOKIE_SESSAO)?.value);
  if (logado) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const destino = new URL("/entrar", req.url);
  if (pathname !== "/") destino.searchParams.set("next", pathname);
  return NextResponse.redirect(destino);
}

export const config = {
  // imagens e arquivos estáticos (logo, ícone) ficam públicos, inclusive na tela de entrar
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
