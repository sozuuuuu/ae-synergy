import { expect, test } from "bun:test";
import { raw } from "@/jsx/jsx-runtime.ts";

test("escapes text and attributes", () => {
  const evil = `<script>"x"</script>`;
  const html = (<p title={evil} hidden={false} data-ok>{evil}{raw("<b>ok</b>")}<br /></p>).toString();
  expect(html).toBe(`<p title="&lt;script&gt;&quot;x&quot;&lt;/script&gt;" data-ok>&lt;script&gt;&quot;x&quot;&lt;/script&gt;<b>ok</b><br></p>`);
});

test("components and fragments", () => {
  const Item = (p: { name: string }) => <li>{p.name}</li>;
  const html = (<ul><>{["a", "b"].map((n) => <Item name={n} />)}</></ul>).toString();
  expect(html).toBe("<ul><li>a</li><li>b</li></ul>");
});
