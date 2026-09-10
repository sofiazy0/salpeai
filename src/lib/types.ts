export type User = { id: string; email: string; name: string };
export type Conversation = { id: string; title: string; updated_at: string; model: string };
export type Message = { id: string; role: "user" | "assistant"; content: string; created_at?: string };
export type Model = { id: string; name: string };
export type SessionInfo = { user: User | null; authReady: boolean; aiReady: boolean; models: Model[] };
