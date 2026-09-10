import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, type Session } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError, providerUrl, rateKey } from "./security";
import type { Model, User } from "./types";

const secure = process.env.NODE_ENV === "production";
const ACCESS_COOKIE = secure ? "__Host-salpe-access" : "salpe-access";
const REFRESH_COOKIE = secure ? "__Host-salpe-refresh" : "salpe-refresh";
const modelSchema = z.array(z.object({ id: z.string().min(1).max(160), name: z.string().min(1).max(60) })).min(1).max(12);
export function models(): Model[] {
  try { return modelSchema.parse(JSON.parse(process.env.ANYMODEL_MODELS_JSON || "")); }
  catch { return [{ id: "default", name: "Salpe AI" }]; }
}
export function authReady() { return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY && process.env.SUPABASE_SECRET_KEY && (process.env.RATE_LIMIT_SECRET?.length || 0) >= 32); }
export function aiReady() {
  if (!authReady() || process.env.ANYMODEL_API_FORMAT !== "openai-chat-completions" || !process.env.ANYMODEL_API_KEY) return false;
  try { providerUrl(process.env.ANYMODEL_CHAT_URL || ""); modelSchema.parse(JSON.parse(process.env.ANYMODEL_MODELS_JSON || "")); return true; }
  catch { return false; }
}
export function supabase(accessToken?: string, privileged = false) {
  if (!authReady()) throw new AppError(503, "As contas ainda estão em configuração. Tente novamente mais tarde.");
  return createClient(process.env.SUPABASE_URL!, privileged ? process.env.SUPABASE_SECRET_KEY! : process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}, fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) }) },
  });
}
export function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store, max-age=0", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" } }); }
export function apiError(error: unknown) {
  if (error instanceof AppError) { const response = json({ error: error.message }, error.status); if (error.status === 429) response.headers.set("Retry-After", "60"); return response; }
  if (error instanceof z.ZodError) return json({ error: "Confira os campos informados e tente novamente." }, 400);
  // Never log request bodies, tokens, database errors or provider response bodies.
  console.error("Salpe request failed", { category: error instanceof Error ? error.name : "unknown" });
  return json({ error: "O serviço está temporariamente indisponível. Tente novamente." }, 503);
}
export async function setSession(session: Session) {
  const jar = await cookies();
  const options = { httpOnly: true, secure, sameSite: "lax" as const, path: "/", priority: "high" as const };
  jar.set(ACCESS_COOKIE, session.access_token, { ...options, maxAge: session.expires_in });
  jar.set(REFRESH_COOKIE, session.refresh_token, { ...options, maxAge: 60 * 60 * 24 * 30 });
}
export async function clearSession() {
  const jar = await cookies();
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE]) jar.set(name, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
}
export async function tokens() { const jar = await cookies(); return { access: jar.get(ACCESS_COOKIE)?.value, refresh: jar.get(REFRESH_COOKIE)?.value }; }
export function publicUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): User {
  return { id: user.id, email: user.email || "", name: typeof user.user_metadata?.name === "string" ? user.user_metadata.name.slice(0, 60) : user.email?.split("@")[0] || "Você" };
}
export async function requireUser() {
  const { access, refresh } = await tokens();
  if (!access && !refresh) throw new AppError(401, "Entre na sua conta para continuar.");
  let token = access;
  let client = supabase(token);
  const verified = token ? await client.auth.getUser(token) : null;
  if (!verified?.data.user && refresh) {
    const refreshed = await supabase().auth.refreshSession({ refresh_token: refresh });
    if (!refreshed.data.session) { await clearSession(); throw new AppError(401, "Sua sessão expirou. Entre novamente."); }
    await setSession(refreshed.data.session);
    token = refreshed.data.session.access_token; client = supabase(token);
    // Check with the auth server. Never authorize with getSession or unverified JWT claims.
    const user = await client.auth.getUser(token);
    if (!user.data.user?.email_confirmed_at) throw new AppError(401, "Confirme seu e-mail e entre novamente.");
    await checkLiveSession(client);
    return { user: user.data.user, client, token: token! };
  }
  if (!verified?.data.user?.email_confirmed_at) throw new AppError(401, "Entre na sua conta para continuar.");
  await checkLiveSession(client);
  return { user: verified.data.user, client, token: token! };
}
export async function quota(scope: string, subject: string, limit: number, window: number) {
  const secret = process.env.RATE_LIMIT_SECRET;
  if (!secret || secret.length < 32) throw new AppError(503, "O serviço ainda está em configuração.");
  const { data, error } = await supabase(undefined, true).rpc("salpe_consume_quota", { p_key: rateKey(`${scope}:${subject}`, secret), p_limit: limit, p_window: window });
  if (error) throw new AppError(503, "O serviço está temporariamente indisponível.");
  if (!data) throw new AppError(429, "Muitas solicitações. Aguarde um pouco antes de tentar novamente.");
}
export function clientIp(request: Request) {
  // Vercel overwrites this header. Never trust client-controlled x-forwarded-for.
  return process.env.VERCEL ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown" : "local";
}

async function checkLiveSession(client: ReturnType<typeof supabase>) {
  const { data, error } = await client.rpc("salpe_session_active");
  if (error) throw new AppError(503, "O serviço está temporariamente indisponível.");
  if (!data) throw new AppError(401, "Sua sessão expirou. Entre novamente.");
}
