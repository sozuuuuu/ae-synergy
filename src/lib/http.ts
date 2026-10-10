import type { SafeHtml } from "@/jsx/jsx-runtime.ts";
import type { Flash } from "../views/layout.tsx";

export function html(body: SafeHtml, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body.toString(), { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
}

export function redirect(location: string, flash?: Flash): Response {
  const headers = new Headers({ location });
  if (flash) headers.append("set-cookie", `flash=${encodeURIComponent(JSON.stringify(flash))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=60`);
  return new Response(null, { status: 303, headers });
}

export function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/** フラッシュメッセージを取り出す（表示したら消す） */
export function takeFlash(request: Request): { flash: Flash; clear: Record<string, string> } {
  const raw = readCookie(request, "flash");
  if (!raw) return { flash: null, clear: {} };
  let flash: Flash = null;
  try {
    const value = JSON.parse(raw);
    if ((value?.type === "notice" || value?.type === "alert") && typeof value.message === "string") flash = value;
  } catch {}
  return { flash, clear: { "set-cookie": "flash=; Path=/; Max-Age=0" } };
}

/**
 * 他サイトからのフォーム送信（CSRF）を拒否する。認証がないので、tailnet 外のページが
 * 利用者のブラウザ経由で書き込むのを防ぐ唯一の手段になる。
 */
export function isSameOriginRequest(request: Request, publicOrigin?: string): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const source = request.headers.get("origin") ?? request.headers.get("referer");
  // ブラウザは POST に Origin を付ける。どちらもないのは curl などブラウザ以外からの送信
  return source ? sameHost(source, request, publicOrigin) : true;
}

function sameHost(url: string, request: Request, publicOrigin?: string): boolean {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return false;
  }
  const allowed = [request.headers.get("host"), request.headers.get("x-forwarded-host"), publicOrigin && new URL(publicOrigin).host].filter(Boolean);
  return allowed.includes(host);
}

type FormValue = string | string[] | File | undefined;

/** フォームの値を1つの文字列として取り出す */
export const str = (value: FormValue | unknown): string =>
  Array.isArray(value) ? String(value.at(-1) ?? "") : typeof value === "string" ? value : value == null ? "" : String(value);

/** 同名の複数値（チェックボックス）を配列で取り出す */
export const list = (value: FormValue | unknown): string[] =>
  Array.isArray(value) ? value.map(String) : typeof value === "string" && value !== "" ? [value] : [];

export const int = (value: unknown): number | null => {
  const n = Number(str(value));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
