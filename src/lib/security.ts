import { createHmac } from "node:crypto";
import { z } from "zod";

export class AppError extends Error { constructor(public status: number, message: string) { super(message); } }
export const uuidSchema = z.string().uuid();
export const credentialsSchema = z.object({ action: z.enum(["login", "signup"]), email: z.email().max(254).transform((v) => v.trim().toLowerCase()), password: z.string().min(1).max(128), name: z.string().trim().min(2).max(60).optional() }).strict().superRefine((v, ctx) => {
  if (v.action === "signup" && (v.password.length < 12 || !v.name)) ctx.addIssue({ code: "custom", message: "Informe seu nome e uma senha com pelo menos 12 caracteres." });
});
export const chatSchema = z.object({ conversationId: uuidSchema.nullable(), message: z.string().trim().min(1).max(12000), model: z.string().min(1).max(160) }).strict();

export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const values = [env.APP_URL, env.VERCEL_URL && `https://${env.VERCEL_URL}`, env.VERCEL_PROJECT_PRODUCTION_URL && `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`];
  if (env.NODE_ENV !== "production") values.push("http://localhost:3000", "http://127.0.0.1:3000");
  return new Set(values.filter((v): v is string => Boolean(v)).map((v) => { try { return new URL(v).origin; } catch { return ""; } }).filter(Boolean));
}
export function assertSameOrigin(request: Request, origins = allowedOrigins()) {
  const origin = request.headers.get("origin");
  if (!origin || !origins.has(origin) || request.headers.get("x-salpe-request") !== "1" || request.headers.get("sec-fetch-site") === "cross-site") throw new AppError(403, "Solicitação não permitida. Atualize a página.");
}
export async function readJson(request: Request, limit = 56000): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) throw new AppError(415, "Formato de solicitação inválido.");
  const claimed = Number(request.headers.get("content-length") || 0);
  if (claimed > limit) throw new AppError(413, "A mensagem ultrapassa o tamanho permitido.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "Solicitação vazia.");
  const chunks: Uint8Array[] = []; let total = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    total += value.byteLength;
    if (total > limit) { await reader.cancel(); throw new AppError(413, "A mensagem ultrapassa o tamanho permitido."); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new AppError(400, "Solicitação inválida."); }
}
export function rateKey(value: string, secret: string) { return createHmac("sha256", secret).update(value).digest("hex"); }
export function providerUrl(raw: string): URL {
  let url: URL; try { url = new URL(raw); } catch { throw new AppError(503, "O chat ainda está em configuração."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.port && url.port !== "443") || !(url.hostname === "anymodel.org" || url.hostname.endsWith(".anymodel.org"))) throw new AppError(503, "O chat ainda está em configuração.");
  return url;
}
