import { documentMotifOpacity, documentMotifTiles } from "./document-motif";

export function DocumentMotif() {
  return (
    <span
      aria-hidden="true"
      className="inline-grid shrink-0 grid-cols-5 gap-0.5 text-brand-accent"
    >
      {documentMotifTiles.flat().map((tile, index) => (
        <span key={index} className="size-2 bg-current" style={{ opacity: documentMotifOpacity[tile] }} />
      ))}
    </span>
  );
}
