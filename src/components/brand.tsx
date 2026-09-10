export function Brand({ large = false }: { large?: boolean }) {
  return <span className={large ? "brand-mark brand-mark-large" : "brand-mark"} aria-hidden="true"><i /><i /><i /></span>;
}
