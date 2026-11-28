import type { ReactNode } from "react";

export type EmptySceneKind = "shelf" | "shop" | "records" | "contacts" | "search";

const scenes: Record<EmptySceneKind, ReactNode> = {
  shelf: (
    <>
      <rect x="29" y="24" width="104" height="54" rx="6" fill="var(--scene-paper)" />
      <path d="M33 78V28m96 50V28M33 50h96M33 74h96" />
      <path d="M45 49V36h22v13m7 0V31h17v18m13 24V57h17v16M48 73V60h31v13" fill="var(--scene-tint)" />
      <path d="M49 41h8m23-4h5m-29 28h14m39-3h7" />
    </>
  ),
  shop: (
    <>
      <path d="M37 44h86v31H37z" fill="var(--scene-paper)" />
      <path d="M48 52h32v16H48zm46 0h15v23H94z" fill="var(--scene-tint)" />
      <path d="m39 25-9 15a9 9 0 0 0 17 6 9 9 0 0 0 16 0 9 9 0 0 0 16 0 9 9 0 0 0 16 0 9 9 0 0 0 16 0 9 9 0 0 0 17-6l-9-15z" fill="var(--scene-tint)" />
      <path d="m54 26-7 20m24-20-8 20m16-20v20m8-20 8 20m10-20 6 20M53 60h22" />
      <path d="M25 74c-6-2-9-6-9-13 6 1 10 5 10 12m0 0c0-7 3-11 8-14 1 6-2 12-8 15" fill="var(--scene-tint)" />
    </>
  ),
  records: (
    <>
      <path d="m39 39 38-8 12 45-38 8z" fill="var(--scene-tint)" />
      <path d="M61 23h53v55l-7-4-6 4-7-4-7 4-7-4-6 4-6-4-7 4z" fill="var(--scene-paper)" />
      <path d="M72 36h30m-30 9h19m-19 9h30m-30 11h10m14 0h6" />
      <path d="m119 68 8-13 5 3-8 13-6 4z" fill="var(--scene-tint)" />
    </>
  ),
  contacts: (
    <>
      <rect x="37" y="36" width="68" height="45" rx="5" fill="var(--scene-tint)" />
      <rect x="54" y="23" width="72" height="48" rx="5" fill="var(--scene-paper)" />
      <circle cx="72" cy="40" r="5" fill="var(--scene-tint)" />
      <path d="M62 59v-2a10 10 0 0 1 20 0v2zm29-20h23m-23 9h17m-17 9h20" />
    </>
  ),
  search: (
    <>
      <rect x="39" y="25" width="68" height="52" rx="5" fill="var(--scene-paper)" />
      <path d="M39 37h68m-58 9h17m-17 9h12m-12 9h16" />
      <circle cx="92" cy="56" r="15" fill="var(--scene-tint)" />
      <path d="m103 67 16 13m-35-23a8 8 0 0 1 8-8m-7-24h12" />
    </>
  ),
};

export function EmptyScene({ scene, className }: { scene: EmptySceneKind; className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 160 100" className={className}>
      <path fill="var(--scene-tint)" d="M18 66c-7-18 5-31 19-42 14-12 43-15 72-10 23 4 38 20 35 41-4 25-29 34-68 35-29 0-52-7-58-24Z" />
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {scenes[scene]}
      </g>
    </svg>
  );
}
