"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import {
  Check,
  Copy,
  Download,
  KeyRound,
  ShieldCheck,
  Smartphone,
  Trash2,
} from "lucide-react";
import {
  beginKeyRegistration,
  beginTotp,
  confirmTotp,
  disableTotp,
  finishKeyRegistration,
  regenerateRecoveryCodes,
  removeKey,
} from "./actions";

type Status = { totp: boolean; keys: number; recoveryLeft: number };
type Key = { id: string; name: string; createdAt: string; lastUsedAt: string | null };

function StatusPill({ on }: { on: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        on ? "tint" : "bg-container-inset text-secondary"
      }`}
      style={on ? ({ "--c": "#12B76A" } as React.CSSProperties) : undefined}
    >
      {on && <Check className="h-3 w-3" />}
      {on ? "On" : "Off"}
    </span>
  );
}

function Card({
  icon: Icon,
  title,
  description,
  on,
  children,
}: {
  icon: typeof KeyRound;
  title: string;
  description: string;
  on?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-container shadow-border-xs">
      <div className="flex items-start gap-3 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-container-inset text-secondary">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-medium">{title}</h2>
            {on != null && <StatusPill on={on} />}
          </div>
          <p className="mt-0.5 text-sm text-secondary">{description}</p>
        </div>
      </div>
      <div className="border-t border-divider p-4">{children}</div>
    </section>
  );
}

/** Password prompt guarding the "turn off" actions. */
function ConfirmWithPassword({
  label,
  onConfirm,
  onCancel,
}: {
  label: string;
  onConfirm: (password: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setError(await onConfirm(password)));
      }}
    >
      <label className="block min-w-48 flex-1">
        <span className="text-sm font-medium">Confirm with your password</span>
        <input
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field mt-1"
        />
      </label>
      <button type="submit" disabled={pending} className="btn-primary bg-destructive! text-white!">
        {pending ? "…" : label}
      </button>
      <button type="button" onClick={onCancel} className="btn-secondary">
        Cancel
      </button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Financial Adviser recovery codes\nEach code works once.\n\n${codes.join("\n")}\n`;
  return (
    <div className="rounded-xl bg-warning-bg p-4 shadow-border-xs">
      <p className="text-sm font-medium text-warning">Save your recovery codes now</p>
      <p className="mt-1 text-sm text-secondary">
        If you lose your phone or security key, each of these codes lets you
        sign in once. They won&apos;t be shown again.
      </p>
      <ul
        data-recovery-codes
        className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-container p-4 font-mono text-sm shadow-border-xs"
      >
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={async () => {
            await navigator.clipboard?.writeText(text).catch(() => {});
            setCopied(true);
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </button>
        <a
          className="btn-secondary"
          download="financial-adviser-recovery-codes.txt"
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}
        >
          <Download className="h-4 w-4" />
          Download
        </a>
        <button type="button" className="btn-primary ml-auto" onClick={onDone}>
          I&apos;ve saved them
        </button>
      </div>
    </div>
  );
}

export function SecuritySettings({
  status,
  keys,
  rp,
}: {
  status: Status;
  keys: Key[];
  rp: { usable: boolean; rpID: string };
}) {
  const router = useRouter();
  const [codes, setCodes] = useState<string[] | null>(null);
  const showCodes = (c?: string[]) => {
    if (c?.length) setCodes(c);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {codes && <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />}
      <TotpCard on={status.totp} onChanged={showCodes} />
      <KeysCard keys={keys} rp={rp} onChanged={showCodes} />
      <RecoveryCard status={status} onCodes={showCodes} />
    </div>
  );
}

function TotpCard({
  on,
  onChanged,
}: {
  on: boolean;
  onChanged: (codes?: string[]) => void;
}) {
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Card
      icon={Smartphone}
      title="Authenticator app"
      description="6-digit codes from an app such as Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden or Aegis."
      on={on}
    >
      {on ? (
        disabling ? (
          <ConfirmWithPassword
            label="Turn off"
            onCancel={() => setDisabling(false)}
            onConfirm={async (pw) => {
              const res = await disableTotp(pw);
              if (!res.ok) return res.error;
              setDisabling(false);
              onChanged();
              return null;
            }}
          />
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-secondary">Codes from your app are required at sign-in.</p>
            <button type="button" className="btn-secondary" onClick={() => setDisabling(true)}>
              Turn off
            </button>
          </div>
        )
      ) : setup ? (
        <div className="flex flex-col gap-6 sm:flex-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={setup.qr}
            alt="QR code for your authenticator app"
            width={176}
            height={176}
            className="h-44 w-44 shrink-0 self-center rounded-lg bg-white p-2 shadow-border-xs"
          />
          <div className="min-w-0 flex-1 space-y-3 text-sm">
            <p>
              <span className="font-medium">1.</span> Scan the QR code with your
              authenticator app.
            </p>
            <details className="text-secondary">
              <summary className="cursor-pointer">Can&apos;t scan? Enter this key instead</summary>
              <code
                data-totp-secret
                className="mt-2 block break-all rounded-lg bg-container-inset px-3 py-2 font-mono text-xs text-primary"
              >
                {setup.secret.match(/.{1,4}/g)?.join(" ")}
              </code>
            </details>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                start(async () => {
                  const res = await confirmTotp(code);
                  if (!res.ok) return setError(res.error);
                  setSetup(null);
                  setCode("");
                  onChanged(res.recoveryCodes);
                });
              }}
            >
              <label className="block">
                <span className="font-medium">2.</span> Enter the 6-digit code it shows:
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  maxLength={7}
                  required
                  name="totp-confirm"
                  className="field mt-1 max-w-40 text-center font-mono tracking-widest"
                />
              </label>
              <div className="flex gap-2">
                <button type="submit" disabled={pending} className="btn-primary">
                  {pending ? "Checking…" : "Turn on"}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setSetup(null)}>
                  Cancel
                </button>
              </div>
              {error && <p className="text-destructive">{error}</p>}
            </form>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-secondary">Not set up.</p>
          <button
            type="button"
            className="btn-primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await beginTotp();
                if (!res.ok) return setError(res.error);
                setSetup({ secret: res.secret, qr: res.qr });
              })
            }
          >
            Set up
          </button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </Card>
  );
}

function KeysCard({
  keys,
  rp,
  onChanged,
}: {
  keys: Key[];
  rp: { usable: boolean; rpID: string };
  onChanged: (codes?: string[]) => void;
}) {
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // WebAuthn also needs a secure context (HTTPS with a trusted certificate).
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    setSupported(window.isSecureContext && "PublicKeyCredential" in window);
  }, []);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  function register() {
    setError(null);
    start(async () => {
      const opts = await beginKeyRegistration();
      if (!opts.ok) return setError(opts.error);
      let response;
      try {
        response = await startRegistration({ optionsJSON: opts.options });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        return setError(
          /excluded|already registered/i.test(msg)
            ? "This security key is already registered."
            : "The security key prompt was cancelled or timed out."
        );
      }
      const res = await finishKeyRegistration(name || defaultKeyName(), response);
      if (!res.ok) return setError(res.error);
      setName("");
      setAdding(false);
      onChanged(res.recoveryCodes);
    });
  }

  return (
    <Card
      icon={KeyRound}
      title="Security keys & passkeys"
      description="A YubiKey or other FIDO2 key, or a passkey on this device (Windows Hello, Touch ID, Face ID, Android)."
      on={keys.length > 0}
    >
      {!rp.usable ? (
        <p className="rounded-lg bg-warning-bg p-3 text-sm text-warning">
          You opened the app by IP address ({rp.rpID}). Browsers only allow
          security keys on a hostname, e.g. https://truenas.local:3443 — open
          it that way to add or use one. The authenticator app works either way.
        </p>
      ) : !supported ? (
        <p className="rounded-lg bg-warning-bg p-3 text-sm text-warning">
          This browser can&apos;t use security keys here. They need HTTPS with a
          trusted certificate — trust Caddy&apos;s root certificate on this device
          (see the README), then reload.
        </p>
      ) : null}

      {keys.length > 0 && (
        <ul className="mb-4 divide-y divide-divider rounded-lg bg-container-inset p-1">
          {keys.map((k) => (
            <li key={k.id} data-key-row className="rounded-lg bg-container px-3 py-2.5 shadow-border-xs [&+&]:mt-1">
              {removing === k.id ? (
                <ConfirmWithPassword
                  label="Remove"
                  onCancel={() => setRemoving(null)}
                  onConfirm={async (pw) => {
                    const res = await removeKey(k.id, pw);
                    if (!res.ok) return res.error;
                    setRemoving(null);
                    onChanged();
                    return null;
                  }}
                />
              ) : (
                <div className="flex items-center gap-3 text-sm">
                  <KeyRound className="h-4 w-4 shrink-0 text-secondary" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{k.name}</p>
                    <p className="text-xs text-secondary">
                      Added {fmt(k.createdAt)}
                      {k.lastUsedAt ? ` · last used ${fmt(k.lastUsedAt)}` : " · never used"}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${k.name}`}
                    onClick={() => setRemoving(k.id)}
                    className="ml-auto rounded-lg p-2 text-secondary hover:bg-container-inset hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {rp.usable && supported && (
        adding ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              register();
            }}
          >
            <label className="block min-w-48 flex-1">
              <span className="text-sm font-medium">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={defaultKeyName()}
                maxLength={60}
                autoFocus
                className="field mt-1"
              />
            </label>
            <button type="submit" disabled={pending} className="btn-primary">
              {pending ? "Waiting for key…" : "Continue"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-secondary">
              {keys.length ? `${keys.length} registered.` : "None registered."}
            </p>
            <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
              Add security key
            </button>
          </div>
        )
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </Card>
  );
}

function defaultKeyName(): string {
  if (typeof navigator === "undefined") return "Security key";
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return "iPhone / iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Mac OS X/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "Security key";
}

function RecoveryCard({
  status,
  onCodes,
}: {
  status: Status;
  onCodes: (codes?: string[]) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const active = status.totp || status.keys > 0;
  return (
    <Card
      icon={ShieldCheck}
      title="Recovery codes"
      description="One-time codes for when you can't use your app or key. You get them when you turn on your first method."
    >
      {!active ? (
        <p className="text-sm text-secondary">Available once two-factor authentication is on.</p>
      ) : confirming ? (
        <ConfirmWithPassword
          label="Generate new codes"
          onCancel={() => setConfirming(false)}
          onConfirm={async (pw) => {
            const res = await regenerateRecoveryCodes(pw);
            if (!res.ok) return res.error;
            setConfirming(false);
            onCodes(res.recoveryCodes);
            return null;
          }}
        />
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className={`text-sm ${status.recoveryLeft <= 2 ? "text-warning" : "text-secondary"}`}>
            {status.recoveryLeft} of 10 unused.
            {status.recoveryLeft <= 2 && " Generate new ones soon."}
          </p>
          <button type="button" className="btn-secondary" onClick={() => setConfirming(true)}>
            Generate new codes
          </button>
        </div>
      )}
    </Card>
  );
}
