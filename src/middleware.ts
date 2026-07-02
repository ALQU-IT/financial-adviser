import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/setup"];

// Fast redirect for anonymous visitors. Only checks cookie presence — the
// session itself is validated against the database in server components.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (!request.cookies.get("fa_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
