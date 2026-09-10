"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ArrowRight, ArrowUp, Check, ChevronDown, Code2, Copy, Lightbulb, LoaderCircle, LogOut, Menu, MessageSquare, PanelLeftClose, PenLine, Plus, Search, ShieldCheck, Sparkles, Square, Trash2, X, BookOpen } from "lucide-react";
import { Brand } from "./brand";
import { AuthDialog } from "./auth-dialog";
import { MessageContent } from "./message-content";
import { api, ClientError } from "@/lib/client";
import type { Conversation, Message, SessionInfo, User } from "@/lib/types";

const suggestions = [
  { icon: PenLine, title: "Escrever", detail: "Encontre as palavras certas", prompt: "Quero escrever um texto. Me ajude a definir o tom e organizar minhas ideias." },
  { icon: Lightbulb, title: "Explorar ideias", detail: "Comece por uma possibilidade", prompt: "Vamos explorar ideias para um projeto criativo. Comece me fazendo três perguntas." },
  { icon: Code2, title: "Programar", detail: "Do primeiro passo ao código", prompt: "Quero ajuda para programar. Pergunte qual é meu projeto e meu nível de experiência." },
  { icon: BookOpen, title: "Aprender", detail: "Dê sentido ao que é novo", prompt: "Me ajude a aprender um assunto novo, passo a passo. Pergunte o que quero estudar." },
];

export function Workspace() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [model, setModel] = useState("default");
  const [draft, setDraft] = useState("");
  const [sidebar, setSidebar] = useState(true);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [search, setSearch] = useState("");
  const [auth, setAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadSequence = useRef(0);
  const user = session?.user;
  const models = session?.models || [{ id: "default", name: "Salpe AI" }];
  const currentModel = models.find((m) => m.id === model) || models[0];

  const loadHistory = useCallback(async () => {
    const result = await api<{ conversations: Conversation[] }>("/api/conversations");
    setConversations(result.conversations);
  }, []);

  useEffect(() => {
    let alive = true;
    api<SessionInfo>("/api/session").then((data) => {
      if (!alive) return;
      setSession(data); setModel(data.models[0]?.id || "default");
      if (data.user) loadHistory().catch(() => setError("Não foi possível carregar seu histórico."));
    }).catch(() => { if (alive) setError("Não foi possível conectar. Atualize a página para tentar novamente."); });
    return () => { alive = false; };
  }, [loadHistory]);

  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible" && user) api("/api/auth", { method: "POST", body: JSON.stringify({ action: "refresh" }) }).catch(() => {}); }, 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, [user]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); if (!busy) { loadSequence.current++; setMessages([]); setActiveId(null); setError(""); setDraft(""); setLoadingChat(false); setMobileMenu(false); inputRef.current?.focus(); } } };
    document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey);
  }, [busy]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, busy]);
  useEffect(() => { const input = inputRef.current; if (input) { input.style.height = "auto"; input.style.height = `${Math.min(input.scrollHeight, 190)}px`; } }, [draft]);

  function openAuth(mode: "login" | "signup") { setAuthMode(mode); setAuth(true); }
  function newChat() { if (busy) return; loadSequence.current++; setMessages([]); setActiveId(null); setError(""); setDraft(""); setLoadingChat(false); setMobileMenu(false); inputRef.current?.focus(); }
  async function selectChat(conversation: Conversation) {
    if (busy) return;
    const sequence = ++loadSequence.current;
    setLoadingChat(true); setError(""); setMobileMenu(false);
    try {
      const data = await api<{ messages: Message[] }>(`/api/conversations/${conversation.id}`);
      if (sequence !== loadSequence.current) return;
      setMessages(data.messages); setActiveId(conversation.id); setModel(conversation.model); setDraft("");
    } catch (e) { if (sequence === loadSequence.current) setError(e instanceof Error ? e.message : "Tente novamente."); }
    finally { if (sequence === loadSequence.current) setLoadingChat(false); }
  }
  async function loginSuccess(nextUser: User) {
    setSession((s) => s ? { ...s, user: nextUser } : s);
    try { await loadHistory(); } catch { setError("Sua conta está conectada, mas o histórico não carregou."); }
    inputRef.current?.focus();
  }
  async function logout() {
    try { await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "logout" }) }); setSession((s) => s ? { ...s, user: null } : s); setConversations([]); newChat(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível sair."); }
  }
  async function deleteChat() {
    if (!deleteId || deleting) return;
    setDeleting(true);
    try { await api(`/api/conversations/${deleteId}`, { method: "DELETE" }); setConversations((list) => list.filter((c) => c.id !== deleteId)); if (activeId === deleteId) newChat(); setDeleteId(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível excluir."); setDeleteId(null); }
    finally { setDeleting(false); }
  }
  async function copy(message: Message) {
    try { await navigator.clipboard.writeText(message.content); setCopied(message.id); setTimeout(() => setCopied(null), 1800); }
    catch { setError("Não foi possível copiar. Selecione o texto e copie manualmente."); }
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy || loadingChat) return;
    if (!user) { openAuth("login"); return; }
    if (!session?.aiReady) { setError("O chat ainda está sendo configurado. Tente novamente mais tarde."); return; }
    const optimisticUser: Message = { id: crypto.randomUUID(), role: "user", content: text };
    const assistantId = crypto.randomUUID();
    const previous = messages;
    setMessages([...previous, optimisticUser]); setDraft(""); setBusy(true); setError("");
    const controller = new AbortController(); abortRef.current = controller;
    let accepted = false;
    try {
      const response = await fetch("/api/chat", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Salpe-Request": "1" }, signal: controller.signal, body: JSON.stringify({ message: text, conversationId: activeId, model }) });
      if (!response.ok) { const data = await response.json(); throw new ClientError(data.error || "Não foi possível responder agora.", response.status); }
      if (!response.body) throw new Error("A conexão foi interrompida. Tente novamente.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let completed = false;
      while (true) {
        const { done, value } = await reader.read(); buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n"); buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "start") { accepted = true; setActiveId(event.conversationId); }
          if (event.type === "delta") setMessages((list) => { const existing = list.some((m) => m.id === assistantId); return existing ? list.map((m) => m.id === assistantId ? { ...m, content: m.content + event.text } : m) : [...list, { id: assistantId, role: "assistant", content: event.text }]; });
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "done") completed = true;
        }
        if (done) break;
      }
      if (!completed) throw new Error("A conexão foi interrompida antes de concluir a resposta.");
    } catch (e) {
      if (controller.signal.aborted) setError("Resposta interrompida.");
      else { setError(e instanceof Error ? e.message : "Ocorreu um erro. Tente novamente."); if (e instanceof ClientError && e.status === 401) openAuth("login"); }
      if (!accepted) { setMessages(previous); setDraft(text); }
    } finally { setBusy(false); abortRef.current = null; loadHistory().catch(() => {}); }
  }

  const sidebarContents = <>
    <div className="sidebar-header"><a href="/" className="wordmark" aria-label="Salpe AI, início"><Brand /><span>salpe<span className="wordmark-ai">ai</span></span></a><button className="icon-button collapse" aria-label="Recolher menu" onClick={() => { setSidebar(false); setMobileMenu(false); }}><PanelLeftClose size={19} /></button></div>
    <button className="new-chat" onClick={newChat} disabled={busy}><Plus size={19} /><span>Nova conversa</span><kbd>⌘ K</kbd></button>
    <label className="history-search"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar conversas" aria-label="Buscar no histórico" /></label>
    <div className="history-label">SUAS CONVERSAS</div>
    <nav className="history-list" aria-label="Histórico de conversas">
      {conversations.filter((c) => c.title.toLowerCase().includes(search.toLowerCase())).map((c) => <div className={`history-item ${c.id === activeId ? "selected" : ""}`} key={c.id}><button className="history-open" disabled={busy} onClick={() => selectChat(c)}><MessageSquare size={15} /><span>{c.title}</span></button><button className="history-delete icon-button" aria-label={`Excluir conversa: ${c.title}`} disabled={busy} onClick={() => setDeleteId(c.id)}><Trash2 size={14} /></button></div>)}
      {conversations.length === 0 && <div className="history-empty"><MessageSquare size={23} /><p>{user ? "Um novo começo." : "Seu próximo assunto começa aqui."}</p><span>{user ? "As conversas que você criar aparecem aqui." : "Entre para encontrar suas conversas neste espaço."}</span></div>}
      {conversations.length > 0 && !conversations.some((c) => c.title.toLowerCase().includes(search.toLowerCase())) && <p className="search-empty">Nenhuma conversa encontrada.</p>}
    </nav>
    <div className="sidebar-bottom">{user ? <Dropdown.Root><Dropdown.Trigger className="profile-button" disabled={busy}><span className="avatar">{user.name.charAt(0).toUpperCase()}</span><span><strong>{user.name}</strong><small>Conta pessoal</small></span><ChevronDown size={16} /></Dropdown.Trigger><Dropdown.Portal><Dropdown.Content className="dropdown-content" side="top" align="start" sideOffset={10}><Dropdown.Label className="dropdown-label">{user.email}</Dropdown.Label><Dropdown.Item onSelect={logout} className="dropdown-item"><LogOut size={16} /> Sair da conta</Dropdown.Item></Dropdown.Content></Dropdown.Portal></Dropdown.Root> : <><div className="save-invite"><ShieldCheck size={18} /><div><strong>Um espaço só seu</strong><p>Salve suas conversas e continue de onde parou.</p></div></div><button className="sidebar-signup" onClick={() => openAuth("signup")}>Criar conta <ArrowRight size={16} /></button></>}
      <div className="sidebar-footer"><span>Salpe AI</span><span>Seu espaço de ideias</span></div>
    </div>
  </>;

  return <div className={`workspace ${sidebar ? "" : "sidebar-collapsed"}`}>
    <a className="skip-link" href="#chat-input">Ir para a mensagem</a>
    <aside className="desktop-sidebar">{sidebarContents}</aside>
    <Dialog.Root open={mobileMenu} onOpenChange={setMobileMenu}><Dialog.Portal><Dialog.Overlay className="dialog-overlay mobile-overlay" /><Dialog.Content className="mobile-sidebar"><Dialog.Title className="sr-only">Menu e conversas</Dialog.Title><Dialog.Description className="sr-only">Acesse seu histórico e sua conta.</Dialog.Description>{sidebarContents}<Dialog.Close className="sr-only">Fechar menu</Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
    <main className="main-panel">
      <header className="topbar"><div className="topbar-left"><button className="icon-button menu-toggle" aria-label="Abrir menu" onClick={() => { if (window.innerWidth < 800) setMobileMenu(true); else setSidebar(true); }}><Menu size={20} /></button>
        <Dropdown.Root><Dropdown.Trigger className="model-trigger" disabled={busy}>{currentModel.name}<ChevronDown size={15} /></Dropdown.Trigger><Dropdown.Portal><Dropdown.Content className="dropdown-content model-menu" align="start" sideOffset={12}><Dropdown.Label className="dropdown-label">Modelo da conversa</Dropdown.Label>{models.map((m) => <Dropdown.Item className="dropdown-item" key={m.id} onSelect={() => setModel(m.id)}><Sparkles size={16} /><span>{m.name}</span>{m.id === model && <Check size={16} />}</Dropdown.Item>)}</Dropdown.Content></Dropdown.Portal></Dropdown.Root>
        <span className="conversation-tag">Conversa</span></div>
        <div className="topbar-right">{user ? <span className="private-label"><LockIcon />Conversa privada</span> : <><button className="text-button" onClick={() => openAuth("login")}>Entrar</button><button className="primary-button top-signup" onClick={() => openAuth("signup")}>Criar conta<ArrowRight size={15} /></button></>}</div>
      </header>
      {session && (!session.authReady || !session.aiReady) && <div className="setup-notice" role="status">O Salpe AI está em configuração. As conversas serão liberadas em breve.</div>}
      <div ref={scrollRef} className={`conversation-scroll ${messages.length ? "has-messages" : ""}`}>
        {loadingChat ? <div className="loading-conversation"><LoaderCircle size={24} className="spin" />Carregando conversa…</div> : messages.length === 0 ? <section className="welcome"><div className="welcome-symbol"><Brand large /></div><p className="eyebrow">UM ESPAÇO PARA PENSAR ALÉM</p><h1>Por onde<br className="mobile-break" /> começamos?</h1><p className="welcome-description">Uma pergunta, uma ideia ou um novo ponto de vista.</p></section> : <div className="messages" role="log" aria-label="Mensagens da conversa">{messages.map((message) => <article className={`message message-${message.role}`} key={message.id}>{message.role === "assistant" && <div className="message-author"><Brand /><span>Salpe AI</span></div>}<div className="message-body">{message.role === "assistant" ? <MessageContent content={message.content} /> : <p>{message.content}</p>}</div>{message.role === "assistant" && !busy && <button className="icon-button copy-button" onClick={() => copy(message)} aria-label="Copiar resposta">{copied === message.id ? <Check size={16} /> : <Copy size={16} />}</button>}</article>)}{busy && messages.at(-1)?.role !== "assistant" && <div className="thinking" role="status"><Brand /><span>Organizando as ideias</span><i /><i /><i /></div>}</div>}
      </div>
      <div className={`composer-area ${messages.length === 0 ? "composer-welcome" : ""}`}>
        {error && <div className="chat-error" role="alert"><span>{error}</span><button className="icon-button" aria-label="Fechar aviso" onClick={() => setError("")}><X size={16} /></button></div>}
        <form className={`composer ${busy ? "is-generating" : ""}`} onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea id="chat-input" ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) { e.preventDefault(); send(); } }} placeholder="Pergunte qualquer coisa ao Salpe…" aria-label="Sua mensagem para o Salpe AI" maxLength={12000} rows={2} disabled={loadingChat} />
          <div className="composer-toolbar"><span className="composer-mode"><Sparkles size={15} />{currentModel.name}</span><div className="composer-actions"><span className="keyboard-hint">{draft.length > 10000 ? `${draft.length.toLocaleString("pt-BR")} / 12.000` : "Enter para enviar"}</span>{busy ? <button type="button" className="send-button stop-button" aria-label="Interromper resposta" onClick={() => abortRef.current?.abort()}><Square size={16} fill="currentColor" /></button> : <button type="submit" className="send-button" disabled={!draft.trim() || loadingChat || !session} aria-label="Enviar mensagem"><ArrowUp size={20} /></button>}</div></div>
        </form>
        {messages.length === 0 && <div className="suggestions">{suggestions.map(({ icon: Icon, title, detail, prompt }) => <button className="suggestion" key={title} onClick={() => { setDraft(prompt); inputRef.current?.focus(); }}><span className="suggestion-top"><Icon size={18} /><ArrowRight size={15} /></span><strong>{title}</strong><span>{detail}</span></button>)}</div>}
        <p className="composer-note">O Salpe pode cometer erros. Confira informações importantes.</p>
      </div>
      {messages.length === 0 && <div className="workspace-bottom"><span>MENOS RUÍDO. MAIS POSSIBILIDADES.</span><span>Feito para a sua curiosidade <span className="tiny-star">✳</span></span></div>}
    </main>
    <AuthDialog open={auth} mode={authMode} onModeChange={setAuthMode} onOpenChange={setAuth} onSuccess={loginSuccess} />
    <Dialog.Root open={Boolean(deleteId)} onOpenChange={(open) => { if (!open && !deleting) setDeleteId(null); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="auth-dialog confirm-dialog"><Dialog.Title>Excluir esta conversa?</Dialog.Title><Dialog.Description>As mensagens serão excluídas permanentemente da sua conta.</Dialog.Description><div className="confirm-actions"><Dialog.Close className="secondary-button" disabled={deleting}>Cancelar</Dialog.Close><button className="danger-button" disabled={deleting} onClick={deleteChat}>{deleting ? "Excluindo…" : "Excluir conversa"}</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
function LockIcon() { return <ShieldCheck size={15} />; }
