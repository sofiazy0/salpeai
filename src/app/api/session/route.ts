import { apiError, authReady, aiReady, json, models, publicUser, requireUser, tokens } from "@/lib/server";
import { AppError } from "@/lib/security";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const ready = authReady(); let user = null;
    if (ready) {
      const token = await tokens();
      if (token.access || token.refresh) try { user = publicUser((await requireUser()).user); } catch (e) { if (!(e instanceof AppError && e.status === 401)) throw e; }
    }
    return json({ user, authReady: ready, aiReady: aiReady(), models: models() });
  } catch (e) { return apiError(e); }
}
