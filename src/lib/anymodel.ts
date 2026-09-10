import "server-only";
import { AppError, providerUrl } from "./security";
import { parseCompletionStream } from "./provider-stream";
import { aiReady, models } from "./server";

export async function* generateReply(model: string, messages: { role: "user" | "assistant"; content: string }[], signal: AbortSignal) {
  if (!aiReady()) throw new AppError(503, "O chat ainda está em configuração.");
  if (!models().some((item) => item.id === model)) throw new AppError(400, "Selecione um modelo disponível.");
  const url = providerUrl(process.env.ANYMODEL_CHAT_URL!);
  const response = await fetch(url, {
    method: "POST", redirect: "error", cache: "no-store",
    signal: AbortSignal.any([signal, AbortSignal.timeout(90000)]),
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.ANYMODEL_API_KEY}` },
    body: JSON.stringify({ model, stream: true, max_tokens: 4096, messages: [{ role: "system", content: "Você é o Salpe AI, um assistente de inteligência artificial. Responda no idioma da pessoa, de forma clara e útil. Reconheça incertezas e não afirme ter executado ações externas. Não solicite senhas, chaves de API ou segredos. Use Markdown quando melhorar a leitura." }, ...messages] }),
  });
  if (!response.ok || !response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
    await response.body?.cancel();
    throw new AppError(response.status === 429 ? 429 : 502, response.status === 429 ? "O modelo está ocupado. Aguarde um pouco e tente novamente." : "Não foi possível obter uma resposta do modelo. Tente novamente mais tarde.");
  }
  yield* parseCompletionStream(response.body);
}
