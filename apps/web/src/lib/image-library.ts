"use client";

import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";

/**
 * Image library — a per-user collection of every web image the user has
 * pulled onto a canvas. Backed by localStorage for instant access and
 * Supabase for cross-device sync. Items are deduplicated by id.
 *
 * Ordering: most recently added first.
 */

export interface LibraryImage {
  id: string;
  url: string;
  thumbnail: string;
  title: string;
  width: number;
  height: number;
  creator?: string;
  license?: string;
  source?: string;
  /** The query the user typed when this image was found */
  query: string;
  /** Timestamp (ms) when added to library */
  addedAt: number;
}

const STORAGE_KEY = "directoor:image-library:v1";

let state: LibraryImage[] = [];
let initialized = false;
const listeners = new Set<() => void>();

function loadFromStorage(): LibraryImage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LibraryImage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistToStorage() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("Image library: localStorage write failed", err);
  }
}

function notify() {
  for (const l of listeners) l();
}

function setState(next: LibraryImage[]) {
  state = next;
  persistToStorage();
  notify();
}

async function syncFromSupabase() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("user_images")
      .select("image_id, url, thumbnail, title, width, height, creator, license, source, query, added_at")
      .order("added_at", { ascending: false });
    if (error) {
      // Table may not exist yet — silently degrade to localStorage-only
      if (error.code !== "PGRST205" && error.code !== "42P01") {
        console.warn("Image library Supabase fetch:", error.message);
      }
      return;
    }
    if (data && data.length > 0) {
      const merged = new Map<string, LibraryImage>();
      // Start with local entries (they may have been added offline)
      for (const item of state) merged.set(item.id, item);
      // Overlay remote entries
      for (const row of data) {
        const r = row as Record<string, unknown>;
        const id = String(r.image_id);
        merged.set(id, {
          id,
          url: String(r.url ?? ""),
          thumbnail: String(r.thumbnail ?? r.url ?? ""),
          title: String(r.title ?? ""),
          width: Number(r.width ?? 0),
          height: Number(r.height ?? 0),
          creator: r.creator ? String(r.creator) : undefined,
          license: r.license ? String(r.license) : undefined,
          source: r.source ? String(r.source) : undefined,
          query: String(r.query ?? ""),
          addedAt: r.added_at ? new Date(String(r.added_at)).getTime() : Date.now(),
        });
      }
      const sorted = Array.from(merged.values()).sort((a, b) => b.addedAt - a.addedAt);
      setState(sorted);
    }
  } catch (err) {
    console.warn("Image library sync error:", err);
  }
}

async function pushToSupabase(items: LibraryImage[]) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const rows = items.map((i) => ({
      user_id: user.id,
      image_id: i.id,
      url: i.url,
      thumbnail: i.thumbnail,
      title: i.title,
      width: i.width,
      height: i.height,
      creator: i.creator ?? null,
      license: i.license ?? null,
      source: i.source ?? null,
      query: i.query,
      added_at: new Date(i.addedAt).toISOString(),
    }));
    const { error } = await supabase.from("user_images").upsert(rows, {
      onConflict: "user_id,image_id",
      ignoreDuplicates: false,
    });
    if (error && error.code !== "PGRST205" && error.code !== "42P01") {
      console.warn("Image library Supabase upsert:", error.message);
    }
  } catch (err) {
    console.warn("Image library push error:", err);
  }
}

function ensureInitialized() {
  if (initialized) return;
  initialized = true;
  state = loadFromStorage();
  // Fire-and-forget remote sync
  void syncFromSupabase();
}

const api = {
  getSnapshot: (): LibraryImage[] => {
    ensureInitialized();
    return state;
  },
  subscribe: (l: () => void): (() => void) => {
    ensureInitialized();
    listeners.add(l);
    return () => { listeners.delete(l); };
  },
  addMany: (items: LibraryImage[]) => {
    ensureInitialized();
    if (items.length === 0) return;
    const map = new Map(state.map((i) => [i.id, i]));
    for (const item of items) map.set(item.id, item);
    const sorted = Array.from(map.values()).sort((a, b) => b.addedAt - a.addedAt);
    setState(sorted);
    void pushToSupabase(items);
  },
  remove: (id: string) => {
    ensureInitialized();
    setState(state.filter((i) => i.id !== id));
    void (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        await supabase.from("user_images").delete().eq("user_id", user.id).eq("image_id", id);
      } catch {
        // best effort
      }
    })();
  },
  clear: () => {
    ensureInitialized();
    setState([]);
  },
};

const SERVER_SNAPSHOT: LibraryImage[] = [];

/**
 * Hook: subscribe to the image library.
 *
 * Usage:
 *   const images = useImageLibrary();              // get all
 *   const add    = useImageLibrary((s) => s.addMany);  // get an action
 */
export function useImageLibrary(): LibraryImage[];
export function useImageLibrary<T>(selector: (api: typeof apiBindings) => T): T;
export function useImageLibrary<T>(selector?: (api: typeof apiBindings) => T): T | LibraryImage[] {
  const snapshot = useSyncExternalStore(
    api.subscribe,
    api.getSnapshot,
    () => SERVER_SNAPSHOT,
  );
  if (selector) return selector(apiBindings);
  return snapshot;
}

const apiBindings = {
  addMany: api.addMany,
  remove: api.remove,
  clear: api.clear,
};

export const imageLibrary = api;
