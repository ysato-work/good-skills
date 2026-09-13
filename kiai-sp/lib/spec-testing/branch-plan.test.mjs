import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ALLOWED_BRANCH_PREFIX } from "./forbidden-bash.mjs";
import {
  DELIVERY_STEPS,
  artifactBranchName,
  collectGit,
  planDelivery,
  stamp,
} from "./branch-plan.mjs";

const NOW = new Date("2026-09-01T12:34:56Z");

test("stamp は日時を短く並べる", () => {
  assert.equal(stamp(NOW), "20260901-1234");
});

test("成果物ブランチは S2 のガードが通す接頭辞で始まる", () => {
  const name = artifactBranchName("2026-08-31-x", { now: NOW });
  assert.ok(name.startsWith(ALLOWED_BRANCH_PREFIX), name);
});

test("成果物ブランチ名は spec 名と時刻を含み、同じ spec でも衝突しない", () => {
  const a = artifactBranchName("2026-08-31-x", { now: new Date("2026-09-01T12:34:00Z") });
  const b = artifactBranchName("2026-08-31-x", { now: new Date("2026-09-01T12:35:00Z") });
  assert.ok(a.includes("2026-08-31-x"));
  assert.notEqual(a, b);
});

test("成果物ブランチ名から日本語や記号が落ちる", () => {
  const name = artifactBranchName("2026-08-31-台帳の契約", { now: NOW });
  assert.match(name, /^[\w./-]+$/);
});

test("planDelivery は base を検証開始時点のブランチにする", () => {
  const plan = planDelivery({ baseBranch: "feature/x", remote: "origin", specSlug: "s", now: NOW });
  assert.equal(plan.baseBranch, "feature/x");
  assert.equal(plan.prBase, "feature/x");
});

test("planDelivery は base を main に読み替えない", () => {
  const plan = planDelivery({ baseBranch: "feature/x", remote: "origin", specSlug: "s", now: NOW });
  assert.notEqual(plan.prBase, "main");
});

test("planDelivery は渡された remote をそのまま使う", () => {
  const plan = planDelivery({ baseBranch: "b", remote: "upstream", specSlug: "s", now: NOW });
  assert.equal(plan.remote, "upstream");
});

test("planDelivery は base が無ければ throw する", () => {
  assert.throws(() => planDelivery({ baseBranch: "", remote: "origin", specSlug: "s" }), /ブランチ/);
});

test("planDelivery は remote が無ければ throw する", () => {
  assert.throws(() => planDelivery({ baseBranch: "b", remote: "", specSlug: "s" }), /remote/);
});

test("納品の手順は 6 つで固定されている", () => {
  assert.equal(DELIVERY_STEPS.length, 6);
  assert.deepEqual(planDelivery({ baseBranch: "b", remote: "origin", specSlug: "s", now: NOW }).steps, DELIVERY_STEPS);
});

test("納品の手順に人間への問いかけも分岐も無い", () => {
  const text = DELIVERY_STEPS.join("\n");
  for (const word of ["確認する", "選ぶ", "尋ねる", "どちらか", "場合は"]) {
    assert.equal(text.includes(word), false, `手順に「${word}」が入っている`);
  }
});

test("collectGit は現在のブランチと追跡先を読む", () => {
  const calls = [];
  const fakeSpawn = (file, args) => {
    calls.push(args.join(" "));
    if (args.includes("--abbrev-ref") && args.includes("HEAD")) {
      return { status: 0, stdout: "feature/x\n" };
    }
    if (args.join(" ").includes("branch.feature/x.remote")) return { status: 0, stdout: "upstream\n" };
    return { status: 1, stdout: "" };
  };
  assert.deepEqual(collectGit({ cwd: "/repo", spawn: fakeSpawn }), {
    branch: "feature/x",
    remote: "upstream",
  });
});

test("collectGit は追跡先が無ければ remote が 1 つのときだけそれを使う", () => {
  const fakeSpawn = (file, args) => {
    if (args.includes("--abbrev-ref")) return { status: 0, stdout: "feature/x\n" };
    if (args.join(" ").includes(".remote")) return { status: 1, stdout: "" };
    if (args[0] === "remote") return { status: 0, stdout: "origin\n" };
    return { status: 1, stdout: "" };
  };
  assert.equal(collectGit({ cwd: "/repo", spawn: fakeSpawn }).remote, "origin");
});

test("collectGit は remote が複数あって追跡先が無ければ remote を空で返す", () => {
  const fakeSpawn = (file, args) => {
    if (args.includes("--abbrev-ref")) return { status: 0, stdout: "feature/x\n" };
    if (args.join(" ").includes(".remote")) return { status: 1, stdout: "" };
    if (args[0] === "remote") return { status: 0, stdout: "origin\nupstream\n" };
    return { status: 1, stdout: "" };
  };
  assert.equal(collectGit({ cwd: "/repo", spawn: fakeSpawn }).remote, "");
});

test("ソースにリポジトリ名もドメインも書かれていない", () => {
  const body = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "branch-plan.mjs"), "utf8");
  assert.equal(/https?:\/\//.test(body), false, "URL が埋め込まれている");
  assert.equal(/github\.com/.test(body), false, "ホスト名が埋め込まれている");
});
