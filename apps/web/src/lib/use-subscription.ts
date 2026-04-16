"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { User } from "@supabase/supabase-js";

/**
 * useSubscription — client-side reader for the user's tier. Defaults
 * to "free" until the row loads or in error cases. Refetches on auth
 * change and when the upgrade/portal flow returns to the app.
 */

export type Tier = "free" | "pro";

export interface SubscriptionState {
  tier: Tier;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  loading: boolean;
}

const DEFAULT: SubscriptionState = {
  tier: "free",
  status: "active",
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  loading: true,
};

export function useSubscription(user: User | null | undefined): SubscriptionState {
  const [state, setState] = useState<SubscriptionState>(DEFAULT);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        setState({ ...DEFAULT, loading: false });
        return;
      }
      try {
        const { data, error } = await supabase
          .from("subscriptions")
          .select("tier, status, current_period_end, cancel_at_period_end")
          .eq("user_id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          setState({ ...DEFAULT, loading: false });
        } else {
          const row = data as {
            tier?: string;
            status?: string;
            current_period_end?: string;
            cancel_at_period_end?: boolean;
          };
          const isProActive =
            row.tier === "pro" && (row.status === "active" || row.status === "trialing");
          setState({
            tier: isProActive ? "pro" : "free",
            status: row.status ?? "active",
            currentPeriodEnd: row.current_period_end ?? null,
            cancelAtPeriodEnd: !!row.cancel_at_period_end,
            loading: false,
          });
        }
      } catch {
        if (!cancelled) setState({ ...DEFAULT, loading: false });
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  return state;
}
