import { test } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, chmodSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isSkillComment, isSkillReview, planPurge, run } from "./purge-comments.mjs";
import { COMMENT_MARKER } from "./comment-marker.mjs";

const CLI_PATH = fileURLToPath(new URL("./purge-comments.mjs", import.meta.url));
const M = COMMENT_MARKER;

const c = (id, body, login = "me") => ({ id, body, user: { login } });
const r = (id, nodeId, body, state = "COMMENTED", login = "me") => ({
  id,
  node_id: nodeId,
  body,
  state,
  user: { login },
});

// isSkillComment

test("印だけを含む意図コメントは対象になる", () => {
  assert.strictEqual(isSkillComment(`意図の説明\n\n${M}`), true);
});

test("印付きの番号コメントは対象になる", () => {
  assert.strictEqual(isSkillComment(`1: 読み始め\n\n${M}`), true);
});

test("印の無い番号コメントは先頭の数字とコロンで対象になる", () => {
  assert.strictEqual(isSkillComment("3: 本文"), true);
  assert.strictEqual(isSkillComment("12: 本文"), true);
});

test("印の無い意図コメントは対象にならない", () => {
  assert.strictEqual(isSkillComment("ここは意図があって分けた"), false);
});

test("印がリンク行より前にあっても、リンク行が印より前にあっても対象になる", () => {
  assert.strictEqual(isSkillComment(`1: a\n\n${M}\n\n[▶](x)`), true);
  assert.strictEqual(isSkillComment(`[▶](x)\n\n${M}`), true);
});

test("数字で始まらない本文は対象にならない", () => {
  assert.strictEqual(isSkillComment("v2: 版の話"), false);
  assert.strictEqual(isSkillComment("3 件目の話"), false);
  assert.strictEqual(isSkillComment("見出し 1: 本文"), false);
});

test("空文字は対象にならない", () => {
  assert.strictEqual(isSkillComment(""), false);
});

// isSkillReview

test("印を含むレビュー本体は対象になる", () => {
  assert.strictEqual(isSkillReview(`レビューの本文\n\n${M}`), true);
});

test("旧文言のレビュー本体は文中にあっても対象になる", () => {
  assert.strictEqual(isSkillReview("1 から 4 の番号順に読んでください。"), true);
  assert.strictEqual(isSkillReview("前置き\n1 から 12 の番号順に読んでください。\n後書き"), true);
});

test("印も旧文言も無い本文は対象にならない", () => {
  assert.strictEqual(isSkillReview("LGTM です"), false);
});

test("先頭が数字コロンだけの本文は旧文言ではないのでレビューでは対象にならない", () => {
  assert.strictEqual(isSkillReview("1: これはレビュー本文"), false);
});

// planPurge

test("実行者の印付き番号コメントと印付き意図コメントが deleteIds に入る", () => {
  const plan = planPurge({
    login: "me",
    comments: [c(1, `1: a\n\n${M}`), c(2, `意図\n\n${M}`)],
    reviews: [],
  });
  assert.deepStrictEqual(plan, { deleteIds: [1, 2], hideNodeIds: [] });
});

test("実行者の印の無い番号コメントは deleteIds に入り、印の無い意図コメントは入らない", () => {
  assert.deepStrictEqual(planPurge({ login: "me", comments: [c(3, "3: 本文")], reviews: [] }), {
    deleteIds: [3],
    hideNodeIds: [],
  });
  assert.deepStrictEqual(planPurge({ login: "me", comments: [c(4, "人が書いた意図")], reviews: [] }), {
    deleteIds: [],
    hideNodeIds: [],
  });
});

test("他人のコメントは印があっても先頭が 1: でも対象にならない", () => {
  const plan = planPurge({
    login: "me",
    comments: [c(5, `x\n\n${M}`, "other"), c(6, "1: 他人の番号", "other")],
    reviews: [],
  });
  assert.deepStrictEqual(plan.deleteIds, []);
});

test("印がリンク行より前にある本文も対象になる", () => {
  const plan = planPurge({ login: "me", comments: [c(7, `1: a\n\n${M}\n\n[▶](x)`)], reviews: [] });
  assert.deepStrictEqual(plan.deleteIds, [7]);
});

test("v2: のように数字で始まらない実行者の本文は対象にならない", () => {
  assert.deepStrictEqual(planPurge({ login: "me", comments: [c(8, "v2: 版の話")], reviews: [] }).deleteIds, []);
});

test("削除対象が複数あるとき入力の順番どおりに並び、数値で返る", () => {
  const plan = planPurge({ login: "me", comments: [c(30, "2: b"), c(10, "1: a")], reviews: [] });
  assert.deepStrictEqual(plan.deleteIds, [30, 10]);
  assert.ok(plan.deleteIds.every((id) => typeof id === "number"));
});

test("body が null や undefined のコメントでも落ちず、対象にもならない", () => {
  const plan = planPurge({
    login: "me",
    comments: [c(12, null), { id: 13, user: { login: "me" } }],
    reviews: [],
  });
  assert.deepStrictEqual(plan.deleteIds, []);
});

test("user が無いコメントでも落ちず、対象にならない", () => {
  const plan = planPurge({ login: "me", comments: [{ id: 14, body: "1: a" }], reviews: [] });
  assert.deepStrictEqual(plan.deleteIds, []);
});

test("実行者の印付きレビューは id ではなく node_id で hideNodeIds に入る", () => {
  const plan = planPurge({ login: "me", comments: [], reviews: [r(100, "PRR_a", `本文\n\n${M}`)] });
  assert.deepStrictEqual(plan.hideNodeIds, ["PRR_a"]);
});

test("旧文言のレビューが hideNodeIds に入る", () => {
  const plan = planPurge({
    login: "me",
    comments: [],
    reviews: [r(101, "PRR_b", "1 から 4 の番号順に読んでください。")],
  });
  assert.deepStrictEqual(plan.hideNodeIds, ["PRR_b"]);
});

test("他人のレビューと PENDING のレビューは印があっても対象にならない", () => {
  const plan = planPurge({
    login: "me",
    comments: [],
    reviews: [r(102, "PRR_c", `x\n\n${M}`, "COMMENTED", "other"), r(103, "PRR_d", `x\n\n${M}`, "PENDING")],
  });
  assert.deepStrictEqual(plan.hideNodeIds, []);
});

test("印も旧文言も無い実行者のレビューは対象にならない", () => {
  const plan = planPurge({ login: "me", comments: [], reviews: [r(104, "PRR_e", "手で書いたレビュー", "APPROVED")] });
  assert.deepStrictEqual(plan.hideNodeIds, []);
});

test("レビューの state が APPROVED や CHANGES_REQUESTED でも印があれば対象になる", () => {
  const plan = planPurge({
    login: "me",
    comments: [],
    reviews: [r(105, "PRR_f", M, "APPROVED"), r(106, "PRR_g", M, "CHANGES_REQUESTED")],
  });
  assert.deepStrictEqual(plan.hideNodeIds, ["PRR_f", "PRR_g"]);
});

test("レビューの body が null でも落ちず対象にならない", () => {
  const plan = planPurge({ login: "me", comments: [], reviews: [r(107, "PRR_h", null)] });
  assert.deepStrictEqual(plan.hideNodeIds, []);
});

test("コメントもレビューも空配列なら両方空", () => {
  assert.deepStrictEqual(planPurge({ login: "me", comments: [], reviews: [] }), { deleteIds: [], hideNodeIds: [] });
});

test("コメントとレビューを同時に渡すとそれぞれの配列に振り分けられる", () => {
  const plan = planPurge({ login: "me", comments: [c(1, "1: a")], reviews: [r(100, "PRR_a", M)] });
  assert.deepStrictEqual(plan, { deleteIds: [1], hideNodeIds: ["PRR_a"] });
});

// run

// gh の偽物。呼ばれた引数を記録し、パスに応じて応答を返す。一覧は --paginate --slurp 前提でページの配列を返す。
function fakeGh({
  login = "me",
  comments = [[]],
  reviews = [[]],
  failDelete = [],
  failHide = [],
  failComments = false,
  failReviews = false,
  failUser = false,
} = {}) {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    if (args.includes("DELETE")) {
      const path = args.find((a) => a.startsWith("repos/"));
      const id = Number(path.split("/").pop());
      if (failDelete.includes(id)) throw Object.assign(new Error("delete failed"), { stderr: "HTTP 404" });
      return "{}";
    }
    if (args.includes("graphql")) {
      const joined = args.join(" ");
      if (failHide.some((n) => joined.includes(n))) {
        throw Object.assign(new Error("hide failed"), { stderr: "HTTP 403" });
      }
      return "{}";
    }
    const path = args.find((a) => a.startsWith("repos/") || a === "user");
    if (path === "user") {
      if (failUser) throw Object.assign(new Error("auth failed"), { stderr: "HTTP 401" });
      return `${login}\n`;
    }
    if (/\/pulls\/\d+\/comments$/.test(path)) {
      if (failComments) throw Object.assign(new Error("list failed"), { stderr: "HTTP 500" });
      return JSON.stringify(comments);
    }
    if (/\/pulls\/\d+\/reviews$/.test(path)) {
      if (failReviews) throw Object.assign(new Error("list failed"), { stderr: "HTTP 500" });
      return JSON.stringify(reviews);
    }
    throw new Error(`unexpected gh call: ${args.join(" ")}`);
  };
  return { gh, calls };
}

const deleteCalls = (calls) => calls.filter((a) => a.includes("DELETE"));
const hideCalls = (calls) => calls.filter((a) => a.includes("graphql"));
const deletedIds = (calls) => deleteCalls(calls).map((a) => Number(a.find((x) => x.startsWith("repos/")).split("/").pop()));

test("削除は api -X DELETE repos/{owner}/{repo}/pulls/comments/<id> で呼ぶ", () => {
  const { gh, calls } = fakeGh({ comments: [[c(10, "1: a"), c(20, `意図\n\n${M}`)]] });
  const res = run({ pr: "315", gh });
  assert.deepStrictEqual(deleteCalls(calls), [
    ["api", "-X", "DELETE", "repos/{owner}/{repo}/pulls/comments/10"],
    ["api", "-X", "DELETE", "repos/{owner}/{repo}/pulls/comments/20"],
  ]);
  assert.strictEqual(res.deleted, 2);
  assert.strictEqual(res.failed, 0);
  assert.strictEqual(res.ok, true);
});

test("非表示は api graphql で minimizeComment と OUTDATED と node_id を渡す", () => {
  const { gh, calls } = fakeGh({ reviews: [[r(100, "PRR_a", M)]] });
  const res = run({ pr: "315", gh });
  const hides = hideCalls(calls);
  assert.strictEqual(hides.length, 1);
  assert.strictEqual(hides[0][0], "api");
  const joined = hides[0].join(" ");
  for (const word of ["minimizeComment", "OUTDATED", "PRR_a"]) assert.ok(joined.includes(word), word);
  // node_id をクエリ文字列に埋め込まず、変数 id として -f で渡していること
  const args = hides[0];
  const idIdx = args.indexOf("id=PRR_a");
  assert.ok(idIdx > 0 && args[idIdx - 1] === "-f", "-f id=PRR_a");
  assert.ok(!args.find((a) => a.startsWith("query=")).includes("PRR_a"), "query に node_id を埋め込まない");
  assert.strictEqual(res.hidden, 1);
  assert.strictEqual(res.ok, true);
});

test("削除対象も非表示対象も無いときは DELETE も graphql も呼ばない", () => {
  const { gh, calls } = fakeGh({ comments: [[c(1, "人の意図")]] });
  const res = run({ pr: "315", gh });
  assert.strictEqual(deleteCalls(calls).length, 0);
  assert.strictEqual(hideCalls(calls).length, 0);
  assert.deepStrictEqual(
    { ok: res.ok, deleted: res.deleted, hidden: res.hidden, failed: res.failed, failures: res.failures },
    { ok: true, deleted: 0, hidden: 0, failed: 0, failures: [] },
  );
});

test("一覧は --paginate --slurp で取る", () => {
  const { gh, calls } = fakeGh();
  run({ pr: "315", gh });
  for (const path of ["repos/{owner}/{repo}/pulls/315/comments", "repos/{owner}/{repo}/pulls/315/reviews"]) {
    const call = calls.find((a) => a.includes(path));
    assert.ok(call, path);
    assert.ok(call.includes("--paginate") && call.includes("--slurp"), path);
  }
});

test("ページの配列を平らにして扱う", () => {
  const { gh, calls } = fakeGh({
    comments: [[c(1, "1: a")], [c(2, "2: b")]],
    reviews: [[r(100, "PRR_a", M)], [r(101, "PRR_b", "1 から 4 の番号順に読んでください。")]],
  });
  const res = run({ pr: "315", gh });
  assert.deepStrictEqual(deletedIds(calls), [1, 2]);
  const joined = hideCalls(calls).map((a) => a.join(" "));
  assert.strictEqual(joined.length, 2);
  assert.ok(joined[0].includes("PRR_a") && joined[1].includes("PRR_b"));
  assert.strictEqual(res.deleted, 2);
  assert.strictEqual(res.hidden, 2);
});

test("空ページが混ざっていても落ちない", () => {
  const { gh } = fakeGh({ comments: [[], [c(1, "1: a")]], reviews: [[], []] });
  const res = run({ pr: "315", gh });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.deleted, 1);
});

test("ログイン名は gh api user --jq .login で取り、他人のコメントは消さない", () => {
  const { gh, calls } = fakeGh({ comments: [[c(1, "1: 他人", "other"), c(2, "2: 自分")]] });
  const res = run({ pr: "315", gh });
  const userCall = calls.find((a) => a.includes("user"));
  assert.ok(userCall);
  assert.ok(userCall.includes("--jq") && userCall.includes(".login"));
  assert.deepStrictEqual(deletedIds(calls), [2]);
  assert.strictEqual(res.deleted, 1);
});

test("削除の一部が失敗しても残りを続け、数値の id と理由を failures に残す", () => {
  const { gh, calls } = fakeGh({
    comments: [[c(1, "1: a"), c(2, "2: b"), c(3, "3: c")]],
    failDelete: [2],
  });
  const res = run({ pr: "315", gh });
  assert.deepStrictEqual(deletedIds(calls), [1, 2, 3]);
  assert.deepStrictEqual({ ok: res.ok, deleted: res.deleted, failed: res.failed }, { ok: true, deleted: 2, failed: 1 });
  assert.strictEqual(res.failures.length, 1);
  assert.strictEqual(res.failures[0].kind, "delete");
  assert.strictEqual(res.failures[0].id, 2);
  assert.match(res.failures[0].reason, /HTTP 404|delete failed/);
});

test("非表示の一部が失敗しても残りを続け、node_id の文字列と理由を failures に残す", () => {
  const { gh, calls } = fakeGh({
    reviews: [[r(100, "PRR_a", M), r(101, "PRR_b", M), r(102, "PRR_c", M)]],
    failHide: ["PRR_b"],
  });
  const res = run({ pr: "315", gh });
  const joined = hideCalls(calls).map((a) => a.join(" "));
  assert.strictEqual(joined.length, 3);
  for (const n of ["PRR_a", "PRR_b", "PRR_c"]) assert.ok(joined.some((j) => j.includes(n)), n);
  assert.deepStrictEqual({ ok: res.ok, hidden: res.hidden, failed: res.failed }, { ok: true, hidden: 2, failed: 1 });
  assert.strictEqual(res.failures.length, 1);
  assert.strictEqual(res.failures[0].kind, "hide");
  assert.strictEqual(res.failures[0].id, "PRR_b");
  assert.match(res.failures[0].reason, /HTTP 403|hide failed/);
});

test("削除と非表示が両方失敗したら failed は合計で、failures に両方の種類が出る", () => {
  const { gh } = fakeGh({
    comments: [[c(1, "1: a")]],
    reviews: [[r(100, "PRR_a", M)]],
    failDelete: [1],
    failHide: ["PRR_a"],
  });
  const res = run({ pr: "315", gh });
  assert.deepStrictEqual(
    { ok: res.ok, deleted: res.deleted, hidden: res.hidden, failed: res.failed },
    { ok: true, deleted: 0, hidden: 0, failed: 2 },
  );
  assert.strictEqual(res.failures.length, 2);
  assert.ok(res.failures.some((f) => f.kind === "delete" && f.id === 1));
  assert.ok(res.failures.some((f) => f.kind === "hide" && f.id === "PRR_a"));
});

test("失敗が無いとき failures は空配列で failed は 0", () => {
  const { gh } = fakeGh({ comments: [[c(1, "1: a")]], reviews: [[r(100, "PRR_a", M)]] });
  const res = run({ pr: "315", gh });
  assert.strictEqual(res.failed, 0);
  assert.deepStrictEqual(res.failures, []);
});

test("コメント一覧の取得が失敗したら throw せず ok: false と理由を返し、削除も非表示もしない", () => {
  const { gh, calls } = fakeGh({ failComments: true, reviews: [[r(100, "PRR_a", M)]] });
  const res = run({ pr: "315", gh });
  assert.strictEqual(res.ok, false);
  assert.match(res.reason, /HTTP 500|list failed/);
  assert.strictEqual(deleteCalls(calls).length, 0);
  assert.strictEqual(hideCalls(calls).length, 0);
  assert.strictEqual(res.deleted, 0);
  assert.strictEqual(res.hidden, 0);
});

test("レビュー一覧の取得が失敗したら throw せず ok: false と理由を返し、削除も非表示もしない", () => {
  const { gh, calls } = fakeGh({ failReviews: true, comments: [[c(1, "1: a")]] });
  const res = run({ pr: "315", gh });
  assert.strictEqual(res.ok, false);
  assert.ok(typeof res.reason === "string" && res.reason !== "");
  assert.strictEqual(deleteCalls(calls).length, 0);
  assert.strictEqual(hideCalls(calls).length, 0);
});

test("ログイン名の取得が失敗したら throw せず ok: false を返し、削除も非表示もしない", () => {
  const { gh, calls } = fakeGh({ failUser: true, comments: [[c(1, "1: a")]], reviews: [[r(100, "PRR_a", M)]] });
  const res = run({ pr: "315", gh });
  assert.strictEqual(res.ok, false);
  assert.ok(typeof res.reason === "string" && res.reason !== "");
  assert.strictEqual(deleteCalls(calls).length, 0);
  assert.strictEqual(hideCalls(calls).length, 0);
});

test("PR 番号が数字でなければ gh を呼ばずに ok: false", () => {
  for (const pr of ["abc", "", "12; rm", undefined]) {
    const { gh, calls } = fakeGh();
    const res = run({ pr, gh });
    assert.strictEqual(res.ok, false, String(pr));
    assert.ok(typeof res.reason === "string" && res.reason !== "", String(pr));
    assert.strictEqual(calls.length, 0, String(pr));
  }
});

test("PR 番号が不正なときも結果の形は同じで、件数は 0", () => {
  const { gh } = fakeGh();
  const res = run({ pr: "abc", gh });
  assert.deepStrictEqual(
    { deleted: res.deleted, hidden: res.hidden, failed: res.failed, failures: res.failures },
    { deleted: 0, hidden: 0, failed: 0, failures: [] },
  );
});

test("body が null のコメントとレビューが一覧にあっても落ちない", () => {
  const { gh, calls } = fakeGh({
    comments: [[c(1, null), c(2, "2: b")]],
    reviews: [[r(100, "PRR_a", null)]],
  });
  const res = run({ pr: "315", gh });
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(deletedIds(calls), [2]);
  assert.strictEqual(res.deleted, 1);
  assert.strictEqual(res.hidden, 0);
});

test("コメントもレビューも無い PR でも成功する", () => {
  const { gh } = fakeGh();
  const res = run({ pr: "315", gh });
  assert.deepStrictEqual(
    { ok: res.ok, deleted: res.deleted, hidden: res.hidden, failed: res.failed, failures: res.failures },
    { ok: true, deleted: 0, hidden: 0, failed: 0, failures: [] },
  );
});

test("PENDING のレビューは非表示にしない", () => {
  const { gh, calls } = fakeGh({ reviews: [[r(100, "PRR_p", M, "PENDING")]] });
  const res = run({ pr: "315", gh });
  assert.strictEqual(hideCalls(calls).length, 0);
  assert.strictEqual(res.hidden, 0);
});

test("deleted と hidden は成功した件数である", () => {
  const { gh } = fakeGh({
    comments: [[c(1, "1: a"), c(2, "2: b")]],
    reviews: [[r(100, "PRR_a", M), r(101, "PRR_b", M)]],
  });
  const res = run({ pr: "315", gh });
  assert.deepStrictEqual({ deleted: res.deleted, hidden: res.hidden, failed: res.failed }, { deleted: 2, hidden: 2, failed: 0 });
});

// CLI

const mkdir = () => mkdtempSync(join(tmpdir(), "purge-comments-"));

// gh の偽物の実行ファイル。呼ばれた引数を log に追記し、パスに応じて固定の JSON を返す。
function installFakeGh(dir, { comments = [[]], reviews = [[]], raw = null } = {}) {
  const log = join(dir, "gh-calls.log");
  const listOut = (v) => (raw ?? JSON.stringify(v));
  const script = `#!/bin/sh
echo "$*" >> '${log}'
case "$*" in
  *DELETE*) echo '{}' ;;
  *graphql*) echo '{}' ;;
  *"api user"*) echo me ;;
  *pulls/*/comments*) echo '${listOut(comments)}' ;;
  *pulls/*/reviews*) echo '${listOut(reviews)}' ;;
  *) echo '{}' ;;
esac
`;
  const bin = join(dir, "gh");
  writeFileSync(bin, script);
  chmodSync(bin, 0o755);
  return log;
}

const exitStatus = (args) => {
  try {
    execFileSync(process.execPath, [CLI_PATH, ...args], { stdio: "pipe", env: { PATH: "" } });
    return 0;
  } catch (e) {
    return e.status;
  }
};

test("CLI は --pr と --out を渡すと出力ファイルと標準出力に同じ JSON を書き、終了コード 0", () => {
  const dir = mkdir();
  installFakeGh(dir);
  const out = join(dir, "purge-comments.json");
  const stdout = execFileSync(process.execPath, [CLI_PATH, "--pr", "315", "--out", out], {
    env: { PATH: dir },
    encoding: "utf8",
  });
  const res = JSON.parse(readFileSync(out, "utf8"));
  for (const key of ["ok", "deleted", "hidden", "failed", "failures"]) assert.ok(key in res, key);
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(JSON.parse(stdout), res);
});

test("gh が無い環境でも CLI は終了コード 0 で ok: false を書く", () => {
  const dir = mkdir();
  // node だけを置いた専用ディレクトリを PATH にする。node の置き場所を PATH に入れると本物の gh が見える環境がある
  const nodeOnlyDir = join(dir, "node-only");
  mkdirSync(nodeOnlyDir);
  symlinkSync(process.execPath, join(nodeOnlyDir, "node"));
  assert.ok(!existsSync(join(nodeOnlyDir, "gh")));
  const out = join(dir, "purge-comments.json");
  execFileSync(process.execPath, [CLI_PATH, "--pr", "315", "--out", out], {
    env: { PATH: nodeOnlyDir },
    encoding: "utf8",
  });
  const res = JSON.parse(readFileSync(out, "utf8"));
  assert.strictEqual(res.ok, false);
  assert.ok(typeof res.reason === "string" && res.reason !== "");
});

test("--pr が数字でないときも CLI は終了コード 0 で ok: false を書く", () => {
  const dir = mkdir();
  installFakeGh(dir);
  const out = join(dir, "purge-comments.json");
  execFileSync(process.execPath, [CLI_PATH, "--pr", "abc", "--out", out], { env: { PATH: dir }, encoding: "utf8" });
  assert.strictEqual(JSON.parse(readFileSync(out, "utf8")).ok, false);
});

test("--pr が無いときは CLI は終了コード 1", () => {
  const dir = mkdir();
  assert.strictEqual(exitStatus(["--out", join(dir, "purge-comments.json")]), 1);
});

test("--out が無いときは CLI は終了コード 1", () => {
  assert.strictEqual(exitStatus(["--pr", "315"]), 1);
});

test("引数が何も無いときは CLI は終了コード 1", () => {
  assert.strictEqual(exitStatus([]), 1);
});

test("対象があるとき CLI は実際に DELETE と graphql を呼び、件数を書く", () => {
  const dir = mkdir();
  const log = installFakeGh(dir, {
    comments: [[c(10, "1: a")]],
    reviews: [[r(100, "PRR_a", M)]],
  });
  const out = join(dir, "purge-comments.json");
  const stdout = execFileSync(process.execPath, [CLI_PATH, "--pr", "315", "--out", out], {
    env: { PATH: dir },
    encoding: "utf8",
  });
  const res = JSON.parse(readFileSync(out, "utf8"));
  assert.deepStrictEqual({ ok: res.ok, deleted: res.deleted, hidden: res.hidden }, { ok: true, deleted: 1, hidden: 1 });
  assert.deepStrictEqual(JSON.parse(stdout), res);
  assert.ok(existsSync(log));
  const lines = readFileSync(log, "utf8").split("\n");
  assert.ok(lines.some((l) => l.includes("DELETE") && l.includes("pulls/comments/10")));
  assert.ok(lines.some((l) => l.includes("graphql") && l.includes("PRR_a")));
});

test("一覧が JSON として壊れていても CLI は終了コード 0 で ok: false の JSON を書く", () => {
  const dir = mkdir();
  installFakeGh(dir, { raw: "not json" });
  const out = join(dir, "purge-comments.json");
  const stdout = execFileSync(process.execPath, [CLI_PATH, "--pr", "315", "--out", out], {
    env: { PATH: dir },
    encoding: "utf8",
  });
  const res = JSON.parse(readFileSync(out, "utf8"));
  assert.strictEqual(res.ok, false);
  assert.ok(typeof res.reason === "string" && res.reason !== "");
  assert.strictEqual(JSON.parse(stdout).ok, false);
});
