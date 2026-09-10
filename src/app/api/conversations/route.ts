import { apiError, json, requireUser } from "@/lib/server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { user, client } = await requireUser();
    const { data, error } = await client.from("salpe_conversations").select("id,title,updated_at,model").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(100);
    if (error) throw error; return json({ conversations: data });
  } catch (e) { return apiError(e); }
}
