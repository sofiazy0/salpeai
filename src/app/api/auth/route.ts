import { z } from "zod";
import { AppError, assertSameOrigin, credentialsSchema, readJson } from "@/lib/security";
import { apiError, clearSession, json, publicUser, requireUser, setSession, supabase, tokens } from "@/lib/server";
export const runtime = "nodejs";

async function revokeSupabaseSession(token: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return;
  try {
    await fetch(`${url}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    // Local cookie clearing still signs the browser out if the auth service is temporarily unavailable.
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson(request, 6000);
    const action = z.object({ action: z.enum(["login", "signup", "logout", "refresh"]) }).parse(body).action;
    if (action === "logout") {
      const { access, refresh } = await tokens();
      let token = access;
      if (!token && refresh) {
        const renewed = await supabase().auth.refreshSession({ refresh_token: refresh });
        token = renewed.data.session?.access_token;
      }
      if (token) await revokeSupabaseSession(token);
      await clearSession();
      return json({ ok: true });
    }
    if (action === "refresh") {
      const { user } = await requireUser();
      return json({ user: publicUser(user) });
    }
    const input = credentialsSchema.parse(body);
    if (action === "signup") {
      const { data, error } = await supabase().auth.signUp({
        email: input.email,
        password: input.password,
        options: { data: { name: input.name } },
      });
      if (error && error.status && error.status >= 500) throw new AppError(503, "Não foi possível criar a conta agora. Tente mais tarde.");
      if (!error && data.session && data.user?.email_confirmed_at) {
        await setSession(data.session);
        return json({ user: publicUser(data.user) });
      }
      return json({ message: "Se o cadastro puder ser concluído, você receberá um e-mail de confirmação. Confira também o spam. Depois, volte para entrar." });
    }
    const { data, error } = await supabase().auth.signInWithPassword({ email: input.email, password: input.password });
    if (error || !data.session || !data.user.email_confirmed_at) throw new AppError(401, "Não foi possível entrar. Confira seu e-mail, sua senha e a confirmação da conta.");
    await setSession(data.session);
    return json({ user: publicUser(data.user) });
  } catch (e) {
    return apiError(e);
  }
}
