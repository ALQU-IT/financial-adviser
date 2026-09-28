"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { KeyRound } from "lucide-react";
import { cancelVerify, keyLoginOptions, keyLoginVerify, verifyCode } from "./actions";

export function VerifyForm({
  hasTotp,
  hasKeys,
  keysUsable,
}: {
  hasTotp: boolean;
  hasKeys: boolean;
  keysUsable: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Users with only a security key can still fall back to a recovery code.
  // With keys unusable here (opened by IP) the code box must be there too.
  const [showCode, setShowCode] = useState(hasTotp || !hasKeys || !keysUsable);
  const [recovery, setRecovery] = useState(!hasTotp);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showCode) input.current?.focus();
  }, [showCode, recovery]);

  function handle(res: { error: string; expired?: boolean } | void) {
    if (!res) return;
    setError(res.error);
    if (res.expired) setTimeout(() => router.push("/login"), 1500);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => handle(await verifyCode(formData)));
  }

  function useKey() {
    setError(null);
    startTransition(async () => {
      const opts = await keyLoginOptions();
      if (!opts.ok) return handle(opts);
      let response;
      try {
        response = await startAuthentication({ optionsJSON: opts.options });
      } catch {
        setError("The security key prompt was cancelled or timed out.");
        return;
      }
      handle(await keyLoginVerify(response));
    });
  }

  return (
    <div className="mt-6 space-y-4">
      {hasKeys &&
        (keysUsable ? (
          <button
            type="button"
            onClick={useKey}
            disabled={pending}
            className="btn-primary w-full"
          >
            <KeyRound className="h-4 w-4" />
            {pending ? "Waiting for security key…" : "Use security key"}
          </button>
        ) : (
          <p className="rounded-lg bg-warning-bg p-3 text-xs text-warning">
            Security keys only work when you open the app by its hostname
            (e.g. https://nas.local:3443), not an IP address. Use a code
            instead.
          </p>
        ))}

      {hasKeys && !showCode && (
        <button
          type="button"
          onClick={() => {
            setShowCode(true);
            setRecovery(!hasTotp);
          }}
          className="w-full text-center text-sm text-secondary hover:text-primary"
        >
          {hasTotp ? "Use a code instead" : "Use a recovery code"}
        </button>
      )}

      {showCode && (
        <form onSubmit={onSubmit} className="space-y-4">
          {hasKeys && keysUsable && (
            <div className="flex items-center gap-3 text-xs text-subdued">
              <span className="h-px flex-1 bg-divider" />
              or
              <span className="h-px flex-1 bg-divider" />
            </div>
          )}
          <label className="block">
            <span className="text-sm font-medium text-primary">
              {recovery ? "Recovery code" : "Authentication code"}
            </span>
            <input
              ref={input}
              key={recovery ? "rec" : "totp"}
              name="code"
              required
              autoComplete="one-time-code"
              inputMode={recovery ? "text" : "numeric"}
              placeholder={recovery ? "XXXXX-XXXXX" : "123456"}
              maxLength={recovery ? 11 : 7}
              className="field mt-1 text-center font-mono text-lg tracking-widest"
            />
          </label>
          <button type="submit" disabled={pending} className="btn-primary w-full">
            {pending ? "Checking…" : "Verify"}
          </button>
          {hasTotp && (
            <button
              type="button"
              onClick={() => setRecovery((r) => !r)}
              className="w-full text-center text-sm text-secondary hover:text-primary"
            >
              {recovery ? "Use authenticator code" : "Lost your device? Use a recovery code"}
            </button>
          )}
        </form>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <form action={cancelVerify}>
        <button type="submit" className="w-full text-center text-xs text-subdued hover:text-secondary">
          Cancel and sign in as someone else
        </button>
      </form>
    </div>
  );
}
