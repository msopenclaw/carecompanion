/**
 * Console API client — fetches data from Railway backend
 */

const RAILWAY_API_URL =
  process.env.NEXT_PUBLIC_RAILWAY_URL ||
  process.env.RAILWAY_API_URL ||
  "https://carecompanion-backend-production.up.railway.app";

export async function consoleApi(
  path: string,
  token: string,
  options: RequestInit = {},
) {
  const res = await fetch(`${RAILWAY_API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `API error: ${res.status}`);
  }

  return res.json();
}

export async function consoleLogin(email: string, password: string) {
  const res = await fetch(`${RAILWAY_API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Login failed" }));
    throw new Error(error.error || "Login failed");
  }

  return res.json();
}
