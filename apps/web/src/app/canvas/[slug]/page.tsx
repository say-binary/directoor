import type { Metadata } from "next";
import { PublicCanvasClient } from "./client";

interface PageProps {
  // Next 16: params is async
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: "Shared canvas · Directoor",
    description: "An interactive canvas shared via Directoor.",
    openGraph: {
      title: "Shared canvas · Directoor",
      url: `/canvas/${slug}`,
    },
  };
}

export default async function PublicCanvasPage({ params }: PageProps) {
  const { slug } = await params;
  return <PublicCanvasClient slug={slug} />;
}
