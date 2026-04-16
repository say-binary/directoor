"use client";

import { useState } from "react";
import { Sparkles, Loader2, Settings } from "lucide-react";
import { apiFetch } from "@/lib/api-client";

interface BillingButtonProps {
  tier: "free" | "pro";
}

/**
 * BillingButton — sidebar footer pill. Shows "Upgrade to Pro" for free
 * users (opens Stripe Checkout) and "Manage billing" for Pro users
 * (opens Stripe Customer Portal). Gracefully shows "Billing soon" if
 * the server returns 503 (Stripe not configured yet).
 */
export function BillingButton({ tier }: BillingButtonProps) {
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");

  const handleClick = async () => {
    setBusy(true);
    setHint("");
    try {
      const path = tier === "pro" ? "/api/stripe/portal" : "/api/stripe/checkout";
      const res = await apiFetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl: window.location.href }),
      });
      if (res.status === 503) {
        setHint("Billing coming soon");
        return;
      }
      const j = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !j.url) {
        setHint(j.error ?? "Failed to start checkout");
        return;
      }
      window.location.href = j.url;
    } catch {
      setHint("Network error");
    } finally {
      setBusy(false);
    }
  };

  if (tier === "pro") {
    return (
      <div className="flex flex-col gap-1">
        <button
          onClick={handleClick}
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Settings size={12} />}
          Manage billing
        </button>
        {hint && <p className="text-center text-[10px] text-slate-400">{hint}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleClick}
        disabled={busy}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-violet-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:shadow-md disabled:opacity-50"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
        Upgrade to Pro
      </button>
      {hint && <p className="text-center text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}
