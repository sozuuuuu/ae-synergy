import type { Child } from "@/jsx/jsx-runtime.ts";
import { WEAPONS, type CharacterSummary } from "../models/characters.ts";

// Tailwind が拾えるよう、クラス名は完全な文字列で書く
const ELEMENT_STYLES: Record<string, { solid: string; soft: string; bar: string }> = {
  火: { solid: "bg-[#ef5b4c] text-white", soft: "bg-[#ef5b4c]/15 text-[#ff8a7d]", bar: "bg-[#ef5b4c]" },
  地: { solid: "bg-[#c98a3a] text-white", soft: "bg-[#c98a3a]/15 text-[#e7ad62]", bar: "bg-[#c98a3a]" },
  水: { solid: "bg-[#3f9ae8] text-white", soft: "bg-[#3f9ae8]/15 text-[#7cbcf5]", bar: "bg-[#3f9ae8]" },
  風: { solid: "bg-[#35b981] text-white", soft: "bg-[#35b981]/15 text-[#6bdcab]", bar: "bg-[#35b981]" },
  雷: { solid: "bg-[#e9c53a] text-[#1d1a08]", soft: "bg-[#e9c53a]/15 text-[#f3d867]", bar: "bg-[#e9c53a]" },
  陰: { solid: "bg-[#8c62e8] text-white", soft: "bg-[#8c62e8]/15 text-[#b49bff]", bar: "bg-[#8c62e8]" },
  晶: { solid: "bg-[#e66aa8] text-white", soft: "bg-[#e66aa8]/15 text-[#f59ac7]", bar: "bg-[#e66aa8]" },
  無: { solid: "bg-[#8a93ab] text-white", soft: "bg-[#8a93ab]/15 text-[#b7bed0]", bar: "bg-[#8a93ab]" },
};
const NO_ELEMENT = { solid: "bg-panel-2 text-muted", soft: "bg-panel-2 text-muted", bar: "bg-line" };
export const elementStyle = (element: string | null) => ELEMENT_STYLES[element ?? ""] ?? NO_ELEMENT;

/** 属性色の四角に属性の漢字を出す（キャラ画像の代わり） */
export function ElementMark({ element, size = "md" }: { element: string | null; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "size-6 text-[11px] rounded-md", md: "size-8 text-sm rounded-lg", lg: "size-14 text-2xl rounded-xl" };
  return (
    <span class={`inline-flex shrink-0 items-center justify-center font-bold ${sizes[size]} ${elementStyle(element).solid}`} aria-label={element ? `${element}属性` : "属性なし"}>
      {element ?? "－"}
    </span>
  );
}

export function Tags({ c, compact = false }: { c: CharacterSummary; compact?: boolean }) {
  const tag = "rounded px-1.5 py-px text-[11px] leading-5";
  return (
    <span class="flex flex-wrap gap-1">
      {c.style !== "NS" && <span class={`${tag} bg-gold/15 font-semibold text-gold`}>{c.style}</span>}
      <span class={`${tag} bg-panel-2 text-muted`}>{WEAPONS[c.weapon] ?? c.weapon}</span>
      {c.ls_type && <span class={`${tag} ${c.ls_type === "天" ? "bg-sky-400/10 text-sky-300" : "bg-violet-400/10 text-violet-300"}`}>{c.ls_type}</span>}
      {!compact && c.is_alter ? <span class={`${tag} bg-rose-400/10 text-rose-300`}>異節</span> : ""}
      {!compact && c.is_sa ? <span class={`${tag} bg-teal-400/10 text-teal-300`}>SA</span> : ""}
    </span>
  );
}

export function Errors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return <span />;
  return (
    <div class="mb-4 rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200" role="alert">
      <ul class="list-inside list-disc space-y-0.5">{errors.map((e) => <li>{e}</li>)}</ul>
    </div>
  );
}

export function Pagination({ page, pages, href }: { page: number; pages: number; href: (page: number) => string }) {
  if (pages <= 1) return <span />;
  return (
    <nav class="mt-6 flex items-center justify-center gap-3" aria-label="ページ">
      {page > 1 ? <a class="btn-ghost" href={href(page - 1)}>← 前へ</a> : <span class="btn-ghost opacity-30">← 前へ</span>}
      <span class="text-sm text-muted tabular-nums">{page} / {pages}</span>
      {page < pages ? <a class="btn-ghost" href={href(page + 1)}>次へ →</a> : <span class="btn-ghost opacity-30">次へ →</span>}
    </nav>
  );
}

/** POST するだけの小さなボタン */
export function PostButton({ action, label, class: cls, fields = {}, confirm, title }: {
  action: string; label: Child; class: string; fields?: Record<string, string | number>; confirm?: string; title?: string;
}) {
  return (
    <form method="post" action={action} class="contents" data-confirm={confirm}>
      {Object.entries(fields).map(([name, value]) => <input type="hidden" name={name} value={String(value)} />)}
      <button type="submit" class={cls} title={title} aria-label={title}>{label}</button>
    </form>
  );
}

/** 改行を <br> にして表示する（エスケープは JSX が行う） */
export function MultilineText({ text }: { text: string }) {
  return <>{text.split("\n").map((line, i) => (i === 0 ? line : [<br />, line]))}</>;
}

export const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

/** 効果量の表示（固定値は +N、それ以外は N%） */
export const formatValue = (type: string, value: number | null) => {
  if (value == null || value <= 0) return "";
  if (type === "下克上") return ""; // 装備の下克上の値は計算式の定数（敵Lv²/320 の 320）
  if (/固定値/.test(type)) return `+${value}`;
  if (value < 5 && /攻撃$|毒|ペイン/.test(type)) return "";
  return `${value}%`;
};

/** 強度バーに使う割合（0〜100）。% で表せない効果（固定値・倍率・有無だけのもの）は null */
export function strengthOf(type: string, value: number | null): number | null {
  const text = formatValue(type, value);
  if (!text || !text.endsWith("%")) return null;
  return Math.min(100, value!);
}

/** 強度の段階ごとの色（100% 以上は金、50% 以上は緑、それ未満は控えめ） */
export const strengthText = (pct: number | null) => (pct == null ? "text-ink/80" : pct >= 100 ? "text-gold" : pct >= 50 ? "text-ok" : "text-ink/70");
export const strengthBar = (pct: number) => (pct >= 100 ? "bg-gold" : pct >= 50 ? "bg-ok" : "bg-faint");

export const turnsLabel = (turns: number | null) => (turns ? `${turns}T` : "");

/** 効果名の表示用の短縮（「月光陣展開」→「月光陣」など） */
export const shortType = (type: string) => type.replace(/展開$/, "");
