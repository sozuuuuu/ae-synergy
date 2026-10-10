import type { Db } from "../db.ts";
import type { CharacterSummary } from "./characters.ts";
import { ATTACK_ELEMENTS, ATTACK_KINDS, BOSS_NEEDS, defaultAttack, type PartyContext } from "./requirements.ts";

export const SLOT_NAMES = { main: "前衛", sub: "後衛" } as const;
export type Slot = keyof typeof SLOT_NAMES;
export const SLOT_COUNTS: Record<Slot, number> = { main: 4, sub: 2 };

export const LIMITS = { title: 100, memo: 10_000 };

export type PartyRow = {
  id: number;
  title: string;
  memo: string;
  attacker_id: number | null;
  attack_element: string;
  attack_kind: string;
  boss_element: string;
  boss_attack: string;
  boss_needs: string;
  created_at: string;
  updated_at: string;
};
export type Member = CharacterSummary & { slot: Slot; position: number };
export type Party = Omit<PartyRow, "boss_needs"> & { boss_needs: string[]; members: Member[] };

export const displayTitle = (party: Pick<Party, "title" | "members" | "attacker_id">) => {
  if (party.title) return party.title;
  const attacker = party.members.find((m) => m.id === party.attacker_id);
  return attacker ? `${attacker.label}のパーティ` : "無題のパーティ";
};

export const memberAt = (party: Pick<Party, "members">, slot: Slot, position: number) =>
  party.members.find((m) => m.slot === slot && m.position === position);

const touch = (db: Db, id: number) =>
  db.query("UPDATE parties SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = $id").run({ id });

function loadMembers(db: Db, partyIds: number[]): Map<number, Member[]> {
  const map = new Map<number, Member[]>();
  if (partyIds.length === 0) return map;
  const rows = db
    .query<Member & { party_id: number }, any>(
      `SELECT m.party_id, m.slot, m.position, c.id, c.name, c.label, c.class_name, c.style, c.rarity, c.weapon,
         c.armor, c.ls_type, c.element, c.is_alter, c.is_sa
       FROM party_members m JOIN characters c ON c.id = m.character_id
       WHERE m.party_id IN (${partyIds.map((_, i) => `$i${i}`).join(", ")})
       ORDER BY m.party_id, m.slot, m.position`,
    )
    .all(Object.fromEntries(partyIds.map((id, i) => [`i${i}`, id])));
  for (const { party_id, ...member } of rows) {
    if (!map.has(party_id)) map.set(party_id, []);
    map.get(party_id)!.push(member);
  }
  return map;
}

const hydrate = (row: PartyRow, members: Member[]): Party => ({ ...row, boss_needs: safeJsonArray(row.boss_needs), members });
const safeJsonArray = (json: string): string[] => {
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
};

export function getParty(db: Db, id: number): Party | null {
  const row = db.query<PartyRow, any>("SELECT * FROM parties WHERE id = $id").get({ id });
  return row ? hydrate(row, loadMembers(db, [row.id]).get(row.id) ?? []) : null;
}

/** 更新が新しい順。character を渡すとそのキャラを含むものだけ */
export function listParties(db: Db, { character }: { character?: number } = {}): Party[] {
  const rows = character
    ? db.query<PartyRow, any>(
        "SELECT p.* FROM parties p WHERE EXISTS (SELECT 1 FROM party_members m WHERE m.party_id = p.id AND m.character_id = $character) ORDER BY p.updated_at DESC, p.id DESC",
      ).all({ character })
    : db.query<PartyRow, []>("SELECT * FROM parties ORDER BY updated_at DESC, id DESC").all();
  const members = loadMembers(db, rows.map((r) => r.id));
  return rows.map((row) => hydrate(row, members.get(row.id) ?? []));
}

/** キャラを前衛1枠目に入れ、アタッカーにしてパーティを作る */
export function createParty(db: Db, attackerId: number): number | null {
  const exists = db.query("SELECT 1 FROM characters WHERE id = $id").get({ id: attackerId });
  if (!exists) return null;
  const attack = defaultAttack(db, attackerId);
  return db.transaction(() => {
    const id = db
      .query<{ id: number }, any>(
        "INSERT INTO parties (attacker_id, attack_element, attack_kind) VALUES ($attackerId, $element, $kind) RETURNING id",
      )
      .get({ attackerId, element: attack.element, kind: attack.kind })!.id;
    db.query("INSERT INTO party_members (party_id, character_id, slot, position) VALUES ($id, $attackerId, 'main', 0)").run({ id, attackerId });
    return id;
  })();
}

/** 空いている枠（前衛優先、slot 指定があればその枠）に入れる。満員なら false */
export function addMember(db: Db, party: Party, characterId: number, slot?: Slot): { ok: boolean; error?: string } {
  if (party.members.some((m) => m.id === characterId)) return { ok: false, error: "すでにパーティにいます" };
  if (!db.query("SELECT 1 FROM characters WHERE id = $id").get({ id: characterId })) return { ok: false, error: "キャラクターが見つかりません" };
  const slots: Slot[] = slot ? [slot] : ["main", "sub"];
  for (const s of slots) {
    for (let position = 0; position < SLOT_COUNTS[s]; position++) {
      if (memberAt(party, s, position)) continue;
      db.query("INSERT INTO party_members (party_id, character_id, slot, position) VALUES ($party, $character, $slot, $position)")
        .run({ party: party.id, character: characterId, slot: s, position });
      touch(db, party.id);
      return { ok: true };
    }
  }
  return { ok: false, error: slot ? `${SLOT_NAMES[slot]}が満員です` : "パーティが満員です（前衛4・後衛2）" };
}

export function removeMember(db: Db, party: Party, characterId: number) {
  db.transaction(() => {
    db.query("DELETE FROM party_members WHERE party_id = $party AND character_id = $character").run({ party: party.id, character: characterId });
    if (party.attacker_id === characterId) db.query("UPDATE parties SET attacker_id = NULL WHERE id = $id").run({ id: party.id });
    touch(db, party.id);
  })();
}

/** 前衛⇔後衛を移す。移動先が満員なら、移動先の最後の人と入れ替える */
export function moveMember(db: Db, party: Party, characterId: number): { ok: boolean; error?: string } {
  const member = party.members.find((m) => m.id === characterId);
  if (!member) return { ok: false, error: "パーティにいません" };
  const to: Slot = member.slot === "main" ? "sub" : "main";
  db.transaction(() => {
    const free = [...Array(SLOT_COUNTS[to]).keys()].find((p) => !memberAt(party, to, p));
    const move = db.query("UPDATE party_members SET slot = $slot, position = $position WHERE party_id = $party AND character_id = $character");
    if (free !== undefined) {
      move.run({ slot: to, position: free, party: party.id, character: characterId });
    } else {
      const swap = memberAt(party, to, SLOT_COUNTS[to] - 1)!;
      move.run({ slot: "sub", position: 99, party: party.id, character: swap.id }); // 一時退避
      move.run({ slot: to, position: SLOT_COUNTS[to] - 1, party: party.id, character: characterId });
      move.run({ slot: member.slot, position: member.position, party: party.id, character: swap.id });
    }
    touch(db, party.id);
  })();
  return { ok: true };
}

export function setAttacker(db: Db, party: Party, characterId: number) {
  if (!party.members.some((m) => m.id === characterId)) return;
  const attack = defaultAttack(db, characterId);
  db.query("UPDATE parties SET attacker_id = $characterId, attack_element = $element, attack_kind = $kind, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = $id")
    .run({ id: party.id, characterId, element: attack.element, kind: attack.kind });
}

export type SettingsInput = {
  title: string;
  memo: string;
  attackElement: string;
  attackKind: string;
  bossElement: string;
  bossAttack: string;
  bossNeeds: string[];
};

export function updateSettings(db: Db, party: Party, input: SettingsInput): { errors: string[] } {
  const errors: string[] = [];
  const title = input.title.trim();
  const memo = input.memo.replace(/\r\n/g, "\n").trim();
  if (title.length > LIMITS.title) errors.push(`パーティ名は${LIMITS.title}文字以内にしてください`);
  if (memo.length > LIMITS.memo) errors.push(`メモは${LIMITS.memo}文字以内にしてください`);
  if (errors.length) return { errors };
  const pick = (value: string, allowed: readonly string[]) => (allowed.includes(value) ? value : "");
  db.query(
    `UPDATE parties SET title = $title, memo = $memo, attack_element = $attackElement, attack_kind = $attackKind,
       boss_element = $bossElement, boss_attack = $bossAttack, boss_needs = $bossNeeds,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = $id`,
  ).run({
    id: party.id,
    title,
    memo,
    attackElement: pick(input.attackElement, ATTACK_ELEMENTS),
    attackKind: pick(input.attackKind, ATTACK_KINDS),
    bossElement: pick(input.bossElement, ATTACK_ELEMENTS),
    bossAttack: pick(input.bossAttack, ["physical", "magic"]),
    bossNeeds: JSON.stringify(input.bossNeeds.filter((key) => BOSS_NEEDS.some((n) => n.key === key))),
  });
  return { errors: [] };
}

export function duplicateParty(db: Db, id: number): number | null {
  const party = getParty(db, id);
  if (!party) return null;
  return db.transaction(() => {
    const copyId = db
      .query<{ id: number }, any>(
        `INSERT INTO parties (title, memo, attacker_id, attack_element, attack_kind, boss_element, boss_attack, boss_needs)
         SELECT $title, memo, attacker_id, attack_element, attack_kind, boss_element, boss_attack, boss_needs FROM parties WHERE id = $id RETURNING id`,
      )
      .get({ id, title: `${displayTitle(party)}のコピー`.slice(0, LIMITS.title) })!.id;
    db.query("INSERT INTO party_members (party_id, character_id, slot, position) SELECT $copyId, character_id, slot, position FROM party_members WHERE party_id = $id")
      .run({ copyId, id });
    return copyId;
  })();
}

export function deleteParty(db: Db, id: number) {
  db.query("DELETE FROM parties WHERE id = $id").run({ id });
}

/** 判定ルールに渡す文脈 */
export function partyContext(db: Db, party: Party): PartyContext {
  const attacker = party.members.find((m) => m.id === party.attacker_id) ?? null;
  const personalities = attacker
    ? db.query<{ name: string }, any>(
        "SELECT p.name FROM character_personalities cp JOIN personalities p ON p.id = cp.personality_id WHERE cp.character_id = $id",
      ).all({ id: attacker.id }).map((r) => r.name)
    : [];
  return {
    attacker: attacker ? { id: attacker.id, weapon: attacker.weapon, ls_type: attacker.ls_type, personalities } : null,
    attackElement: party.attack_element,
    attackKind: party.attack_kind,
    bossElement: party.boss_element,
    bossAttack: party.boss_attack,
    bossNeeds: party.boss_needs,
  };
}

/** パーティ内で共通するパーソナリティ（天冥アビリティやグラスタの条件確認用）。2人以上が持つものを多い順に */
export function sharedPersonalities(db: Db, partyId: number) {
  return db
    .query<{ name: string; category: string; count: number; members: string }, any>(
      `SELECT p.name, p.category, COUNT(*) AS count, GROUP_CONCAT(c.label, '、') AS members
       FROM party_members m
       JOIN characters c ON c.id = m.character_id
       JOIN character_personalities cp ON cp.character_id = m.character_id
       JOIN personalities p ON p.id = cp.personality_id
       WHERE m.party_id = $partyId
       GROUP BY p.id HAVING COUNT(*) >= 2
       ORDER BY count DESC, CASE p.category WHEN 'element' THEN 0 WHEN 'weapon' THEN 1 ELSE 2 END, p.name`,
    )
    .all({ partyId });
}
