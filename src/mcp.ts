// ae-synergy の自動編成を MCP のツールにする（stdio）。
//   claude mcp add -s user ae-synergy -- bun C:/Users/sosuu/ae-synergy/src/mcp.ts
// DB はアプリと同じもの（storage/ae-synergy.sqlite3、DATABASE_PATH で変更可）。stdout は MCP の通信に使うので console.log しない。
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// 設定の相対パス（storage/...）をリポジトリから解決するため、読み込む前に移る
process.chdir(join(import.meta.dir, ".."));
const { config } = await import("./config.ts");
const { openDb } = await import("./db.ts");
const { NEEDABLE } = await import("./models/autobuild.ts");
const { BuildError, resolveCharacter, runBuild } = await import("./models/build-request.ts");
const { charactersByIds, setOwned, unownedIds } = await import("./models/characters.ts");
const { ENEMY_FIELDS } = await import("./models/estimate.ts");

const db = openDb(config.databasePath);
const server = new McpServer({ name: "ae-synergy", version: "1.0.0" });
const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const failure = (error: unknown) => {
  if (error instanceof BuildError) return { ...text(error.message), isError: true };
  throw error;
};

server.registerTool(
  "build_party",
  {
    title: "アナデン パーティ自動編成",
    description:
      "Build an Another Eden (アナザーエデン) front line (4 members) around an attacker (★), maximizing estimated damage. " +
      "Back row is left empty (it does not act; usually grasta holders), and VC is not counted. " +
      "Durability / boss counters are NOT filled for their own sake: pass the ones this enemy needs in `need`, and they are always satisfied. " +
      "Slots covered by the attacker's equipment (default: the Elpis weapon of its type, which gives 下克上 and crit rate +100%) are not credited to characters. " +
      "Characters marked as not owned are excluded. Returns the members, which slots each fills, unmet required slots, and the damage multiplier. " +
      `need keys: ${NEEDABLE.map((n) => `${n.key}=${n.label}`).join(", ")}.`,
    inputSchema: {
      attacker: z.string().describe("Attacker (★): label like 'アルマ(AS)', name, or a search word that matches one character. Hiragana OK"),
      with: z.array(z.string()).optional().describe("Characters that must be in the party. Append ':後衛' to put one in the back row"),
      without: z.array(z.string()).optional().describe("Characters to leave out"),
      need: z.array(z.string()).optional().describe("Slots that must be satisfied (durability / boss counters), e.g. ['heal','barrier','buff_reversal']"),
      element: z.string().optional().describe("Attack element (火 地 水 風 雷 陰 晶 無). Default: the attacker's most common"),
      kind: z.enum(["斬", "突", "打", "魔法"]).optional().describe("Attack type. Default: the attacker's most common"),
      bossElement: z.string().optional().describe("Element of the boss's attacks (for 属性耐性UP)"),
      bossAttack: z.enum(["physical", "magic"]).optional().describe("Whether the boss hits physically or magically (for 耐性UP / 腕力・知性DOWN)"),
      enemy: z.object(Object.fromEntries(ENEMY_FIELDS.map((f) => [f.key, z.number().optional().describe(`${f.label}: ${f.hint}`)])))
        .extend({ affinity: z.enum(["weak", "resist"]).optional() }).optional()
        .describe("Boss stats for the damage estimate (level, def, mdef, typeRes, elemRes, ...). Missing ones use late-game defaults"),
      weapon: z.string().optional().describe("Attacker's weapon by name (search_weapon in the anaden MCP). Default: Elpis of its type. 'none' for no weapon"),
      armor: z.string().optional().describe("Attacker's armor by name (search_armor in the anaden MCP). Default: none"),
      size: z.number().int().min(1).max(4).optional().describe("Front-line size (default 4)"),
      all: z.boolean().optional().describe("Also consider characters marked as not owned"),
      save: z.boolean().optional().describe("Save as a party in ae-synergy (only when the user asks)"),
    },
  },
  async (req) => {
    try {
      const outcome = runBuild(db, req);
      return text(`${outcome.text}\n\n${JSON.stringify(outcome.json)}`);
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "set_owned",
  {
    title: "アナデン 所持キャラの切り替え",
    description: "Mark characters as owned / not owned in ae-synergy. Not-owned characters are excluded from build_party. Everyone is owned by default.",
    inputSchema: {
      characters: z.array(z.string()).describe("Character labels or names"),
      owned: z.boolean(),
    },
  },
  async ({ characters, owned }) => {
    try {
      const ids = characters.map((c) => resolveCharacter(db, c));
      for (const id of ids) setOwned(db, id, owned);
      const labels = [...charactersByIds(db, ids).values()].map((c) => c.label);
      return text(`${labels.join("、")} を${owned ? "持っている" : "持っていない"}にしました`);
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "list_unowned",
  {
    title: "アナデン 持っていないキャラ",
    description: "List characters marked as not owned in ae-synergy.",
    inputSchema: {},
  },
  async () => {
    const labels = [...charactersByIds(db, [...unownedIds(db)]).values()].map((c) => c.label);
    return text(labels.length ? labels.join("、") : "持っていないキャラはいません（全員持っている扱い）");
  },
);

await server.connect(new StdioServerTransport());
