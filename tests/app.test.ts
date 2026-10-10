import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app.tsx";
import { idOf, testDb } from "./fixtures.ts";

const ORIGIN = "http://localhost";

function setup() {
  const db = testDb();
  const app = createApp(db);
  const get = (path: string) => app.handle(new Request(ORIGIN + path));
  const post = (path: string, fields: Record<string, string | string[]>, origin: string | null = ORIGIN) => {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(fields)) for (const value of [v].flat()) body.append(k, value);
    const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", host: "localhost" };
    if (origin) headers.origin = origin;
    return app.handle(new Request(ORIGIN + path, { method: "POST", body, headers }));
  };
  return { db, get, post };
}

describe("画面", () => {
  test("一覧・検索・詳細が表示される", async () => {
    const { db, get } = setup();
    expect((await get("/")).status).toBe(200);
    const search = await (await get("/characters?q=" + encodeURIComponent("てすと"))).text();
    expect(search).toContain("テストアタッカー");
    expect((await get(`/characters/${idOf(db, "テスト支援")}`)).status).toBe(200);
    expect((await get("/characters/99999")).status).toBe(404);
  });

  test("ユーザー入力はエスケープされる", async () => {
    const { db, get, post } = setup();
    const res = await post("/parties", { attacker_id: String(idOf(db, "テストアタッカー")) });
    const path = new URL(res.headers.get("location")!, ORIGIN).pathname;
    await post(`${path}/settings`, { title: "<script>alert(1)</script>", memo: "" });
    const page = await (await get(path)).text();
    expect(page).not.toContain("<script>alert(1)</script>");
    expect(page).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});

describe("パーティ操作", () => {
  test("キャラから作成し、候補から追加すると枠が埋まる", async () => {
    const { db, get, post } = setup();
    const res = await post("/parties", { attacker_id: String(idOf(db, "テストアタッカー")) });
    expect(res.status).toBe(303);
    const path = new URL(res.headers.get("location")!, ORIGIN).pathname;

    const candidates = await (await get(`${path}?need=zone`)).text();
    expect(candidates).toContain("テスト陣");

    const add = await post(`${path}/members`, { character_id: String(idOf(db, "テスト陣")), slot: "main", return_need: "zone" });
    expect(add.headers.get("location")).toBe(`${path}?need=zone#candidates`);
    const page = await (await get(path)).text();
    expect(page).toContain("テスト陣");
  });

  test("想定ボスの必須能力は複数選べる", async () => {
    const { db, post, get } = setup();
    const res = await post("/parties", { attacker_id: String(idOf(db, "テストアタッカー")) });
    const path = new URL(res.headers.get("location")!, ORIGIN).pathname;
    await post(`${path}/settings`, { title: "", memo: "", boss_needs: ["break", "revive"] });
    const page = await (await get(path)).text();
    expect(page).toContain("ブレイク");
    expect(page).toContain("戦闘不能回復");
  });
});

describe("火力・被ダメの目安", () => {
  test("想定ボスの能力を保存すると、倍率・与ダメ・被ダメを表示し、入力が範囲外なら 422", async () => {
    const { db, get, post } = setup();
    const res = await post("/parties", { attacker_id: String(idOf(db, "テストアタッカー")) });
    const path = new URL(res.headers.get("location")!, ORIGIN).pathname;
    // 何も入れなくても既定値で被ダメまで出す
    const fresh = await (await get(path)).text();
    expect(fresh).toContain("支援で ±0%");
    expect(fresh).toContain("既定値で計算: Lv 140");

    const settings = { title: "", memo: "", attack_element: "火", attack_kind: "斬", boss_attack: "physical" };
    expect((await post(`${path}/settings`, { ...settings, enemy_def: "400", enemy_atk: "600", enemy_affinity: "weak" })).status).toBe(303);
    const page = await (await get(path)).text();
    expect(page).toContain("支援なしから");
    expect(page).toContain("与ダメ平均");
    expect(page).toContain("HP 3,000");
    expect(page).toContain('name="enemy_def" value="400"');

    const bad = await post(`${path}/settings`, { ...settings, enemy_level: "0" });
    expect(bad.status).toBe(422);
    expect(await bad.text()).toContain("想定ボスの「Lv」は 1〜999 の数で入れてください");
  });
});

describe("CSRF", () => {
  test("他サイトからの POST は 403", async () => {
    const { db, post } = setup();
    const res = await post("/parties", { attacker_id: String(idOf(db, "テストアタッカー")) }, "https://evil.example");
    expect(res.status).toBe(403);
    expect(db.query("SELECT COUNT(*) AS n FROM parties").get()).toEqual({ n: 0 });
  });
});
