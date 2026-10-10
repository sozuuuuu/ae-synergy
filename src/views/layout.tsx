import { raw, type Child } from "@/jsx/jsx-runtime.ts";

export type Flash = { type: "notice" | "alert"; message: string } | null;

export type LayoutProps = {
  title?: string;
  path: string;
  flash?: Flash;
  children?: Child;
};

const NAV = [
  { href: "/", label: "パーティ", match: (p: string) => p === "/" || p.startsWith("/parties") },
  { href: "/characters", label: "キャラ", match: (p: string) => p.startsWith("/characters") },
];

export function Layout({ title, path, flash, children }: LayoutProps) {
  return (
    <>
      {raw("<!DOCTYPE html>")}
      <html lang="ja">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          <title>{title ? `${title} · AE Synergy` : "AE Synergy"}</title>
          <meta name="robots" content="noindex" />
          <meta name="theme-color" content="#0a0f1e" />
          <link rel="icon" href="/static/icon.svg" type="image/svg+xml" />
          <link rel="stylesheet" href="/static/app.css" />
          <script src="/static/app.js" defer></script>
        </head>
        <body class="min-h-screen font-sans text-ink antialiased">
          <header class="sticky top-0 z-30 border-b border-line/70 bg-night/85 backdrop-blur-md">
            <div class="mx-auto flex max-w-6xl items-center gap-5 px-4 py-3">
              <a href="/" class="flex items-center gap-2 text-[15px] font-bold tracking-wide text-gold">
                <span class="inline-block size-2 rotate-45 bg-gold" aria-hidden="true"></span>
                AE Synergy
              </a>
              <nav class="flex gap-1 text-sm">
                {NAV.map((item) => (
                  <a
                    href={item.href}
                    class={`rounded-md px-2.5 py-1 font-medium ${item.match(path) ? "bg-panel-2 text-ink" : "text-muted hover:text-ink"}`}
                    aria-current={item.match(path) ? "page" : undefined}
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
            </div>
          </header>

          {flash && (
            <div class="mx-auto max-w-6xl px-4 pt-4">
              <div
                role="status"
                data-flash
                class={`rounded-xl border px-4 py-2.5 text-sm ${flash.type === "notice" ? "border-ok/30 bg-ok/10 text-[#9ff0d2]" : "border-red-400/40 bg-red-500/10 text-red-200"}`}
              >
                {flash.message}
              </div>
            </div>
          )}

          <main class="mx-auto max-w-6xl px-4 pt-5 pb-16">{children}</main>
        </body>
      </html>
    </>
  );
}
