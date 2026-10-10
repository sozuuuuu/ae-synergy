/** 検索用の正規化。全角半角・大文字小文字・ひらがなカタカナの違いを吸収する。 */
export function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

/** 空白区切りのキーワード列 */
export function keywords(query: unknown): string[] {
  return normalize(query).split(/\s+/).filter(Boolean);
}

/** LIKE 用のエスケープ（ESCAPE '\' と組み合わせる） */
export const likePattern = (word: string) => `%${word.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
