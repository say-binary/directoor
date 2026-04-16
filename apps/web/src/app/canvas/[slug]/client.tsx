"use client";

import dynamic from "next/dynamic";

/**
 * Client wrapper that loads the tldraw-using viewer with `ssr: false`.
 * tldraw needs `window` so it can't render on the server.
 */
const PublicCanvasViewer = dynamic(
  () => import("@/components/canvas/PublicCanvasViewer").then((m) => m.PublicCanvasViewer),
  { ssr: false },
);

export function PublicCanvasClient({ slug }: { slug: string }) {
  return <PublicCanvasViewer slug={slug} />;
}
