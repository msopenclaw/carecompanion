import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Public pages — no auth required
  if (path === "/console/login" || path === "/TodyAITerms") {
    return NextResponse.next();
  }

  // Console routes — check JWT cookie
  if (path.startsWith("/console")) {
    const token = req.cookies.get("console_token")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/console/login", req.url));
    }
    // Token validation happens in the console layout (server-side)
    return NextResponse.next();
  }

  // Console API routes — check JWT cookie
  if (path.startsWith("/api/console")) {
    const token = req.cookies.get("console_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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
