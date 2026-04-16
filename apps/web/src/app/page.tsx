"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoginScreen } from "@/components/auth/LoginScreen";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { supabase } from "@/lib/supabase";
import { useSubscription } from "@/lib/use-subscription";

const DirectoorCanvas = dynamic(
  () =>
    import("@/components/canvas/DirectoorCanvas").then(
      (mod) => mod.DirectoorCanvas,
    ),
  { ssr: false },
);

export default function Home() {
  const { user, loading } = useAuth();
  const subscription = useSubscription(user);
  const isDev = process.env.NODE_ENV === "development";
  const [devBypass, setDevBypass] = useState(false);

  const [currentCanvasId, setCurrentCanvasId] = useState<string | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);

  // Editor instance shared between Canvas and Sidebar (for shape library)
  const [editor, setEditor] = useState<import("tldraw").Editor | null>(null);

  // Ref to the save function exposed by DirectoorCanvas
  const saveFnRef = useRef<(() => Promise<void>) | null>(null);

  const isAuthenticated = !!user || devBypass;

  // On login, load most recent canvas or create new
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const initCanvas = async () => {
      try {
        const { data, error } = await supabase
          .from("canvases")
          .select("id")
          .order("updated_at", { ascending: false })
          .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
          setCurrentCanvasId(data[0]!.id);
        } else {
          await createNewCanvas();
        }
      } catch (err) {
        console.error("Failed to init canvas:", err);
      }
      setCanvasReady(true);
    };

    initCanvas();
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (devBypass && !user) setCanvasReady(true);
  }, [devBypass, user]);

  const createNewCanvas = useCallback(async () => {
    if (!user) {
      setCurrentCanvasId(`dev-${Date.now()}`);
      return;
    }

    // Free-tier cap: max 3 canvases
    if (subscription.tier === "free") {
      try {
        const { count } = await supabase
          .from("canvases")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);
        if ((count ?? 0) >= 3) {
          alert("Free plan is limited to 3 canvases. Upgrade to Pro for unlimited.");
          return;
        }
      } catch {
        // best-effort — don't block creation on count error
      }
    }

    // Save current canvas first
    if (saveFnRef.current) {
      await saveFnRef.current();
    }

    try {
      const { data, error } = await supabase
        .from("canvases")
        .insert({
          user_id: user.id,
          title: "Untitled Canvas",
          canvas_state: {},
        })
        .select("id")
        .single();

      if (error) throw error;
      setCurrentCanvasId(data.id);
    } catch (err) {
      console.error("Failed to create canvas:", err);
    }
  }, [user, subscription.tier]);

  const handleSelectCanvas = useCallback(async (id: string) => {
    if (id === currentCanvasId) return;

    // Save current canvas before switching
    if (saveFnRef.current) {
      await saveFnRef.current();
    }

    setCurrentCanvasId(id);
  }, [currentCanvasId]);

  const handleSaveReady = useCallback((fn: () => Promise<void>) => {
    saveFnRef.current = fn;
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen onDevBypass={isDev ? () => setDevBypass(true) : undefined} />;
  }

  return (
    <div className="flex h-full w-full">
      {user && (
        <Sidebar
          currentCanvasId={currentCanvasId}
          onSelectCanvas={handleSelectCanvas}
          onNewCanvas={createNewCanvas}
          editor={editor}
          tier={subscription.tier}
        />
      )}

      <main className="h-full flex-1">
        {canvasReady || devBypass ? (
          <DirectoorCanvas
            key={currentCanvasId ?? "default"}
            canvasId={currentCanvasId}
            userId={user?.id}
            tier={subscription.tier}
            onEditorReady={setEditor}
            onSaveReady={handleSaveReady}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
          </div>
        )}
      </main>
    </div>
  );
}
