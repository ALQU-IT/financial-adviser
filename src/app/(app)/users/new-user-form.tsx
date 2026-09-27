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
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="text-sm font-medium text-primary">Username</span>
        <input
          name="username"
          required
          minLength={3}
          className="field mt-1 block w-auto"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-primary">Password</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          className="field mt-1 block w-auto"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="btn-primary"
      >
        {pending ? "Adding…" : "Add user"}
      </button>
      {error && (
        <p className="w-full text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {ok && <p className="w-full text-sm text-success">User created.</p>}
    </form>
  );
}
