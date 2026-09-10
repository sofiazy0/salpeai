export class ClientError extends Error { constructor(message: string, public status = 500) { super(message); } }
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json", "X-Salpe-Request": "1", ...init?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ClientError(data.error || "Não foi possível concluir. Tente novamente.", response.status);
  return data as T;
}
