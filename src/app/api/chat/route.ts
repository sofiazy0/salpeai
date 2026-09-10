import { AppError, assertSameOrigin, chatSchema, readJson } from "@/lib/security";
import { aiReady, apiError, models, requireUser } from "@/lib/server";
import { generateReply } from "@/lib/anymodel";
export const runtime = "nodejs";
export const maxDuration = 120;

type BeginResult = { status?: string; conversation_id?: string; lease_id?: string };

export async function POST(request: Request) {
  let release: (() => Promise<void>) | undefined;
  try {
    assertSameOrigin(request);
    const input = chatSchema.parse(await readJson(request));
    const { client } = await requireUser();
    if (!aiReady()) throw new AppError(503, "O chat ainda está em configuração.");
    if (!models().some((model) => model.id === input.model)) throw new AppError(400, "Selecione um modelo disponível.");

    const began = await client.rpc("salpe_begin_generation", {
      p_conversation: input.conversationId,
      p_title: input.message.slice(0, 80),
      p_model: input.model,
    });
    if (began.error) throw began.error;
    const state = began.data as BeginResult | null;
    if (state?.status === "rate_limited") throw new AppError(429, "Muitas solicitações. Aguarde um pouco antes de tentar novamente.");
    if (state?.status === "not_found") throw new AppError(404, "Conversa não encontrada.");
    if (state?.status === "locked") throw new AppError(409, "Uma resposta já está sendo gerada nesta conversa.");
    if (state?.status !== "ok" || !state.conversation_id || !state.lease_id) throw new AppError(503, "O serviço está temporariamente indisponível. Tente novamente.");

    const conversationId = state.conversation_id;
    const leaseId = state.lease_id;
    release = async () => {
      const result = await client.rpc("salpe_release_generation", { p_conversation: conversationId, p_lease: leaseId });
      if (result.error) console.error("Salpe generation lease release failed");
    };

    const history = await client.from("salpe_messages").select("role,content").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(40);
    if (history.error) throw history.error;
    const context: { role: "user" | "assistant"; content: string }[] = [];
    let characters = input.message.length;
    for (const item of history.data || []) {
      if (characters + item.content.length > 44000) break;
      characters += item.content.length;
      context.unshift({ role: item.role as "user" | "assistant", content: item.content });
    }
    context.push({ role: "user", content: input.message });

    const recorded = await client.rpc("salpe_record_user_message", { p_conversation: conversationId, p_lease: leaseId, p_message: input.message });
    if (recorded.error) throw recorded.error;
    if (!recorded.data) throw new AppError(409, "A geração expirou. Tente novamente.");

    const controller = new AbortController();
    const signal = AbortSignal.any([request.signal, controller.signal]);
    const encoder = new TextEncoder();
    const unlock = release;
    release = undefined;
    const stream = new ReadableStream<Uint8Array>({
      async start(writer) {
        const emit = (event: Record<string, unknown>) => writer.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        let answer = "";
        try {
          emit({ type: "start", conversationId });
          for await (const chunk of generateReply(input.model, context, signal)) {
            answer += chunk;
            emit({ type: "delta", text: chunk });
          }
          if (signal.aborted) return;
          if (!answer.trim()) throw new AppError(502, "O modelo retornou uma resposta vazia. Tente novamente.");
          const saved = await client.rpc("salpe_finish_generation", { p_conversation: conversationId, p_lease: leaseId, p_answer: answer });
          if (saved.error || !saved.data) throw new AppError(503, "A resposta foi recebida, mas não foi possível salvá-la. Copie o texto antes de sair.");
          emit({ type: "done" });
        } catch (e) {
          if (!signal.aborted) {
            try { emit({ type: "error", message: e instanceof AppError ? e.message : "A resposta foi interrompida. Tente novamente." }); } catch { /* disconnected */ }
          }
        } finally {
          await unlock();
          try { writer.close(); } catch { /* disconnected */ }
        }
      },
      cancel() { controller.abort(); },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "private, no-store, no-transform", "X-Content-Type-Options": "nosniff", "Vary": "Cookie" } });
  } catch (e) {
    if (release) await release();
    return apiError(e);
  }
}
