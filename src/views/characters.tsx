import type { Child, SafeHtml } from "@/jsx/jsx-runtime.ts";
import {
  ARMORS, ELEMENTS, LS_TYPES, SECTIONS, STAT_NAMES, STYLES, WEAPONS,
  type Character, type CharacterFilters, type CharacterSummary,
} from "../models/characters.ts";
import { displayTitle, type Party } from "../models/parties.ts";
import { elementStyle, ElementMark, MultilineText, Pagination, PostButton, Tags } from "./components.tsx";

type SearchResult = { characters: (CharacterSummary & { matches: string[] })[]; total: number; page: number; pages: number };

/** 検索結果。party があれば「このパーティに追加」、なければ「このキャラから組む」を出す */
export function CharacterSearchPage({ filters, result, personalities, party, query }: {
  filters: CharacterFilters;
  result: SearchResult;
  personalities: { name: string; count: number }[];
  party: Party | null;
  query: URLSearchParams;
}) {
  const pageHref = (page: number) => {
    const q = new URLSearchParams(query);
    q.set("page", String(page));
    return `/characters?${q}`;
  };
  const memberIds = new Set(party?.members.map((m) => m.id));
  const full = party ? party.members.length >= 6 : false;
  const select = "field w-auto py-1.5 pr-8 text-[13px]";
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

      <form method="get" action="/characters" class="panel mb-4 space-y-3 p-3 sm:p-4">
        {party && <input type="hidden" name="party" value={String(party.id)} />}
        <div class="grid gap-2 sm:grid-cols-2">
          <input class="field" type="search" name="q" value={filters.q ?? ""} placeholder="名前・クラス名（ひらがなOK）" aria-label="名前・クラス名" />
          <input class="field" type="search" name="effect" value={filters.effect ?? ""} placeholder="効果（例: 陰属性 耐性DOWN）" aria-label="効果" />
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <ElementPicker value={filters.element} />
          <Select cls={select} name="weapon" value={filters.weapon} label="武器" options={Object.entries(WEAPONS).map(([k, v]) => [k, v])} />
          <Select cls={select} name="style" value={filters.style} label="スタイル" options={STYLES.map((s) => [s, s])} />
          <Select cls={select} name="ls" value={filters.ls} label="天冥" options={LS_TYPES.map((s) => [s, s])} />
          <Select cls={select} name="personality" value={filters.personality?.[0]} label="パーソナリティ" options={personalities.map((p) => [p.name, `${p.name}（${p.count}）`])} />
          <label class="inline-flex cursor-pointer items-center gap-1.5 px-1 text-[13px] text-muted">
            <input type="checkbox" name="alter" value="1" checked={filters.alter === "1"} class="accent-[#e8c46e]" /> 異節
          </label>
          <span class="ml-auto flex gap-1.5">
            <a href={party ? `/characters?party=${party.id}` : "/characters"} class="btn-xs border border-line text-muted hover:text-ink">クリア</a>
            <button type="submit" class="btn-xs bg-gold text-night hover:bg-[#f3d58f]">検索</button>
          </span>
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

function ElementPicker({ value }: { value?: string }) {
  return (
    <span class="flex gap-1" role="group" aria-label="属性">
      {ELEMENTS.map((e) => (
        <label class="cursor-pointer">
          <input type="radio" name="element" value={e} checked={value === e} class="peer sr-only" data-autosubmit data-toggle />
          <span class={`inline-flex size-7 items-center justify-center rounded-md text-xs font-bold opacity-40 transition-opacity peer-checked:opacity-100 peer-checked:ring-2 peer-checked:ring-gold hover:opacity-80 ${elementStyle(e).solid}`}>{e}</span>
        </label>
      ))}
    </span>
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
