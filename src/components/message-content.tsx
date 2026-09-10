"use client";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MessageContent({ content }: { content: string }) {
  return <div className="markdown"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{
    a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>,
    img: ({ alt }) => <span className="image-omitted">[Imagem: {alt || "sem descrição"}]</span>,
  }}>{content}</Markdown></div>;
}
