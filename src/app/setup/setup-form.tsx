"use client";

import { useState, useTransition } from "react";
import { setupAdmin } from "../login/actions";

export function SetupForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await setupAdmin(formData);
      if (res?.error) setError(res.error);
    });
  }

  const inputCls =
    "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Username</span>
        <input
          name="username"
          autoComplete="username"
          required
          minLength={3}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">
          Confirm password
        </span>
        <input
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={inputCls}
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
        {pending ? "Creating…" : "Create admin account"}
      </button>
    </form>
  );
}
