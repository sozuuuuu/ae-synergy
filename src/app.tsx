import { Elysia } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import type { SafeHtml } from "@/jsx/jsx-runtime.ts";
import type { Db } from "./db.ts";
import { html, int, isSameOriginRequest, list, redirect, str, takeFlash } from "./lib/http.ts";
import { charactersByIds, getCharacter, listPersonalities, searchCharacters, type CharacterFilters } from "./models/characters.ts";
import {
  addMember, createParty, deleteParty, displayTitle, duplicateParty, getParty, listParties, moveMember,
  partyContext, removeMember, setAttacker, sharedPersonalities, updateSettings, type Party,
} from "./models/parties.ts";
import { candidatesFor, evaluateCoverage, extraFills, requirementsFor } from "./models/requirements.ts";
import { CharacterPage, CharacterSearchPage } from "./views/characters.tsx";
import { Layout, type Flash } from "./views/layout.tsx";
import { PartyListPage, PartyPage, summarize } from "./views/parties.tsx";

type Options = { publicOrigin?: string };

export function createApp(db: Db, options: Options = {}) {
  const page = (request: Request, title: string | undefined, body: SafeHtml, status = 200) => {
    const { flash, clear } = takeFlash(request);
    const path = new URL(request.url).pathname;
    return html(<Layout title={title} path={path} flash={flash}>{body}</Layout>, status, clear);
  };
  const notFound = (request: Request) => page(request, "見つかりません", <p class="text-slate-500">ページが見つかりませんでした。</p>, 404);
  const back = (party: Party, flash?: Flash, need?: string) =>
    redirect(`/parties/${party.id}${need ? `?need=${encodeURIComponent(need)}#candidates` : ""}`, flash);

  const renderParty = (request: Request, party: Party, needKey: string | null, errors: string[] = [], status = 200) => {
    const ctx = partyContext(db, party);
    const memberIds = party.members.map((m) => m.id);
    const coverage = evaluateCoverage(db, ctx, memberIds);
    const need = needKey ? requirementsFor(ctx).find((r) => r.key === needKey) ?? null : null;
    let candidates: Parameters<typeof PartyPage>[0]["candidates"] = [];
    if (need) {
      const providers = candidatesFor(db, ctx, need, memberIds, 200);
      const ids = providers.map((p) => p.characterId);
      const characters = charactersByIds(db, ids);
      const extras = extraFills(db, ctx, coverage, ids, need.key);
      // パズルとして、そのまま効く → ほかの枠もたくさん埋まる → 効果量が大きい の順
      candidates = providers
        .map((p) => ({ ...p, character: characters.get(p.characterId)!, extra: extras.get(p.characterId) ?? [] }))
        .sort((a, b) =>
          (b.fit.level === "full" ? 1 : 0) - (a.fit.level === "full" ? 1 : 0) ||
          b.extra.length - a.extra.length ||
          (b.effect.value ?? 0) - (a.effect.value ?? 0))
        .slice(0, 30);
    }
    return page(request, displayTitle(party),
      <PartyPage party={party} coverage={coverage} need={need} candidates={candidates} shared={sharedPersonalities(db, party.id)} errors={errors} />, status);
  };

  return new Elysia()
    .use(staticPlugin({ assets: "static", prefix: "/static", alwaysStatic: false }))
    // 認証がないので、他サイトからの書き込みだけは確実に断る
    .onBeforeHandle(({ request }) => {
      if (request.method !== "GET" && request.method !== "HEAD" && !isSameOriginRequest(request, options.publicOrigin)) {
        return new Response("Forbidden", { status: 403 });
      }
    })
    .get("/up", () => new Response("ok"))

    .get("/", ({ request }) => {
      const parties = listParties(db);
      const summaries = new Map(parties.map((party) =>
        [party.id, summarize(evaluateCoverage(db, partyContext(db, party), party.members.map((m) => m.id)))]));
      return page(request, "パーティ", <PartyListPage parties={parties} summaries={summaries} />);
    })

    .get("/characters", ({ request }) => {
      const query = new URL(request.url).searchParams;
      const filters: CharacterFilters = {
        q: query.get("q") ?? "",
        effect: query.get("effect") ?? "",
        element: query.get("element") ?? "",
        weapon: query.get("weapon") ?? "",
        style: query.get("style") ?? "",
        ls: query.get("ls") ?? "",
        alter: query.get("alter") ?? "",
        personality: query.getAll("personality").filter(Boolean),
      };
      const partyId = int(query.get("party"));
      const party = partyId ? getParty(db, partyId) : null;
      const result = searchCharacters(db, filters, { page: Math.max(1, int(query.get("page")) ?? 1) });
      const personalities = listPersonalities(db).filter((p) => p.category === "other");
      return page(request, "キャラ検索", <CharacterSearchPage filters={filters} result={result} personalities={personalities} party={party} query={query} />);
    })

    .get("/characters/:id", ({ request, params }) => {
      const id = int(params.id);
      const character = id ? getCharacter(db, id) : null;
      if (!character) return notFound(request);
      return page(request, character.label, <CharacterPage character={character} parties={listParties(db, { character: character.id })} />);
    })

    .post("/parties", ({ body }) => {
      const id = createParty(db, int((body as any)?.attacker_id) ?? 0);
      return id ? redirect(`/parties/${id}`, { type: "notice", message: "このキャラをアタッカー（★）にして組み始めました。支援役から始めたときは、アタッカーを追加して★を付け替えてください。" })
        : redirect("/characters", { type: "alert", message: "キャラクターが見つかりません" });
    })

    .get("/parties/:id", ({ request, params }) => {
      const party = getParty(db, int(params.id) ?? 0);
      if (!party) return notFound(request);
      return renderParty(request, party, new URL(request.url).searchParams.get("need"));
    })

    .post("/parties/:id/settings", ({ request, params, body }) => {
      const party = getParty(db, int(params.id) ?? 0);
      if (!party) return notFound(request);
      const b = (body ?? {}) as Record<string, unknown>;
      const { errors } = updateSettings(db, party, {
        title: str(b.title), memo: str(b.memo), attackElement: str(b.attack_element), attackKind: str(b.attack_kind),
        bossElement: str(b.boss_element), bossAttack: str(b.boss_attack), bossNeeds: list(b.boss_needs),
      });
      if (errors.length) return renderParty(request, party, null, errors, 422);
      return back(party, { type: "notice", message: "保存しました" });
    })

    .post("/parties/:id/members", ({ request, params, body }) => {
      const party = getParty(db, int(params.id) ?? 0);
      if (!party) return notFound(request);
      const b = (body ?? {}) as Record<string, unknown>;
      const slot = str(b.slot) === "sub" ? "sub" : str(b.slot) === "main" ? "main" : undefined;
      const result = addMember(db, party, int(b.character_id) ?? 0, slot);
      return back(party, result.ok ? undefined : { type: "alert", message: result.error! }, str(b.return_need) || undefined);
    })

    .post("/parties/:id/members/remove", ({ request, params, body }) => {
      const party = getParty(db, int(params.id) ?? 0);
      if (!party) return notFound(request);
      removeMember(db, party, int((body as any)?.character_id) ?? 0);
      return back(party);
    })

    .post("/parties/:id/members/move", ({ request, params, body }) => {
      const party = getParty(db, int(params.id) ?? 0);
      if (!party) return notFound(request);
      const result = moveMember(db, party, int((body as any)?.character_id) ?? 0);
      return back(party, result.ok ? undefined : { type: "alert", message: result.error! });
    })

    .post("/parties/:id/attacker", ({ request, params, body }) => {
      const party = getParty(db, int(params.id) ?? 0);
      if (!party) return notFound(request);
      setAttacker(db, party, int((body as any)?.character_id) ?? 0);
      return back(party);
    })

    .post("/parties/:id/duplicate", ({ request, params }) => {
      const id = duplicateParty(db, int(params.id) ?? 0);
      return id ? redirect(`/parties/${id}`, { type: "notice", message: "複製しました" }) : notFound(request);
    })

    .post("/parties/:id/delete", ({ request, params }) => {
      const party = getParty(db, int(params.id) ?? 0);
      if (!party) return notFound(request);
      deleteParty(db, party.id);
      return redirect("/", { type: "notice", message: `「${displayTitle(party)}」を削除しました` });
    })

    .onError(({ code, request, error }) => {
      if (code === "NOT_FOUND") return notFound(request);
      console.error(error);
      return page(request, "エラー", <p class="text-slate-500">エラーが発生しました。</p>, 500);
    });
}
