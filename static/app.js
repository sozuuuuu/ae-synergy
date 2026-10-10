// 小さな補助だけ。JS がなくてもすべての操作はフォームで動く。

// フォーム送信後に同じページへ戻ったとき、スクロール位置を戻す
const SCROLL_KEY = "scroll:" + location.pathname;
document.addEventListener("submit", (event) => {
  const form = event.target;
  if (form.dataset.confirm && !confirm(form.dataset.confirm)) {
    event.preventDefault();
    return;
  }
  if (form.method.toLowerCase() === "post") sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
});
window.addEventListener("DOMContentLoaded", () => {
  const y = sessionStorage.getItem(SCROLL_KEY);
  sessionStorage.removeItem(SCROLL_KEY);
  if (y !== null && !location.hash) window.scrollTo(0, Number(y));
});

// 絞り込みのセレクト・チェックボックスは選んだらすぐ検索する
document.addEventListener("change", (event) => {
  if (event.target.matches("select[data-autosubmit], input[type=checkbox][data-autosubmit]")) event.target.form.requestSubmit();
});

// 選択済みのラジオ（天冥ボタン）をもう一度押したら選択を外す
let wasChecked = false;
document.addEventListener("pointerdown", (event) => {
  const input = event.target.closest("label")?.querySelector("input[type=radio][data-toggle]");
  wasChecked = !!input?.checked;
});
document.addEventListener("click", (event) => {
  const input = event.target.closest("label")?.querySelector("input[type=radio][data-toggle]");
  if (input && wasChecked) {
    input.checked = false;
    wasChecked = false;
    input.form.requestSubmit();
  }
});
document.addEventListener("change", (event) => {
  if (event.target.matches("input[type=radio][data-autosubmit]")) event.target.form.requestSubmit();
});
