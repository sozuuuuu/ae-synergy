import type { Child, SafeHtml } from "@/jsx/jsx-runtime.ts";
import {
  ARMORS, EFFECT_SOURCES, EFFECT_TARGETS, ELEMENTS, LS_TYPES, SECTIONS, STAT_NAMES, STYLES, WEAPONS,
  type Character, type CharacterFilters, type CharacterSummary,
} from "../models/characters.ts";
import { displayTitle, type Party } from "../models/parties.ts";
import { elementStyle, ElementMark, MultilineText, Pagination, PostButton, Tags } from "./components.tsx";

type SearchResult = { characters: (CharacterSummary & { matches: string[] })[]; total: number; page: number; pages: number };

/** 検索結果。party があれば「このパーティに追加」、なければ「このキャラから組む」を出す */
export function CharacterSearchPage({ filters, result, personalities, effectTypes, party, query }: {
  filters: CharacterFilters;
  result: SearchResult;
  personalities: { name: string; count: number }[];
  effectTypes: { type: string; count: number }[];
  party: Party | null;
  query: URLSearchParams;
}) {
  const pageHref = (page: number) => {
    const q = new URLSearchParams(query);
    q.set("page", String(page));
    return `/characters?${q}`;
  };
  const withoutPersonality = (name: string) => {
    const q = new URLSearchParams(query);
    q.delete("personality", name);
    q.delete("page");
    return `/characters?${q}`;
  };
  const memberIds = new Set(party?.members.map((m) => m.id));
  const full = party ? party.members.length >= 6 : false;
  const select = "field w-auto max-w-full py-1.5 pr-8 text-[13px]";
  return (
    <>
      <div class="mb-4">
        {party ? (
          <>
            <a href={`/parties/${party.id}`} class="text-sm text-muted hover:text-ink">← {displayTitle(party)}</a>
            <h1 class="mt-1 text-2xl font-bold">メンバーを追加</h1>
          </>
        ) : (
          <>
            <h1 class="text-2xl font-bold">キャラを選ぶ</h1>
            <p class="mt-1 text-sm text-muted">「組む」を押すと、そのキャラをアタッカー（★）にしてパーティを組み始めます。★はあとで付け替えられます</p>
          </>
        )}
      </div>

      <form method="get" action="/characters" class="panel mb-4 space-y-4 p-3 sm:p-4">
        {party && <input type="hidden" name="party" value={String(party.id)} />}
        <input class="field" type="search" name="q" value={filters.q ?? ""} placeholder="名前・クラス名（ひらがなOK）" aria-label="名前・クラス名" />

        <fieldset class="min-w-0 space-y-2">
          <legend class="label-caps mb-2">キャラ</legend>
          <Row label="属性"><ElementPicker values={filters.element} /></Row>
          <Row label="武器"><Chips name="weapon" values={filters.weapon} options={Object.entries(WEAPONS)} /></Row>
          <Row label="スタイル">
            <span class="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Chips name="style" values={filters.style} options={STYLES.map((s) => [s, s])} />
              <span class="flex items-center gap-1.5">
                <span class="text-xs text-faint">天冥</span>
                <Chips name="ls" values={filters.ls ? [filters.ls] : []} options={LS_TYPES.map((s) => [s, s])} radio />
              </span>
              <Select cls={select} name="armor" value={filters.armor} label="防具" options={Object.entries(ARMORS)} />
            </span>
          </Row>
          <Row label="その他">
            <span class="flex flex-wrap items-center gap-1.5">
              {(filters.personality ?? []).map((name) => (
                <>
                  <input type="hidden" name="personality" value={name} />
                  <a href={withoutPersonality(name)} class="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2.5 py-0.5 text-xs text-gold hover:bg-gold/25" title="条件から外す">
                    {name} <span aria-hidden="true">×</span>
                  </a>
                </>
              ))}
              <Select cls={select} name="personality" label={filters.personality?.length ? "パーソナリティを追加" : "パーソナリティ"}
                options={personalities.filter((p) => !filters.personality?.includes(p.name)).map((p) => [p.name, `${p.name}（${p.count}）`])} />
              <Check name="alter" checked={filters.alter === "1"} label="異節" />
              <Check name="sa" checked={filters.sa === "1"} label="星の夢（SA）" />
            </span>
          </Row>
        </fieldset>

        <fieldset class="min-w-0 space-y-2">
          <legend class="label-caps mb-1">効果</legend>
          <p class="text-xs text-faint">指定した条件すべてに、同じ1つの効果が当てはまるキャラを探します</p>
          <div class="grid gap-2 sm:grid-cols-2">
            <input class="field" type="search" name="effect" value={filters.effect ?? ""} placeholder="キーワード（例: 陰属性 耐性DOWN）" aria-label="効果のキーワード" />
            <input class="field" type="search" name="effect_type" value={filters.effectType ?? ""} list="effect-types" placeholder="種別（例: 腕力UP）" aria-label="効果の種別" autocomplete="off" />
            <datalist id="effect-types">{effectTypes.map((t) => <option value={t.type}>{`${t.count}人`}</option>)}</datalist>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            <Select cls={select} name="target" value={filters.target} label="対象：すべて" options={Object.entries(EFFECT_TARGETS).map(([k, v]) => [k, `対象：${v.label}`])} />
            <Select cls={select} name="source" value={filters.source} label="出典：すべて" options={Object.entries(EFFECT_SOURCES).map(([k, v]) => [k, `出典：${v}`])} />
            <Check name="unconditional" checked={filters.unconditional === "1"} label="発動条件なしのみ" />
          </div>
        </fieldset>

        <div class="flex justify-end gap-1.5">
          <a href={party ? `/characters?party=${party.id}` : "/characters"} class="btn-xs border border-line text-muted hover:text-ink">クリア</a>
          <button type="submit" class="btn-xs bg-gold text-night hover:bg-[#f3d58f]">検索</button>
        </div>
      </form>

      <p class="mb-2 text-xs text-muted tabular-nums">{result.total}件{full && <span class="text-warn"> ・ パーティが満員です</span>}</p>
      <ul class="panel divide-y divide-line overflow-hidden">
        {result.characters.map((c) => (
          <li class="flex items-start gap-3 p-3 sm:px-4">
            <ElementMark element={c.element} />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <a href={`/characters/${c.id}`} class="font-semibold hover:text-gold">{c.label}</a>
                <Tags c={c} />
              </div>
              {c.class_name && <div class="mt-0.5 truncate text-xs text-faint">{c.class_name}</div>}
              {c.matches.length > 0 && (
                <ul class="mt-1.5 space-y-0.5 border-l-2 border-gold/50 pl-2 text-xs leading-relaxed text-ink/80">{c.matches.map((m) => <li>{m}</li>)}</ul>
              )}
            </div>
            <div class="flex shrink-0 flex-col gap-1.5">
              {party ? (
                memberIds.has(c.id) ? <span class="pt-1 text-xs text-faint">編成中</span> : full ? "" : (
                  <>
                    <PostButton action={`/parties/${party.id}/members`} fields={{ character_id: c.id, slot: "main" }} label="前衛" class="btn-xs bg-gold text-night hover:bg-[#f3d58f]" />
                    <PostButton action={`/parties/${party.id}/members`} fields={{ character_id: c.id, slot: "sub" }} label="後衛" class="btn-xs border border-line text-ink hover:bg-panel-2" />
                  </>
                )
              ) : (
                <PostButton action="/parties" fields={{ attacker_id: c.id }} label="組む" title="このキャラからパーティを組む" class="btn-xs border border-gold/50 text-gold hover:bg-gold/10" />
              )}
            </div>
          </li>
        ))}
        {result.characters.length === 0 && <li class="p-6 text-center text-sm text-muted">見つかりませんでした</li>}
      </ul>
      <Pagination page={result.page} pages={result.pages} href={pageHref} />
    </>
  );
}

function Row({ label, children }: { label: string; children?: Child }) {
  return (
    <div class="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-2">
      <span class="text-xs text-muted">{label}</span>
      {children}
    </div>
  );
}

/** 複数選べる属性ボタン */
function ElementPicker({ values = [] }: { values?: string[] }) {
  return (
    <span class="flex flex-wrap gap-1" role="group" aria-label="属性">
      {ELEMENTS.map((e) => (
        <label class="cursor-pointer">
          <input type="checkbox" name="element" value={e} checked={values.includes(e)} class="peer sr-only" data-autosubmit />
          <span class={`inline-flex size-7 items-center justify-center rounded-md text-xs font-bold opacity-40 transition-opacity peer-checked:opacity-100 peer-checked:ring-2 peer-checked:ring-gold peer-focus-visible:ring-2 peer-focus-visible:ring-ink hover:opacity-80 ${elementStyle(e).solid}`}>{e}</span>
        </label>
      ))}
    </span>
  );
}

/** 押すと選択が切り替わるボタン群。radio なら1つだけ（もう一度押すと外れる） */
function Chips({ name, values = [], options, radio = false }: { name: string; values?: string[]; options: [string, string][]; radio?: boolean }) {
  return (
    <span class="flex flex-wrap gap-1" role="group">
      {options.map(([value, text]) => (
        <label class="cursor-pointer">
          <input type={radio ? "radio" : "checkbox"} name={name} value={value} checked={values.includes(value)} class="peer sr-only" data-autosubmit data-toggle={radio} />
          <span class="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-line px-2 text-xs text-muted transition-colors hover:text-ink peer-checked:border-gold peer-checked:bg-gold/15 peer-checked:font-semibold peer-checked:text-gold peer-focus-visible:ring-2 peer-focus-visible:ring-ink">{text}</span>
        </label>
      ))}
    </span>
  );
}

function Check({ name, checked, label }: { name: string; checked: boolean; label: string }) {
  return (
    <label class="inline-flex cursor-pointer items-center gap-1.5 px-1 text-[13px] text-muted">
      <input type="checkbox" name={name} value="1" checked={checked} class="accent-[#e8c46e]" data-autosubmit /> {label}
    </label>
  );
}

function Select({ name, value, label, options, cls }: { name: string; value?: string; label: string; options: [string, string][]; cls: string }) {
  return (
    <select name={name} class={cls} aria-label={label} data-autosubmit>
      <option value="">{label}</option>
      {options.map(([v, text]) => <option value={v} selected={v === value}>{text}</option>)}
    </select>
  );
}

export function CharacterPage({ character: c, parties }: { character: Character; parties: Party[] }) {
  const stats = c.data.stats ?? {};
  const statColumns = ([["lvMax", "最大"], ["stellar", "星の夢"]] as const).filter(([key]) => stats[key]);
  return (
    <>
      <section class="panel relative mb-4 overflow-hidden p-4 sm:p-5">
        <span class={`absolute inset-x-0 top-0 h-1 ${elementStyle(c.element).bar}`} aria-hidden="true"></span>
        <div class="flex flex-wrap items-start gap-4">
          <ElementMark element={c.element} size="lg" />
          <div class="min-w-0 flex-1">
            <h1 class="text-2xl font-bold">{c.label}</h1>
            <p class="mt-0.5 mb-2 text-sm text-muted">{[c.class_name, c.eng_name, c.true_name && `真名 ${c.true_name}`].filter(Boolean).join(" ・ ")}</p>
            <Tags c={c} />
          </div>
          <PostButton action="/parties" fields={{ attacker_id: c.id }} label="このキャラから組む" class="btn-gold" />
        </div>
        <div class="mt-4 flex flex-wrap gap-1.5">
          {c.personalities.map((p) => (
            <a href={`/characters?personality=${encodeURIComponent(p.name)}`}
              class={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${p.category === "element" ? elementStyle(p.name).soft : "bg-panel-2 text-ink/80 hover:text-gold"}`}>
              {p.name}
            </a>
          ))}
        </div>
      </section>

      <div class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div class="space-y-4">
          <Section title="スキル">
            <ul class="divide-y divide-line">
              {(c.data.skills ?? []).map((skill: any) => (
                <li class="py-3 first:pt-0 last:pb-0">
                  <div class="flex items-baseline justify-between gap-2">
                    <span class="font-semibold">{skill.name}</span>
                    <span class="shrink-0 text-xs text-faint tabular-nums">MP {skill.mpCost ?? 0}</span>
                  </div>
                  <EffectList node={skill.effects} />
                </li>
              ))}
            </ul>
          </Section>
          {SECTIONS.filter(([key]) => c.data[key]?.length).map(([key, title]) => (
            <Section title={title}><EffectList node={c.data[key]} /></Section>
          ))}
        </div>

        <div class="space-y-4">
          <Section title="基本">
            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              {([["レア", `★${c.rarity} ${c.style}`], ["武器", WEAPONS[c.weapon] ?? c.weapon], ["防具", ARMORS[c.armor ?? ""] ?? "－"],
                ["天冥", c.ls_type ?? "－"], ["性別", c.gender ?? "－"], ["入手", c.obtain ?? "－"]] as const).map(([k, v]) => (
                <><dt class="text-muted">{k}</dt><dd>{v}</dd></>
              ))}
            </dl>
          </Section>
          {statColumns.length > 0 && (
            <Section title="ステータス">
              <table class="w-full text-sm tabular-nums">
                <thead><tr class="text-xs text-faint"><th></th>{statColumns.map(([, label]) => <th class="pb-1 text-right font-normal">{label}</th>)}</tr></thead>
                <tbody>
                  {Object.entries(STAT_NAMES).map(([key, label]) => (
                    <tr><td class="py-0.5 text-muted">{label}</td>{statColumns.map(([col]) => <td class="text-right">{stats[col]?.[key] ?? "－"}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}
          <Section title="このキャラがいるパーティ">
            {parties.length === 0 ? <p class="text-sm text-faint">まだありません</p> : (
              <ul class="space-y-1.5 text-sm">{parties.map((p) => <li><a class="text-gold hover:underline" href={`/parties/${p.id}`}>{displayTitle(p)}</a></li>)}</ul>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children?: Child }): SafeHtml {
  return (
    <section class="panel p-4">
      <h2 class="label-caps mb-3">{title}</h2>
      {children}
    </section>
  );
}

/** 取り込み元の効果ツリーをそのまま箇条書きにする */
function EffectList({ node }: { node: unknown }): SafeHtml {
  const items = Array.isArray(node) ? node : node ? [node] : [];
  if (items.length === 0) return <span />;
  return (
    <ul class="mt-1.5 space-y-1 text-[13px] leading-relaxed text-ink/85">
      {items.map((item: any) => {
        if (!item || typeof item !== "object") return "";
        const heading = [item.name, item.level != null && `Lv${item.level}`].filter(Boolean).join(" ");
        const children = [item.effects, item.add].flat().filter(Boolean);
        const cond = Array.isArray(item.cond) ? item.cond.map((x: any) => [x.stack, x.cons].filter(Boolean).join(" / ")).join(" ") : "";
        return (
          <li>
            {heading && <div class="font-semibold text-ink">{heading}</div>}
            {cond && <div class="text-xs text-faint">{cond}</div>}
            {typeof item.description === "string" && <div class="flex gap-1.5"><span class="text-faint">・</span><span><MultilineText text={item.description} /></span></div>}
            {children.length > 0 && <div class="ml-2 border-l border-line pl-3"><EffectList node={children} /></div>}
          </li>
        );
      })}
    </ul>
  );
}
