import { AppError, assertSameOrigin, uuidSchema } from "@/lib/security";
import { apiError, json, requireUser } from "@/lib/server";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, context: Context) {
  try {
    const id = uuidSchema.parse((await context.params).id);
    const { user, client } = await requireUser();
    const owner = await client.from("salpe_conversations").select("id").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (owner.error) throw owner.error;
    if (!owner.data) throw new AppError(404, "Conversa não encontrada.");
    const { data, error } = await client.from("salpe_messages").select("id,role,content,created_at").eq("conversation_id", id).eq("user_id", user.id).order("created_at", { ascending: true }).limit(400);
    if (error) throw error;
    return json({ messages: data });
  } catch (e) { return apiError(e); }
}
export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const id = uuidSchema.parse((await context.params).id);
    const { client } = await requireUser();
    const { data, error } = await client.rpc("salpe_delete_conversation", { p_conversation: id });
    if (error) throw error;
    if (!data) throw new AppError(404, "Conversa não encontrada ou limite de exclusões atingido.");
    return json({ ok: true });
  } catch (e) { return apiError(e); }
}
