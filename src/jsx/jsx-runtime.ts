// サーバー側で HTML 文字列を組み立てる最小の JSX ランタイム。
// 文字列は必ずエスケープされ、エスケープ済みの HTML は SafeHtml としてだけ扱う。

export class SafeHtml {
  constructor(readonly value: string) {}
  toString() {
    return this.value;
  }
}

/** エスケープせずに埋め込む。信頼できる固定文字列だけに使うこと。 */
export const raw = (html: string) => new SafeHtml(html);

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (ch) => ESCAPES[ch]!);

const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

export type Child = SafeHtml | string | number | boolean | null | undefined | Child[];
type Props = Record<string, unknown> & { children?: Child };
type Component = (props: any) => SafeHtml;

function renderChildren(child: Child): string {
  if (child == null || child === false || child === true) return "";
  if (Array.isArray(child)) return child.map(renderChildren).join("");
  if (child instanceof SafeHtml) return child.value;
  return escapeHtml(String(child));
}

function renderAttributes(props: Props): string {
  let out = "";
  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || value == null || value === false) continue;
    const name = key === "className" ? "class" : key;
    if (!/^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/.test(name)) throw new Error(`invalid attribute name: ${name}`);
    out += value === true ? ` ${name}` : ` ${name}="${escapeHtml(String(value))}"`;
  }
  return out;
}

export function jsx(type: string | Component, props: Props | null): SafeHtml {
  props ??= {};
  if (typeof type === "function") return type(props);
  const open = `<${type}${renderAttributes(props)}>`;
  if (VOID_ELEMENTS.has(type)) return new SafeHtml(open);
  return new SafeHtml(`${open}${renderChildren(props.children)}</${type}>`);
}

export const jsxs = jsx;
export const jsxDEV = jsx;
export const Fragment = (props: { children?: Child }) => new SafeHtml(renderChildren(props.children));

export namespace JSX {
  export type Element = SafeHtml;
  export interface ElementChildrenAttribute {
    children: {};
  }
  export interface IntrinsicElements {
    [name: string]: Record<string, unknown>;
  }
}
