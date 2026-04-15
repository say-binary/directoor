"use client";

import { useState, useEffect, useCallback } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  FileText,
  LogOut,
  Trash2,
  Loader2,
  Shapes,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "@/lib/supabase";
import { ShapeLibrary } from "./ShapeLibrary";
import type { Editor } from "tldraw";

interface CanvasListItem {
  id: string;
  title: string;
  object_count: number;
  connection_count: number;
  updated_at: string;
}

interface SidebarProps {
  currentCanvasId: string | null;
  onSelectCanvas: (id: string) => void;
  onNewCanvas: () => void;
  editor: Editor | null;
}

type SidebarTab = "canvases" | "shapes";

export function Sidebar({ currentCanvasId, onSelectCanvas, onNewCanvas, editor }: SidebarProps) {
  const { user, signOut } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [canvases, setCanvases] = useState<CanvasListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [activeTab, setActiveTab] = useState<SidebarTab>("canvases");

  // Fetch canvases
  const fetchCanvases = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from("canvases")
        .select("id, title, object_count, connection_count, updated_at")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setCanvases(data ?? []);
    } catch (err) {
      console.error("Failed to fetch canvases:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCanvases();
  }, [fetchCanvases]);

  // Refresh list periodically (picks up auto-save updates)
  useEffect(() => {
    const interval = setInterval(fetchCanvases, 10000);
    return () => clearInterval(interval);
  }, [fetchCanvases]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this canvas permanently?")) return;
    setDeletingId(id);
    try {
      const { error } = await supabase.from("canvases").delete().eq("id", id);
      if (error) throw error;
      setCanvases((prev) => prev.filter((c) => c.id !== id));
      if (currentCanvasId === id) onNewCanvas();
    } catch (err) {
      console.error("Failed to delete canvas:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const startRename = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditingTitle(currentTitle || "Untitled Canvas");
  };

  const saveRename = async () => {
    if (!editingId) return;
    const trimmed = editingTitle.trim() || "Untitled Canvas";
    try {
      await supabase
        .from("canvases")
        .update({ title: trimmed })
        .eq("id", editingId);
      setCanvases((prev) =>
        prev.map((c) => (c.id === editingId ? { ...c, title: trimmed } : c)),
      );
    } catch (err) {
      console.error("Failed to rename:", err);
    }
    setEditingId(null);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  // ─── Collapsed view (icons only) ──────────────────────────────

  if (isCollapsed) {
    return (
      <div className="fixed left-0 top-0 z-[9996] flex h-full w-12 flex-col items-center gap-1 border-r border-slate-200 bg-white/95 py-3 backdrop-blur-sm">
        <button
          onClick={() => setIsCollapsed(false)}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          title="Expand sidebar"
        >
          <PanelLeftOpen size={18} />
        </button>

        <div className="my-2 h-px w-6 bg-slate-200" />

        <button
          onClick={onNewCanvas}
          className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
          title="New canvas"
        >
          <Plus size={18} />
        </button>

        <button
          onClick={() => { setActiveTab("canvases"); setIsCollapsed(false); }}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          title="View canvases"
        >
          <FileText size={18} />
        </button>

        <button
          onClick={() => { setActiveTab("shapes"); setIsCollapsed(false); }}
          className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          title="Shape library"
        >
          <Shapes size={18} />
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* User avatar */}
        {user?.user_metadata?.avatar_url && (
          <img
            src={user.user_metadata.avatar_url as string}
            alt=""
            className="h-7 w-7 rounded-full ring-1 ring-slate-200"
          />
        )}

        <button
          onClick={signOut}
          className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    );
  }

  // ─── Expanded view ─────────────────────────────────────────────

  return (
    <div className="fixed left-0 top-0 z-[9996] flex h-full w-64 flex-col border-r border-slate-200 bg-white/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">Directoor</h2>
        <button
          onClick={() => setIsCollapsed(true)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          title="Collapse sidebar"
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex border-b border-slate-100 px-1 pt-1">
        <button
          onClick={() => setActiveTab("canvases")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium rounded-t-lg transition-colors ${
            activeTab === "canvases"
              ? "text-blue-600 bg-blue-50 border-b-2 border-blue-500 -mb-px"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <FileText size={13} />
          Canvases
        </button>
        <button
          onClick={() => setActiveTab("shapes")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium rounded-t-lg transition-colors ${
            activeTab === "shapes"
              ? "text-blue-600 bg-blue-50 border-b-2 border-blue-500 -mb-px"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <Shapes size={13} />
          Shapes
        </button>
      </div>

      {/* Shape library tab */}
      {activeTab === "shapes" && (
        <div className="flex-1 flex flex-col min-h-0">
          <ShapeLibrary editor={editor} />
        </div>
      )}

      {/* Canvases tab */}
      {activeTab === "canvases" && (
        <>
          <div className="px-3 py-2">
            <button
              onClick={onNewCanvas}
              className="flex w-full items-center gap-2 rounded-xl bg-blue-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
            >
              <Plus size={16} />
              New Canvas
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-slate-300" />
              </div>
            ) : canvases.length === 0 ? (
              <p className="px-2 py-8 text-center text-xs text-slate-400">
                No canvases yet. Create your first one!
              </p>
            ) : (
              <div className="space-y-0.5">
                {canvases.map((canvas) => (
                  <div
                    key={canvas.id}
                    onClick={() => onSelectCanvas(canvas.id)}
                    className={`group flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 transition-colors ${
                      currentCanvasId === canvas.id
                        ? "bg-blue-50 ring-1 ring-blue-200"
                        : "hover:bg-slate-50"
                    }`}
                  >
                    <FileText
                      size={14}
                      className={`mt-0.5 shrink-0 ${
                        currentCanvasId === canvas.id ? "text-blue-500" : "text-slate-400"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      {editingId === canvas.id ? (
                        <input
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onBlur={saveRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRename();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="w-full rounded border border-blue-300 bg-white px-1 py-0.5 text-sm font-medium text-slate-700 outline-none focus:ring-1 focus:ring-blue-400"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <p
                          className={`truncate text-sm font-medium ${
                            currentCanvasId === canvas.id ? "text-blue-700" : "text-slate-700"
                          }`}
                          onDoubleClick={(e) => startRename(canvas.id, canvas.title, e)}
                          title="Double-click to rename"
                        >
                          {canvas.title || "Untitled Canvas"}
                        </p>
                      )}
                      <p className="text-xs text-slate-400">
                        {canvas.object_count} objects · {formatDate(canvas.updated_at)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDelete(canvas.id, e)}
                      className="shrink-0 rounded p-1 text-slate-300 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                      title="Delete canvas"
                    >
                      {deletingId === canvas.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Trash2 size={12} />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Footer — user info + logout */}
      <div className="border-t border-slate-100 px-3 py-2.5">
        <div className="flex items-center gap-2">
          {user?.user_metadata?.avatar_url && (
            <img
              src={user.user_metadata.avatar_url as string}
              alt=""
              className="h-7 w-7 rounded-full ring-1 ring-slate-200"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-slate-700">
              {user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User"}
            </p>
            <p className="truncate text-xs text-slate-400">{user?.email}</p>
          </div>
          <button
            onClick={signOut}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
            title="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
