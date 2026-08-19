/**
 * A skeleton matching the eventual layout, never a generic spinner, for
 * anything that could take over 300ms. Compose with width/height via
 * className; screens build their own skeleton layout from this block.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-shimmer rounded-[var(--radius-card)] ${className}`}
    />
  );
}
