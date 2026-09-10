import { z } from "zod";
import { AppError, assertSameOrigin, credentialsSchema, readJson } from "@/lib/security";
import { apiError, clearSession, clientIp, json, publicUser, quota, requireUser, setSession, supabase, tokens } from "@/lib/server";
export const runtime = "nodejs";
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
        if (renewed.error && (renewed.error.status || 500) >= 500) throw new AppError(503, "Não foi possível encerrar a sessão. Tente novamente.");
        token = renewed.data.session?.access_token;
      }
      if (token) {
        const ended = await supabase().auth.admin.signOut(token, "local");
        if (ended.error && ![401,403,404].includes(ended.error.status || 500)) throw new AppError(503, "Não foi possível encerrar a sessão. Tente novamente.");
      }
      await clearSession(); return json({ ok: true });
    }
    if (action === "refresh") { const { user } = await requireUser(); return json({ user: publicUser(user) }); }
    const input = credentialsSchema.parse(body);
    await quota("auth-ip", clientIp(request), 20, 900);
    await quota("auth-email", input.email, 10, 900);
    if (action === "signup") {
      const { data, error } = await supabase().auth.signUp({ email: input.email, password: input.password, options: { data: { name: input.name } } });
      if (error && error.status && error.status >= 500) throw new AppError(503, "Não foi possível criar a conta agora. Tente mais tarde.");
      if (!error && data.session && data.user?.email_confirmed_at) { await setSession(data.session); return json({ user: publicUser(data.user) }); }
      // The same result for new and existing email addresses prevents account enumeration.
      return json({ message: "Se o cadastro puder ser concluído, você receberá um e-mail de confirmação. Confira também o spam. Depois, volte para entrar." });
    }
    const { data, error } = await supabase().auth.signInWithPassword({ email: input.email, password: input.password });
    if (error || !data.session || !data.user.email_confirmed_at) throw new AppError(401, "Não foi possível entrar. Confira seu e-mail, sua senha e a confirmação da conta.");
    await setSession(data.session); return json({ user: publicUser(data.user) });
  } catch (e) { return apiError(e); }
}
