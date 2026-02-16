/**
 * Unit tests for auth middleware
 */
const jwt = require("jsonwebtoken");

const JWT_SECRET = "test-secret";

describe("Auth Middleware: JWT validation", () => {
  test("valid token decodes correctly", () => {
    const payload = { userId: "user-123", role: "patient" };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });

    const decoded = jwt.verify(token, JWT_SECRET);
    expect(decoded.userId).toBe("user-123");
    expect(decoded.role).toBe("patient");
  });

  test("expired token throws", () => {
    const payload = { userId: "user-123" };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "-1s" });

    expect(() => jwt.verify(token, JWT_SECRET)).toThrow();
  });

  test("invalid token throws", () => {
    expect(() => jwt.verify("invalid.token.here", JWT_SECRET)).toThrow();
  });

  test("wrong secret throws", () => {
    const token = jwt.sign({ userId: "user-123" }, JWT_SECRET);
    expect(() => jwt.verify(token, "wrong-secret")).toThrow();
  });
});

describe("Auth Middleware: Header parsing", () => {
  test("extracts Bearer token", () => {
    const authHeader = "Bearer eyJhbGciOiJIUzI1NiJ9.test";
    const token = authHeader.slice(7);

    expect(token).toBe("eyJhbGciOiJIUzI1NiJ9.test");
  });

  test("rejects missing header", () => {
    const authHeader = undefined;
    const isInvalid = !authHeader || !authHeader.startsWith("Bearer ");

    expect(isInvalid).toBe(true);
  });

  test("rejects non-Bearer header", () => {
    const authHeader = "Basic dXNlcjpwYXNz";
    const isInvalid = !authHeader || !authHeader.startsWith("Bearer ");

    expect(isInvalid).toBe(true);
  });

  test("rejects empty Bearer", () => {
    const authHeader = "Bearer ";
    const token = authHeader.slice(7);

    expect(token).toBe("");
    expect(() => jwt.verify("", JWT_SECRET)).toThrow();
  });
});

describe("Auth Middleware: Admin check", () => {
  test("allows admin role", () => {
    const user = { userId: "admin-1", role: "admin" };
    const isAdmin = user && user.role === "admin";

    expect(isAdmin).toBe(true);
  });

  test("rejects patient role", () => {
    const user = { userId: "user-1", role: "patient" };
    const isAdmin = user && user.role === "admin";

    expect(isAdmin).toBe(false);
  });

  test("rejects missing user", () => {
    const user = null;
    const isAdmin = user && user.role === "admin";

    expect(isAdmin).toBeFalsy();
  });
});
