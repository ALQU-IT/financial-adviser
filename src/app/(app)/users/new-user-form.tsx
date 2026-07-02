"use client";

import { useState, useTransition } from "react";
import { createUser } from "./actions";

export function NewUserForm() {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const res = await createUser(formData);
      if (res?.error) {
        setError(res.error);
        setOk(false);
      } else {
        setError(null);
        setOk(true);
        form.reset();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Username</span>
        <input
          name="username"
          required
          minLength={3}
          className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Password</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add user"}
      </button>
      {error && (
        <p className="w-full text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {ok && <p className="w-full text-sm text-emerald-700">User created.</p>}
    </form>
  );
}
