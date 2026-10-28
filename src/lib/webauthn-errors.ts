/**
 * Turn a failed security-key prompt into a message that says what actually
 * went wrong. Browsers report very different problems — an untrusted
 * certificate, an already registered key, a dismissed dialog — through a
 * handful of DOMException names, and simply showing "cancelled or timed
 * out" for all of them leaves no way to fix anything.
 */
export function describeWebAuthnError(e: unknown): string {
  const err = e as { name?: string; message?: string; code?: string; cause?: unknown };
  const cause = (err?.cause ?? {}) as { name?: string; message?: string };
  const name = err?.name ?? cause.name ?? "Error";
  const message = cause.message || err?.message || "";
  const raw = message ? ` (browser said: ${name}: ${message})` : ` (${name})`;

  if (/certificate|tls|ssl/i.test(message)) {
    return (
      "Your browser blocks security keys because it doesn't trust this site's " +
      "certificate (the address bar shows “Not secure”). Install Caddy's root " +
      "certificate on this device — see “Trusting the certificate” in the " +
      "README — then restart the browser and try again." + raw
    );
  }
  if (err?.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" || name === "InvalidStateError") {
    return "This security key is already registered.";
  }
  if (err?.code === "ERROR_INVALID_DOMAIN" || err?.code === "ERROR_INVALID_RP_ID") {
    return (
      "Security keys need the app's hostname (e.g. https://truenas.local:3443), " +
      "not an IP address." + raw
    );
  }
  if (name === "SecurityError") {
    return (
      "The browser refused the security key for this site. This usually means " +
      "the certificate isn't trusted on this device — the address bar shows " +
      "“Not secure”. Install Caddy's root certificate (README → “Trusting the " +
      "certificate”), restart the browser and try again." + raw
    );
  }
  if (name === "NotAllowedError") {
    return (
      "The security key prompt was cancelled, timed out, or blocked by the " +
      "browser. If no prompt appeared at all, the usual cause is an untrusted " +
      "certificate (“Not secure” in the address bar): install Caddy's root " +
      "certificate on this device and restart the browser." + raw
    );
  }
  if (name === "NotSupportedError") {
    return "This browser or device doesn't support security keys here." + raw;
  }
  return "The security key could not be used." + raw;
}
