"use client";

import { supabase } from "./supabase";
import type { CanvasState } from "@directoor/core";

export interface CanvasRecord {
  id: string;
  user_id: string;
  title: string;
  canvas_state: CanvasState;
  object_count: number;
  connection_count: number;
  animation_sequence: number[];
  is_public: boolean;
  public_slug: string | null;
  created_at: string;
  updated_at: string;
}

/** List all canvases for the current user */
export async function listCanvases(): Promise<CanvasRecord[]> {
  const { data, error } = await supabase
    .from("canvases")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data as CanvasRecord[];
}

/** Get a single canvas by ID */
export async function getCanvas(id: string): Promise<CanvasRecord | null> {
  const { data, error } = await supabase
    .from("canvases")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // Not found
    throw error;
  }
  return data as CanvasRecord;
}

/** Get a public canvas by slug */
export async function getPublicCanvas(slug: string): Promise<CanvasRecord | null> {
  const { data, error } = await supabase
    .from("canvases")
    .select("*")
    .eq("public_slug", slug)
    .eq("is_public", true)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as CanvasRecord;
}

/** Create a new canvas */
export async function createCanvas(
  userId: string,
  title: string = "Untitled Canvas",
  initialState?: CanvasState,
): Promise<CanvasRecord> {
  const { data, error } = await supabase
    .from("canvases")
    .insert({
      user_id: userId,
      title,
      canvas_state: initialState ?? {},
    })
    .select()
    .single();

  if (error) throw error;
  return data as CanvasRecord;
}

/** Save canvas state (auto-save) */
export async function saveCanvas(
  canvasId: string,
  canvasState: CanvasState,
  animationSequence?: number[],
): Promise<void> {
  const objectCount = Object.keys(canvasState.objects ?? {}).length;
  const connectionCount = Object.keys(canvasState.connections ?? {}).length;

  const { error } = await supabase
    .from("canvases")
    .update({
      canvas_state: canvasState,
      title: canvasState.title || "Untitled Canvas",
      object_count: objectCount,
      connection_count: connectionCount,
      ...(animationSequence !== undefined && { animation_sequence: animationSequence }),
    })
    .eq("id", canvasId);

  if (error) throw error;
}

/** Delete a canvas */
export async function deleteCanvas(canvasId: string): Promise<void> {
  const { error } = await supabase
    .from("canvases")
    .delete()
    .eq("id", canvasId);

  if (error) throw error;
}

/** Toggle canvas public visibility */
export async function toggleCanvasPublic(
  canvasId: string,
  isPublic: boolean,
): Promise<string | null> {
  const slug = isPublic
    ? `${canvasId.slice(0, 8)}-${Date.now().toString(36)}`
    : null;

  const { error } = await supabase
    .from("canvases")
    .update({ is_public: isPublic, public_slug: slug })
    .eq("id", canvasId);

  if (error) throw error;
  return slug;
}
