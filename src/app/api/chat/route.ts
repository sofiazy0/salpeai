import { randomUUID } from "node:crypto";
import { AppError, assertSameOrigin, chatSchema, readJson } from "@/lib/security";
import { aiReady, apiError, models, quota, requireUser, supabase } from "@/lib/server";
import { generateReply } from "@/lib/anymodel";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  let release: (() => Promise<void>) | undefined;
  try {
    assertSameOrigin(request);
    const input = chatSchema.parse(await readJson(request));
    const { user, client } = await requireUser();
    if (!aiReady()) throw new AppError(503, "O chat ainda está em configuração.");
    if (!models().some((model) => model.id === input.model)) throw new AppError(400, "Selecione um modelo disponível.");
    await quota("chat-minute", user.id, 12, 60);
    await quota("chat-day", user.id, 100, 86400);
    await quota("chat-global-day", "all", 1000, 86400);
    const admin = supabase(undefined, true);
    let conversationId = input.conversationId;
    if (!conversationId) {
      await quota("new-conversations", user.id, 30, 86400);
      const created = await admin.from("salpe_conversations").insert({ user_id: user.id, title: input.message.slice(0, 80), model: input.model }).select("id").single();
      if (created.error) throw created.error;
      conversationId = created.data.id as string;
    }
    const owner = await client.from("salpe_conversations").select("id").eq("id", conversationId).eq("user_id", user.id).maybeSingle();
    if (owner.error) throw owner.error;
    if (!owner.data) throw new AppError(404, "Conversa não encontrada.");
    const leaseId = randomUUID();
    const lock = await admin.from("salpe_conversations").update({ generation_id: leaseId, generation_until: new Date(Date.now() + 150000).toISOString() }).eq("id", conversationId).eq("user_id", user.id).or(`generation_until.is.null,generation_until.lt.${new Date().toISOString()}`).select("id");
    if (lock.error) throw lock.error;
    if (!lock.data?.length) throw new AppError(409, "Uma resposta já está sendo gerada nesta conversa.");
    const lockedId = conversationId;
    release = async () => {
      const result = await admin.from("salpe_conversations").update({ generation_id: null, generation_until: null }).eq("id", lockedId).eq("user_id", user.id).eq("generation_id", leaseId);
      if (result.error) console.error("Salpe generation lease release failed");
    };
    const history = await client.from("salpe_messages").select("role,content").eq("conversation_id", conversationId).eq("user_id", user.id).order("created_at", { ascending: false }).limit(40);
    if (history.error) throw history.error;
    const context: { role: "user" | "assistant"; content: string }[] = [];
    let characters = input.message.length;
    for (const item of history.data || []) {
      if (characters + item.content.length > 44000) break;
      characters += item.content.length; context.unshift({ role: item.role as "user" | "assistant", content: item.content });
    }
    context.push({ role: "user", content: input.message });
    const inserted = await admin.from("salpe_messages").insert({ conversation_id: conversationId, user_id: user.id, role: "user", content: input.message });
    if (inserted.error) throw inserted.error;
    const touched = await admin.from("salpe_conversations").update({ model: input.model, updated_at: new Date().toISOString() }).eq("id", conversationId).eq("user_id", user.id);
    if (touched.error) throw touched.error;
    const controller = new AbortController(); const signal = AbortSignal.any([request.signal, controller.signal]);
    const encoder = new TextEncoder(); const unlock = release; release = undefined;
    const stream = new ReadableStream<Uint8Array>({
      async start(writer) {
        const emit = (event: Record<string, unknown>) => writer.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        let answer = "";
        try {
          emit({ type: "start", conversationId });
          for await (const chunk of generateReply(input.model, context, signal)) { answer += chunk; emit({ type: "delta", text: chunk }); }
          if (signal.aborted) return;
          if (!answer.trim()) throw new AppError(502, "O modelo retornou uma resposta vazia. Tente novamente.");
          const saved = await admin.from("salpe_messages").insert({ conversation_id: conversationId, user_id: user.id, role: "assistant", content: answer });
          if (saved.error) throw new AppError(503, "A resposta foi recebida, mas não foi possível salvá-la. Copie o texto antes de sair.");
          emit({ type: "done" });
        } catch (e) {
          if (!signal.aborted) {
            try { emit({ type: "error", message: e instanceof AppError ? e.message : "A resposta foi interrompida. Tente novamente." }); } catch { /* disconnected */ }
          }
        } finally { await unlock(); try { writer.close(); } catch { /* disconnected */ } }
      },
      cancel() { controller.abort(); },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "private, no-store, no-transform", "X-Content-Type-Options": "nosniff", "Vary": "Cookie" } });
  } catch (e) { if (release) await release(); return apiError(e); }
}
