/**
 * A skeleton matching the eventual layout, never a generic spinner, for
 * anything that could take over 300ms. Compose with width/height via
 * className; screens build their own skeleton layout from this block.
 * Renders borderless tonal silhouettes matching Samsung One UI / M3 guidelines.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-shimmer border-none rounded-[var(--radius-card)] ${className}`}
    />
  );
}
