"use client";

import { useState, useTransition } from "react";
import { login } from "./actions";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await login(formData);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Username</span>
        <input
          name="username"
          autoComplete="username"
          required
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </label>
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
