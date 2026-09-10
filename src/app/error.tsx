"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="fallback-page"><h1>Vamos tentar de novo?</h1><p>Não foi possível abrir esta página.</p><button className="primary-button" onClick={reset}>Tentar novamente</button></main>;
}
