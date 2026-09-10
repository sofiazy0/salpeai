import { AppError } from "./security";

// OpenAI-compatible SSE parser. This contract must be confirmed in AnyModel docs
// before setting ANYMODEL_API_FORMAT. Raw provider errors never reach the client.
export async function* parseCompletionStream(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader(); const decoder = new TextDecoder();
  let buffer = ""; let finished = false; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 262144) throw new AppError(502, "A resposta recebida excedeu o limite permitido.");
      const lines = buffer.split("\n"); buffer = lines.pop() || "";
      if (done && buffer) { lines.push(buffer); buffer = ""; }
      for (const raw of lines) {
        const line = raw.trim(); if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") { finished = true; break; }
        let event; try { event = JSON.parse(payload); } catch { throw new AppError(502, "O provedor retornou uma resposta inválida."); }
        if (event.error) throw new AppError(502, "O provedor não conseguiu concluir a resposta.");
        const choice = event.choices?.[0];
        const content = choice?.delta?.content;
        if (typeof content === "string") {
          size += content.length;
          if (size > 64000) throw new AppError(502, "A resposta ultrapassou o limite. Peça uma resposta mais curta.");
          yield content;
        }
        if (choice?.finish_reason) finished = true;
      }
      if (finished || done) break;
    }
    if (!finished) throw new AppError(502, "A conexão com o provedor foi interrompida.");
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
