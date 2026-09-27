// Small presentational pieces shared by the app pages (Sure-style chrome).

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode; // right-aligned controls
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-xl font-medium text-primary lg:text-3xl">{title}</h1>
        {subtitle && (
          <p className="text-sm text-secondary lg:text-base">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

/** White card with a titled header row, as used for dashboard sections. */
export function Section({
  title,
  aside,
  children,
  className = "",
  flush = false,
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  flush?: boolean; // no body padding (for full-bleed tables)
}) {
  return (
    <section className={`rounded-xl bg-container shadow-border-xs ${className}`}>
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h2 className="text-base font-medium text-primary">{title}</h2>
        {aside}
      </div>
      <div className={flush ? "" : "px-4 pb-4"}>{children}</div>
    </section>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl bg-container shadow-border-xs ${className}`}>
      {children}
    </div>
  );
}

// Muted, readable hues for letter avatars (light fill, strong ink).
const AVATAR_HUES = [
  "#DB5A54", "#F79009", "#12B76A", "#2E90FA", "#6172F3",
  "#875BF7", "#E478FA", "#EE46BC", "#0BA5EC", "#15B79E",
];

function hueFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_HUES[Math.abs(h) % AVATAR_HUES.length];
}

/** Round first-letter avatar for a merchant, tinted by a stable hash. */
export function MerchantAvatar({
  name,
  color,
  size = "md",
}: {
  name: string;
  color?: string; // e.g. the category colour; defaults to a name hash
  size?: "sm" | "md";
}) {
  const c = color ?? hueFor(name);
  const letter = name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 1) || "?";
  return (
    <span
      aria-hidden
      className={`tint flex shrink-0 items-center justify-center rounded-full font-medium uppercase ${
        size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm"
      }`}
      style={{ "--c": c } as React.CSSProperties}
    >
      {letter}
    </span>
  );
}
