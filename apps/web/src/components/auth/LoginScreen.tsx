"use client";

import { useAuth } from "./AuthProvider";

interface LoginScreenProps {
  onDevBypass?: () => void;
}

export function LoginScreen({ onDevBypass }: LoginScreenProps) {
  const { signInWithGoogle, loading } = useAuth();

  return (
    <div className="flex h-full items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg ring-1 ring-slate-900/5">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Directoor</h1>
          <p className="mt-2 text-sm text-slate-500">
            AI-native canvas for architecture diagrams
          </p>
        </div>

        <button
          onClick={signInWithGoogle}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Continue with Google
        </button>

        <p className="mt-4 text-center text-xs text-slate-400">
          No password needed. Sign in securely with Google.
        </p>

        {onDevBypass && (
          <button
            onClick={onDevBypass}
            className="mt-3 w-full rounded-lg border border-dashed border-slate-300 px-4 py-2 text-xs text-slate-400 transition-colors hover:border-slate-400 hover:text-slate-500"
          >
            Skip login (dev mode)
          </button>
        )}
      </div>
    </div>
  );
}
