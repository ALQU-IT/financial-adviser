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
    "field mt-1";

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-primary">Username</span>
        <input
          name="username"
          autoComplete="username"
          required
          minLength={3}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-primary">Password</span>
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
        <span className="text-sm font-medium text-primary">
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
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="btn-primary w-full"
      >
        {pending ? "Creating…" : "Create admin account"}
      </button>
    </form>
  );
}
