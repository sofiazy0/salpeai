"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, Eye, EyeOff, LoaderCircle, LockKeyhole, X } from "lucide-react";
import { useState } from "react";
import { Brand } from "./brand";
import { api } from "@/lib/client";
import type { User } from "@/lib/types";

export function AuthDialog({ open, mode, onOpenChange, onModeChange, onSuccess }: { open: boolean; mode: "login" | "signup"; onOpenChange: (v: boolean) => void; onModeChange: (v: "login" | "signup") => void; onSuccess: (user: User) => void }) {
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api<{ user?: User; message?: string }>("/api/auth", { method: "POST", body: JSON.stringify({ action: mode, email: form.get("email"), password: form.get("password"), name: form.get("name") || undefined }) });
      if (result.user) { onSuccess(result.user); onOpenChange(false); }
      else setNotice(result.message || "Confira seu e-mail para confirmar a conta. Depois, faça login.");
    } catch (e) { setError(e instanceof Error ? e.message : "Tente novamente."); }
    finally { setBusy(false); }
  }
  function changeMode() { setError(""); setNotice(""); onModeChange(mode === "login" ? "signup" : "login"); }
  return <Dialog.Root open={open} onOpenChange={(v) => { if (!busy) { setError(""); setNotice(""); onOpenChange(v); } }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="auth-dialog">
    <Dialog.Close className="icon-button dialog-close" aria-label="Fechar"><X size={20} /></Dialog.Close>
    <Brand /><Dialog.Title>{mode === "login" ? "Bom ter você de volta." : "Dê espaço às suas ideias."}</Dialog.Title>
    <Dialog.Description>{mode === "login" ? "Entre para continuar suas conversas." : "Crie sua conta para conversar e salvar seu histórico."}</Dialog.Description>
    <form onSubmit={submit} className="auth-form" key={mode}>
      {mode === "signup" && <label>Como podemos chamar você?<input name="name" autoComplete="name" placeholder="Seu nome" minLength={2} maxLength={60} required /></label>}
      <label>E-mail<input name="email" type="email" autoComplete="email" placeholder="voce@exemplo.com" maxLength={254} required /></label>
      <label>Senha<span className="password-input"><input name="password" type={visible ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "signup" ? "Pelo menos 12 caracteres" : "Sua senha"} minLength={mode === "signup" ? 12 : 1} maxLength={128} required /><button type="button" className="icon-button" aria-label={visible ? "Ocultar senha" : "Mostrar senha"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>
      {mode === "signup" && <p className="field-hint">Use uma frase longa e uma senha exclusiva para esta conta.</p>}
      {error && <p className="form-message error" role="alert">{error}</p>}{notice && <p className="form-message success" role="status">{notice}</p>}
      <button className="primary-button auth-submit" disabled={busy}>{busy ? <LoaderCircle size={18} className="spin" /> : <>{mode === "login" ? "Entrar" : "Criar conta"}<ArrowRight size={18} /></>}</button>
    </form>
    <p className="auth-switch">{mode === "login" ? "Ainda não tem conta?" : "Já tem uma conta?"} <button type="button" onClick={changeMode} disabled={busy}>{mode === "login" ? "Cadastre-se" : "Entrar"}</button></p>
    <div className="auth-footnote"><LockKeyhole size={14} /> Seu histórico é vinculado à sua conta.</div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
