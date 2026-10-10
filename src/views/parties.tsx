import type { CharacterSummary } from "../models/characters.ts";
import { AFFINITIES, type Dealt, ENEMY_FIELDS, type Taken, withDefaults } from "../models/estimate.ts";
import { displayTitle, memberAt, SLOT_COUNTS, SLOT_NAMES, type Member, type Party, type Slot } from "../models/parties.ts";
import {
  ATTACK_ELEMENTS, ATTACK_KINDS, BOSS_NEEDS, fitRank, GROUP_NAMES,
  type Coverage, type Group, type Provider, type Requirement,
} from "../models/requirements.ts";
import {
  elementStyle, ElementMark, Errors, formatDate, formatValue, MultilineText, PostButton, shortType, strengthBar, strengthOf, strengthText, Tags, turnsLabel,
} from "./components.tsx";

type Summary = Record<Group, { ok: number; partial: number; total: number }>;

export function summarize(coverage: Coverage[]): Summary {
  const summary: Summary = { damage: { ok: 0, partial: 0, total: 0 }, durability: { ok: 0, partial: 0, total: 0 }, boss: { ok: 0, partial: 0, total: 0 } };
  for (const c of coverage) {
    const s = summary[c.req.group];
    s.total++;
    if (c.status === "ok") s.ok++;
    if (c.status === "partial") s.partial++;
  }
  return summary;
}

const GROUPS = Object.keys(GROUP_NAMES) as Group[];

/** 点灯したセグメントで埋まり具合を見せるメーター */
function Meter({ label, s, compact = false }: { label: string; s: Summary[Group]; compact?: boolean }) {
  return (
    <div>
      <div class={`flex items-baseline justify-between ${compact ? "mb-1 text-[11px]" : "mb-1.5 text-xs"}`}>
        <span class="text-muted">{label}</span>
        <span class={`font-semibold tabular-nums ${s.ok === s.total ? "text-ok" : "text-ink"}`}>{s.ok}<span class="text-faint">/{s.total}</span></span>
      </div>
      <div class="flex gap-0.5">
        {[...Array(s.total).keys()].map((i) => (
          <span class={`h-1.5 flex-1 rounded-full ${i < s.ok ? "bg-ok" : i < s.ok + s.partial ? "bg-warn/70" : "bg-line"}`}></span>
        ))}
      </div>
    </div>
  );
}

export function PartyListPage({ parties, summaries }: { parties: Party[]; summaries: Map<number, Summary> }) {
  return (
    <>
      <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold">パーティ</h1>
          <p class="mt-1 text-sm text-muted">アタッカーの火力・耐久・ボス対策の枠を埋めていく</p>
        </div>
        <a href="/characters" class="btn-gold">＋ キャラを選んで組む</a>
      </div>

      {parties.length === 0 ? (
        <div class="panel flex flex-col items-center px-6 py-14 text-center">
          <span class="mb-4 inline-block size-3 rotate-45 bg-gold" aria-hidden="true"></span>
          <p class="mb-1 text-lg font-semibold">最初のパーティを組もう</p>
          <p class="mb-6 max-w-sm text-sm text-muted">キャラを選んで組み始めると、アタッカーの火力を伸ばす枠と、足りない枠を埋められるキャラが分かります。</p>
          <a href="/characters" class="btn-gold">キャラを選ぶ</a>
        </div>
      ) : (
        <ul class="grid gap-3 md:grid-cols-2">
          {parties.map((party) => {
            const summary = summaries.get(party.id)!;
            return (
              <li>
                <a href={`/parties/${party.id}`} class="panel block p-4 transition-colors hover:border-faint hover:bg-panel-2/60">
                  <div class="mb-3 flex items-baseline justify-between gap-3">
                    <span class="truncate font-semibold">{displayTitle(party)}</span>
                    <span class="shrink-0 text-xs text-faint">{formatDate(party.updated_at)}</span>
                  </div>
                  <MiniStrip party={party} />
                  <div class="mt-3 grid grid-cols-3 gap-3">
                    {GROUPS.filter((g) => summary[g].total > 0).map((g) => <Meter label={GROUP_NAMES[g]} s={summary[g]} compact />)}
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function MiniStrip({ party }: { party: Party }) {
  const cell = (slot: Slot, position: number) => {
    const m = memberAt(party, slot, position);
    if (!m) return <span class="h-7 flex-1 rounded-md border border-dashed border-line"></span>;
    return (
      <span class={`flex h-7 min-w-0 flex-1 items-center justify-center truncate rounded-md px-1 text-[11px] font-semibold ${elementStyle(m.element).soft} ${m.id === party.attacker_id ? "ring-1 ring-gold" : ""}`} title={m.label}>
        {m.name.slice(0, 4)}
      </span>
    );
  };
  return (
    <div class="flex gap-1">
      {[0, 1, 2, 3].map((p) => cell("main", p))}
      <span class="w-1.5" aria-hidden="true"></span>
      {[0, 1].map((p) => cell("sub", p))}
    </div>
  );
}

type Candidate = Provider & { character: CharacterSummary; extra: string[]; gain: number | null };

/** ダメージの表示（万・億で丸める） */
export function formatDamage(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(2)}億`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
  return Math.round(n).toLocaleString("ja-JP");
}
const formatGain = (gain: number) => `+${(gain * 100).toFixed(gain < 0.1 ? 1 : 0)}%`;

export function PartyPage({ party, coverage, need, candidates, dealt, taken, shared, errors }: {
  party: Party;
  coverage: Coverage[];
  need: Requirement | null;
  candidates: Candidate[];
  dealt: Dealt | null;
  taken: Taken[];
  shared: { name: string; category: string; count: number; members: string }[];
  errors: string[];
}) {
  const summary = summarize(coverage);
  const attacker = party.members.find((m) => m.id === party.attacker_id);
  return (
    <>
      <div class="mb-4 flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h1 class="truncate text-2xl font-bold">{displayTitle(party)}</h1>
          <p class="mt-1 text-sm text-muted">
            {attacker && <>アタッカー <span class="font-semibold text-gold">★ {attacker.label}</span> ・ </>}
            攻撃 {[party.attack_element, party.attack_kind].filter(Boolean).join("・") || "未設定"}
          </p>
        </div>
        <div class="flex shrink-0 gap-1.5">
          <PostButton action={`/parties/${party.id}/duplicate`} label="複製" class="btn-xs border border-line text-muted hover:text-ink" />
          <PostButton action={`/parties/${party.id}/delete`} label="削除" class="btn-xs border border-line text-muted hover:border-red-400/60 hover:text-red-300" confirm="このパーティを削除しますか？" />
        </div>
      </div>
      <Errors errors={errors} />

      <div class="grid gap-4 lg:grid-cols-2 lg:items-start">
        {/* 編成とメーター */}
        <section class="panel p-3 sm:p-4 lg:col-start-1" aria-label="編成">
          {(["main", "sub"] as Slot[]).map((slot) => (
            <div class="mb-3 last:mb-0">
              <div class="label-caps mb-1.5">{SLOT_NAMES[slot]}</div>
              <ul class="grid grid-cols-4 gap-2">
                {[...Array(SLOT_COUNTS[slot]).keys()].map((position) => {
                  const m = memberAt(party, slot, position);
                  return m ? <SlotTile party={party} member={m} /> : (
                    <li>
                      <a href={`/characters?party=${party.id}`} class="flex h-full min-h-[100px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-faint transition-colors hover:border-gold/60 hover:text-gold">
                        <span class="text-xl leading-none">＋</span>
                        <span class="text-[11px]">追加</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <div class="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3">
            {GROUPS.filter((g) => summary[g].total > 0).map((g) => <Meter label={GROUP_NAMES[g]} s={summary[g]} />)}
          </div>
        </section>

        {/* 枠のタイルと候補 */}
        <div class="space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          {!attacker && (
            <p class="rounded-xl border border-line bg-panel-2 p-3 text-sm text-muted">
              メンバーに ★ を付けると、そのキャラを基準に武器種バフ・臨機応変・本人のみのバフまで判定します。
            </p>
          )}
          {GROUPS.map((group) => {
            const list = coverage.filter((c) => c.req.group === group);
            if (list.length === 0) return "";
            return (
              <section aria-label={GROUP_NAMES[group]}>
                <div class="mb-2 flex items-baseline justify-between">
                  <h2 class="text-sm font-bold">{GROUP_NAMES[group]}</h2>
                  <span class="text-xs text-muted tabular-nums">{summary[group].ok}/{summary[group].total}</span>
                </div>
                <ul class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {list.map((c) => <CoverageTile party={party} coverage={c} selected={need?.key === c.req.key} gain={dealt?.gains.get(c.req.key) ?? null} />)}
                </ul>
              </section>
            );
          })}
          {need && <Candidates party={party} need={need} candidates={candidates} />}
        </div>

        {/* 条件・メモ・共通パーソナリティ */}
        <div class="space-y-4 lg:col-start-1">
          <EstimatePanel party={party} dealt={dealt} taken={taken} />
          <SettingsForm party={party} />
          {party.memo && (
            <section class="panel p-4">
              <h2 class="label-caps mb-2">メモ</h2>
              <p class="text-sm leading-relaxed text-ink/90"><MultilineText text={party.memo} /></p>
            </section>
          )}
          {shared.length > 0 && (
            <section class="panel p-4">
              <h2 class="label-caps mb-1">共通パーソナリティ</h2>
              <p class="mb-3 text-xs text-faint">2人以上が持つもの。天冥アビリティやグラスタの条件に</p>
              <ul class="flex flex-wrap gap-1.5">
                {shared.map((p) => (
                  <li class={`rounded-lg px-2 py-1 text-xs ${p.category === "element" ? elementStyle(p.name).soft : "bg-panel-2 text-ink"}`} title={p.members}>
                    {p.name} <span class="font-semibold tabular-nums opacity-80">×{p.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function SlotTile({ party, member: m }: { party: Party; member: Member }) {
  const attacker = party.attacker_id === m.id;
  const icon = "btn-xs size-6 border border-line p-0 text-muted hover:border-faint hover:text-ink";
  return (
    <li class={`relative flex min-h-[100px] flex-col overflow-hidden rounded-xl border bg-panel-2 ${attacker ? "border-gold/70 shadow-[0_0_0_1px_rgb(232_196_110/0.25)]" : "border-line"}`}>
      <span class={`h-1 ${elementStyle(m.element).bar}`} aria-hidden="true"></span>
      <a href={`/characters/${m.id}`} class="block flex-1 px-2 pt-1.5 pb-1">
        <span class="mb-1 flex items-center gap-1">
          <ElementMark element={m.element} size="sm" />
          {attacker && <span class="text-xs text-gold" title="アタッカー">★</span>}
        </span>
        <span class="line-clamp-2 text-[12.5px] leading-tight font-semibold break-all">{m.label}</span>
      </a>
      <div class="flex justify-between gap-0.5 px-1.5 pb-1.5">
        <PostButton action={`/parties/${party.id}/attacker`} fields={{ character_id: m.id }} label="★" title={attacker ? "★を外す" : "アタッカーにする"}
          class={attacker ? `${icon} border-gold/70 text-gold hover:text-gold` : icon} />
        <PostButton action={`/parties/${party.id}/members/move`} fields={{ character_id: m.id }} label={m.slot === "main" ? "↓" : "↑"} title={m.slot === "main" ? "後衛へ" : "前衛へ"} class={icon} />
        <PostButton action={`/parties/${party.id}/members/remove`} fields={{ character_id: m.id }} label="✕" title="外す" class={icon} />
      </div>
    </li>
  );
}

const TILE_STYLES = {
  ok: "border-ok/35 bg-ok/[0.08]",
  partial: "border-warn/35 bg-warn/[0.07]",
  missing: "border-dashed border-line",
} as const;
const DOT_STYLES = { ok: "bg-ok", partial: "bg-warn", missing: "border border-faint" } as const;

/** 火力の倍率と与ダメ、メンバーごとの被ダメの目安 */
function EstimatePanel({ party, dealt, taken }: { party: Party; dealt: Dealt | null; taken: Taken[] }) {
  const attacker = party.members.find((m) => m.id === party.attacker_id);
  const steps = dealt ? (dealt.crit ? dealt.result.stepsCrit : dealt.result.steps) : [];
  const def = dealt?.result.hits[0]?.parts.def ?? 0;
  const { values: e, assumed } = withDefaults(party.enemy);
  // 攻撃・技の威力・防具は被ダメの実数にしか効かないので、実数を出さないときは既定値として挙げない
  const shownAssumed = party.enemy.atk == null ? assumed.filter((f) => !["atk", "power", "armor"].includes(f.key)) : assumed;
  const magic = party.boss_attack === "magic";
  return (
    <section class="panel p-4" aria-label="火力と被ダメの目安">
      <div class="mb-3 flex items-baseline justify-between gap-2">
        <h2 class="label-caps">火力の目安</h2>
        {dealt && <span class="text-[11px] text-faint">{dealt.crit ? "クリティカル前提" : "クリティカルなし"}</span>}
      </div>
      {!dealt ? (
        <p class="text-sm text-muted">
          {!attacker ? "★を付けると、アタッカーの与ダメと、支援なしから何倍になったかを出します。" : "条件でアタッカーの攻撃種を選ぶと、与ダメの目安を出します。"}
        </p>
      ) : (
        <>
          <div class="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <span class="block text-3xl leading-none font-bold text-gold tabular-nums">×{dealt.multiplier.toFixed(dealt.multiplier < 10 ? 2 : 1)}</span>
              <span class="mt-1 block text-[11px] text-muted">支援なしから</span>
            </div>
            <div class="min-w-0">
              <span class="block text-xl leading-none font-bold tabular-nums">{formatDamage(dealt.avg)}</span>
              <span class="mt-1 block truncate text-[11px] text-muted" title={dealt.skill.description}>
                与ダメ平均 ・ {dealt.skill.source}（{dealt.skill.target === "single" ? "単体" : "全体"} {Math.round(dealt.skill.rate)}%）
              </span>
            </div>
          </div>
          {steps.length > 0 && (
            <ul class="mt-3 flex flex-wrap gap-1">
              {steps.map((s) => (
                <li class="rounded-md bg-panel-2 px-1.5 text-[11px] leading-5 text-ink/85">
                  {s.label} <span class="font-semibold tabular-nums">×{s.factor.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
          <p class="mt-2 text-[11px] leading-relaxed text-faint">
            守備値 {Math.round(def)} ・ 武器 {e.weapon} で計算。△の効果・装備やグラスタ・挺身・毒ペインは含めていません。
          </p>
        </>
      )}

      <h2 class="label-caps mt-5 mb-2">被ダメの目安</h2>
      {taken.length > 0 && (
        <>
          <ul class="space-y-1.5">
            {taken.map((t) => {
              const cut = <span class="text-ok">支援で {t.reduction >= 0.0005 ? `−${(t.reduction * 100).toFixed(0)}%` : "±0%"}</span>;
              if (t.damage == null) {
                // 攻撃が未入力なら実数は出さない（ボスの攻撃は2乗で効くので、既定値の実数は当てにならない）
                return (
                  <li class="flex items-baseline justify-between gap-2 text-xs">
                    <span class="truncate">{t.member.label}</span>
                    <span class="shrink-0 tabular-nums">{cut}</span>
                  </li>
                );
              }
              const ratio = t.hp > 0 ? t.damage / t.hp : 1;
              return (
                <li>
                  <div class="flex items-baseline justify-between gap-2 text-xs">
                    <span class="truncate">{t.member.label}</span>
                    <span class={`shrink-0 tabular-nums ${ratio >= 1 ? "font-semibold text-red-300" : ratio >= 0.5 ? "text-warn" : "text-muted"}`}>
                      {formatDamage(t.damage)} <span class="text-faint">/ HP {t.hp.toLocaleString("ja-JP")}</span>{ratio >= 1 && " 落ちる"} <span class="text-[11px]">{cut}</span>
                    </span>
                  </div>
                  <span class="mt-0.5 block h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
                    <span class={`block h-full rounded-full ${ratio >= 1 ? "bg-red-400" : ratio >= 0.5 ? "bg-warn" : "bg-ok"}`} style={`width:${Math.min(100, ratio * 100)}%`}></span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p class="mt-2 text-[11px] leading-relaxed text-faint">
            {party.enemy.atk == null
              ? <>支援なしと比べた被ダメの減り方。ボスの攻撃（腕力・知性）を入れると、HP と比べた実数も出します。</>
              : <>攻撃 {e.atk}・威力 {e.power}% の全体攻撃1回・クリティカルなし。防具 {e.armor}。</>}
            {magic ? "魔法" : "物理"}{!party.boss_attack && "（未設定なので物理）"}の攻撃に、✓ の耐性UP・{magic ? "知性" : "腕力"}DOWN・バリアと本人のみの耐性を含む。
          </p>
        </>
      )}
      {shownAssumed.length > 0 && (
        <p class="mt-3 border-t border-line pt-2 text-[11px] leading-relaxed text-faint">
          既定値で計算: {shownAssumed.map((f) => `${f.label} ${f.default}`).join("・")}。条件の「想定ボス」で変えられます。
        </p>
      )}
    </section>
  );
}

function CoverageTile({ party, coverage: c, selected, gain }: { party: Party; coverage: Coverage; selected: boolean; gain: number | null }) {
  const names = new Map(party.members.map((m) => [m.id, m.name]));
  const shown = c.providers.slice(0, 3);
  // 一番良い供給元（そのまま効くもの優先・効果量順に並んでいる）の強さをタイルの顔にする
  const best = c.providers[0] && fitRank(c.providers[0].fit) > 0 ? c.providers[0] : undefined;
  const bestValue = best ? formatValue(best.effect.type, best.effect.value) : "";
  const pct = best ? strengthOf(best.effect.type, best.effect.value) : null;
  return (
    <li>
      <a
        href={selected ? `/parties/${party.id}` : `/parties/${party.id}?need=${c.req.key}#candidates`}
        class={`flex h-full flex-col rounded-xl border p-2.5 transition-colors hover:border-gold/60 ${TILE_STYLES[c.status]} ${selected ? "ring-2 ring-gold" : ""}`}
        aria-current={selected ? "true" : undefined}
        title={c.providers.map((p) => [`${names.get(p.characterId)}: ${p.effect.description || p.effect.type}`, p.fit.note].filter(Boolean).join(" / ")).join("\n") || c.req.hint}
      >
        <span class="flex items-start justify-between gap-2">
          <span class="flex min-w-0 items-start gap-1.5">
            <span class={`mt-1 size-2 shrink-0 rounded-full ${DOT_STYLES[c.status]}`} aria-hidden="true"></span>
            <span class={`text-[13px] leading-tight font-semibold [overflow-wrap:anywhere] ${c.status === "missing" ? "text-muted" : ""}`}>{c.req.label}</span>
          </span>
          {bestValue && <span class={`shrink-0 text-sm leading-tight font-bold tabular-nums ${strengthText(pct)}`}>{bestValue}</span>}
        </span>
        {pct != null && (
          <span class="mt-1.5 block h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
            <span class={`block h-full rounded-full ${strengthBar(pct)}`} style={`width:${pct}%`}></span>
          </span>
        )}
        {gain != null && gain >= 0.005 && (
          <span class="mt-1 block text-[11px] font-semibold text-gold tabular-nums" title="この枠の効果を外したときと比べた与ダメの伸び">与ダメ {formatGain(gain)}</span>
        )}
        {c.providers.length === 0 ? (
          <span class="mt-1 block truncate text-[11px] text-faint">{c.req.hint || "候補を見る"}</span>
        ) : (
          <span class="mt-1 space-y-px">
            {shown.map((p) => (
              <span class="block text-[11px] leading-snug text-muted">
                <span class={p.characterId === party.attacker_id ? "font-semibold text-gold" : "text-ink/85"}>{p.characterId === party.attacker_id && "★"}{names.get(p.characterId)}</span>
                {p.effect.type !== c.req.label && <> {shortType(p.effect.type)}</>}
                {[formatValue(p.effect.type, p.effect.value), turnsLabel(p.effect.turns)].filter(Boolean).map((part) => <> <span class="whitespace-nowrap text-ink/70">{part}</span></>)}
                {p.fit.level === "partial" && <span class="text-warn"> △</span>}
                {p.fit.level === "unmet" && <span class="text-faint" title="今の編成では条件を満たさない"> ✗</span>}
                {p.fit.level === "sb" && <span class="text-faint" title="SB発動ターンだけの効果なので枠は埋めない"> SB</span>}
              </span>
            ))}
            {c.providers.length > shown.length && <span class="block text-[11px] text-faint">他{c.providers.length - shown.length}人</span>}
          </span>
        )}
      </a>
    </li>
  );
}

function SettingsForm({ party }: { party: Party }) {
  const attack = [party.attack_element, party.attack_kind].filter(Boolean).join("・") || "未設定";
  const boss = [party.boss_element && `${party.boss_element}属性`, { physical: "物理", magic: "魔法" }[party.boss_attack],
    party.boss_needs.length > 0 && `必須${party.boss_needs.length}件`].filter(Boolean).join("・") || "未設定";
  const select = "field w-auto pr-8";
  return (
    <details class="panel group">
      <summary class="flex cursor-pointer list-none items-center justify-between gap-2 p-4">
        <span class="min-w-0">
          <span class="label-caps block">条件</span>
          <span class="mt-0.5 block truncate text-sm">攻撃 {attack} ／ 想定ボス {boss}</span>
        </span>
        <span class="shrink-0 text-xs text-gold group-open:hidden">変更</span>
        <span class="hidden shrink-0 text-xs text-muted group-open:inline">閉じる</span>
      </summary>
      <form method="post" action={`/parties/${party.id}/settings`} class="space-y-4 border-t border-line p-4">
        <label class="block">
          <span class="label-caps mb-1.5 block">パーティ名</span>
          <input class="field" name="title" value={party.title} maxlength="100" placeholder={displayTitle(party)} />
        </label>
        <fieldset>
          <legend class="label-caps mb-1.5">アタッカーの攻撃</legend>
          <div class="flex gap-2">
            <select name="attack_element" class={select} aria-label="攻撃属性">
              <option value="">属性</option>
              {ATTACK_ELEMENTS.map((e) => <option value={e} selected={party.attack_element === e}>{e}</option>)}
            </select>
            <select name="attack_kind" class={select} aria-label="攻撃種">
              <option value="">攻撃種</option>
              {ATTACK_KINDS.map((k) => <option value={k} selected={party.attack_kind === k}>{k}</option>)}
            </select>
          </div>
        </fieldset>
        <fieldset>
          <legend class="label-caps mb-1.5">想定ボス</legend>
          <div class="mb-3 flex flex-wrap gap-2">
            <select name="boss_element" class={select} aria-label="ボスの攻撃属性">
              <option value="">攻撃属性: 不明</option>
              {ATTACK_ELEMENTS.map((e) => <option value={e} selected={party.boss_element === e}>{e}</option>)}
            </select>
            <select name="boss_attack" class={select} aria-label="ボスの攻撃の種類">
              <option value="">物理/魔法: 不明</option>
              <option value="physical" selected={party.boss_attack === "physical"}>物理中心</option>
              <option value="magic" selected={party.boss_attack === "magic"}>魔法中心</option>
            </select>
          </div>
          <div class="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ENEMY_FIELDS.filter((f) => f.key !== "weapon" && f.key !== "armor").map((f) => <EnemyInput party={party} field={f} />)}
            <label class="block" title="アタッカーの攻撃の属性に対して">
              <span class="mb-1 block text-[11px] text-muted">弱点・耐性</span>
              <select name="enemy_affinity" class="field">
                <option value="">通常</option>
                {Object.entries(AFFINITIES).map(([value, label]) => <option value={value} selected={party.enemy.affinity === value}>{label}</option>)}
              </select>
            </label>
          </div>
          <div class="flex flex-wrap gap-1.5">
            {BOSS_NEEDS.map((n) => (
              <label class="cursor-pointer" title={n.hint}>
                <input type="checkbox" name="boss_needs" value={n.key} checked={party.boss_needs.includes(n.key)} class="peer sr-only" />
                <span class="inline-block rounded-full border border-line px-2.5 py-1 text-xs text-muted peer-checked:border-gold/70 peer-checked:bg-gold/15 peer-checked:text-gold peer-focus-visible:ring-2 peer-focus-visible:ring-gold">
                  {n.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend class="label-caps mb-1.5">味方の装備（目安の計算用の仮定）</legend>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ENEMY_FIELDS.filter((f) => f.key === "weapon" || f.key === "armor").map((f) => <EnemyInput party={party} field={f} />)}
          </div>
        </fieldset>
        <label class="block">
          <span class="label-caps mb-1.5 block">メモ</span>
          <textarea class="field" name="memo" rows="3" placeholder="立ち回り・グラスタなど">{party.memo}</textarea>
        </label>
        <button type="submit" class="btn-gold">保存</button>
      </form>
    </details>
  );
}

function EnemyInput({ party, field: f }: { party: Party; field: (typeof ENEMY_FIELDS)[number] }) {
  return (
    <label class="block" title={f.hint}>
      <span class="mb-1 block truncate text-[11px] text-muted">{f.label}</span>
      <input class="field" type="number" step="any" min={String(f.min)} max={String(f.max)} name={`enemy_${f.key}`}
        value={party.enemy[f.key] == null ? "" : String(party.enemy[f.key])} placeholder={`既定 ${f.default}`} />
    </label>
  );
}

function Candidates({ party, need, candidates }: { party: Party; need: Requirement; candidates: Candidate[] }) {
  const full = party.members.length >= SLOT_COUNTS.main + SLOT_COUNTS.sub;
  return (
    <section id="candidates" class="panel scroll-mt-20 overflow-hidden" aria-label="候補">
      <div class="flex items-start justify-between gap-3 border-b border-line bg-panel-2/60 p-4">
        <div>
          <h2 class="font-bold"><span class="text-gold">{need.label}</span> を埋める</h2>
          <p class="mt-0.5 text-xs text-muted">
            そのまま効く → ほかの枠も多く埋まる → 与ダメの伸び・効果量の大きい順
            {full && <span class="text-warn"> ・ 満員なので、追加するには誰かを外してください</span>}
          </p>
        </div>
        <a href={`/parties/${party.id}`} class="btn-xs shrink-0 border border-line text-muted hover:text-ink" aria-label="候補を閉じる">✕</a>
      </div>
      {candidates.length === 0 ? <p class="p-4 text-sm text-muted">見つかりませんでした</p> : (
        <ul class="divide-y divide-line">
          {candidates.map((c) => <CandidateRow party={party} need={need} c={c} full={full} />)}
        </ul>
      )}
    </section>
  );
}

function CandidateRow({ party, need, c, full }: { party: Party; need: Requirement; c: Candidate; full: boolean }) {
  const value = formatValue(c.effect.type, c.effect.value);
  const pct = strengthOf(c.effect.type, c.effect.value);
  return (
    <li class="flex gap-3 p-3 sm:px-4">
      <ElementMark element={c.character.element} />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <a href={`/characters/${c.character.id}`} class="font-semibold hover:text-gold">{c.character.label}</a>
          {value && <span class={`text-sm font-bold tabular-nums ${strengthText(pct)}`}>{value}</span>}
          {c.gain != null && (
            <span class="rounded bg-gold/15 px-1.5 text-[11px] leading-5 font-semibold text-gold tabular-nums" title="入れたときの与ダメの伸び（この枠の分だけ）">
              与ダメ {c.gain >= 0.0005 ? formatGain(c.gain) : "±0%"}
            </span>
          )}
          <span class="text-[11px] text-muted">
            {[c.effect.type !== need.label ? shortType(c.effect.type) : "", turnsLabel(c.effect.turns)].filter(Boolean).join(" ")}
          </span>
          {c.fit.level === "partial" && <span class="rounded bg-warn/15 px-1.5 text-[11px] leading-5 font-semibold text-warn">条件付き</span>}
          {c.fit.level === "unmet" && <span class="rounded bg-line px-1.5 text-[11px] leading-5 font-semibold text-muted">条件未達</span>}
          {c.fit.level === "sb" && <span class="rounded bg-line px-1.5 text-[11px] leading-5 font-semibold text-muted" title={c.fit.note}>SB時のみ</span>}
          <Tags c={c.character} compact />
        </div>
        <p class="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
          {c.effect.description || c.effect.type}<span class="text-faint"> — {c.effect.source}</span>
        </p>
        {c.fit.note && <p class="mt-0.5 text-[11px] text-warn/90">{c.fit.note}</p>}
        {c.extra.length > 0 && (
          <div class="mt-1.5 flex flex-wrap gap-1">
            {c.extra.map((label) => <span class="rounded-full border border-gold/30 px-2 text-[11px] leading-5 text-gold">＋{label}</span>)}
          </div>
        )}
      </div>
      {!full && (
        <div class="flex shrink-0 flex-col gap-1.5">
          <PostButton action={`/parties/${party.id}/members`} fields={{ character_id: c.character.id, slot: "main", return_need: need.key }} label="前衛" class="btn-xs bg-gold text-night hover:bg-[#f3d58f]" />
          <PostButton action={`/parties/${party.id}/members`} fields={{ character_id: c.character.id, slot: "sub", return_need: need.key }} label="後衛" class="btn-xs border border-line text-ink hover:bg-panel-2" />
        </div>
      )}
    </li>
  );
}
