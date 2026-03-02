import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Public pages — no auth required
  if (path === "/console/login" || path === "/TodyAITerms") {
    return NextResponse.next();
  }

  // Console routes — skip middleware, auth handled client-side via localStorage
  // (Cookie-based middleware caused premature logouts when the 1h cookie expired
  // while the JWT in localStorage was still valid)
  if (path.startsWith("/console") || path.startsWith("/api/console")) {
    return NextResponse.next();
  }

  // Everything else — existing Basic Auth for demo
  const auth = req.headers.get("authorization");

  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = atob(encoded);
      const [user, pass] = decoded.split(":");
      if (user === "ms" && pass === "openclaw") {
        return NextResponse.next();
      }
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="CareCompanion Demo"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
