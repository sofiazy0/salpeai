import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSameOrigin, chatSchema, credentialsSchema, providerUrl, readJson, rateKey } from "../src/lib/security";
import { parseCompletionStream } from "../src/lib/provider-stream";

test("CSRF checks reject missing headers, cross-site requests and untrusted origins", () => {
  const origins = new Set(["https://salpe.example"]);
  for (const headers of ([{}, { origin: "https://evil.example", "x-salpe-request": "1" }, { origin: "https://salpe.example" }, { origin: "https://salpe.example", "x-salpe-request": "1", "sec-fetch-site": "cross-site" }] as Record<string,string>[])) assert.throws(() => assertSameOrigin(new Request("https://salpe.example/api/auth", { headers }), origins));
  assert.doesNotThrow(() => assertSameOrigin(new Request("https://salpe.example/api/auth", { headers: { origin: "https://salpe.example", "x-salpe-request": "1" } }), origins));
});
test("limits actual body bytes even without a content-length header", async () => {
  const request = new Request("https://salpe.example", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "x".repeat(1000) }) });
  await assert.rejects(readJson(request, 50), /tamanho/);
});
test("rejects unexpected chat roles, message arrays and invalid conversation IDs", () => {
  const valid = { conversationId: null, message: "Olá", model: "example" };
  assert.equal(chatSchema.safeParse(valid).success, true);
  for (const invalid of [{ ...valid, role: "system" }, { ...valid, messages: [] }, { ...valid, conversationId: "other-user" }, { ...valid, message: " " }, { ...valid, message: "a".repeat(12001) }]) assert.equal(chatSchema.safeParse(invalid).success, false);
});
test("signup requires a name and long password", () => {
  const data = { action: "signup", email: "a@example.com", password: "short", name: "Ana" };
  assert.equal(credentialsSchema.safeParse(data).success, false);
  assert.equal(credentialsSchema.safeParse({ ...data, password: "a-long-example-password" }).success, true);
});
test("provider endpoint is restricted and never follows arbitrary user URLs", () => {
  for (const url of ["http://anymodel.org/a", "https://anymodel.org.evil.example/a", "https://localhost/a", "https://anymodel.org/a?key=secret", "https://user:secret@anymodel.org/a", "https://anymodel.org:8443/a"]) assert.throws(() => providerUrl(url));
  assert.equal(providerUrl("https://anymodel.org/verified-path").hostname, "anymodel.org");
  assert.notEqual(rateKey("same", "a"), rateKey("same", "b"));
});
test("SSE decoding survives split UTF-8, arbitrary network chunking and CRLF", async () => {
  const encoded = new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Olá 🌍"}}]}\r\n\r\ndata: [DONE]\r\n\r\n');
  const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of encoded) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
  let output = ""; for await (const chunk of parseCompletionStream(stream)) output += chunk;
  assert.equal(output, "Olá 🌍");
});
test("truncated provider responses are not reported as complete", async () => {
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n')); controller.close(); } });
  await assert.rejects(async () => { for await (const _ of parseCompletionStream(stream)) { /* consume */ } }, /interrompida/);
});
