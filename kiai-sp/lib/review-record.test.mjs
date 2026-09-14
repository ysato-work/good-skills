import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PLAN_CHECKS,
  SPEC_CHECKS,
  expectedChecks,
  isPlan,
  isReviewTarget,
  recordPath,
  requiresReviewer,
  sha256,
  validateRecord,
  verifyAll,
  writeRecord,
} from "./review-record.mjs";

function withRepo(fn) {
  const root = mkdtempSync(join(tmpdir(), "review-record-test-"));
  mkdirSync(join(root, "docs/superpowers/specs"), { recursive: true });
  mkdirSync(join(root, "docs/superpowers/plans"), { recursive: true });
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function withGitRepo(fn) {
  withRepo((root) => {
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
    // specs / plans ディレクトリに既存コミットを持たせておく。
    // 実運用でもこのディレクトリは既に他の spec / plan を追跡済みであり
    // （本リポジトリ自体が 11 件の既存 spec/plan を持つ）、フィクスチャも
    // それに合わせる。ディレクトリ自体が丸ごと未追跡だと `git status`
    // は個々のファイルではなくディレクトリ名だけを返し、テストの意図が
    // ぼやける。またコミットが 0 件だと `git log` が fatal で落ちる。
    writeFileSync(join(root, "docs/superpowers/specs/.gitkeep"), "");
    writeFileSync(join(root, "docs/superpowers/plans/.gitkeep"), "");
    gitCommitAll(root, "init", "2000-01-01T00:00:00Z");
    fn(root);
  });
}

function gitCommitAll(root, message, isoDate) {
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["commit", "-q", "-m", message], {
    cwd: root,
    env: { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate },
  });
}

test("sha256 は既知の値を返す", () => {
  assert.equal(sha256("hello"), "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
});

test("recordPath は追跡外の .superpowers/review-records/ 配下を指す", () => {
  assert.equal(
    recordPath("/r/docs/superpowers/specs/2026-08-01-foo-design.md"),
    "/r/.superpowers/review-records/specs/2026-08-01-foo-design.review.json",
  );
  assert.equal(
    recordPath("/r/docs/superpowers/plans/2026-08-01-foo.md"),
    "/r/.superpowers/review-records/plans/2026-08-01-foo.review.json",
  );
});

test("recordPath は specs と plans で同名でも衝突しない", () => {
  assert.notEqual(
    recordPath("/r/docs/superpowers/specs/a.md"),
    recordPath("/r/docs/superpowers/plans/a.md"),
  );
});

test("recordPath は docs/superpowers 配下でないパスを拒否する", () => {
  assert.throws(() => recordPath("/a/b/foo.md"), /docs\/superpowers/);
});

test("recordPath は .. を含むパスを拒否する（記録が ignore 配下の外に出るのを防ぐ）", () => {
  assert.throws(() => recordPath("/r/docs/superpowers/specs/../../../etc/x.md"), /\.\./);
  assert.throws(() => recordPath("/r/docs/superpowers/../x.md"), /\.\./);
});

test("recordPath は .. を名前の一部に含むだけのファイルは拒否しない", () => {
  assert.equal(
    recordPath("/r/docs/superpowers/specs/a..b-design.md"),
    "/r/.superpowers/review-records/specs/a..b-design.review.json",
  );
});

test("isPlan は plans 配下だけ true", () => {
  assert.equal(isPlan("/r/docs/superpowers/plans/x.md"), true);
  assert.equal(isPlan("/r/docs/superpowers/specs/x.md"), false);
});

test("expectedChecks は置き場所で決まる", () => {
  assert.deepEqual(expectedChecks("/r/docs/superpowers/specs/x.md"), SPEC_CHECKS);
  assert.deepEqual(expectedChecks("/r/docs/superpowers/plans/x.md"), PLAN_CHECKS);
});

test("requiresReviewer は spec と plan の両方で true", () => {
  assert.equal(requiresReviewer("/r/docs/superpowers/plans/x.md"), true);
  assert.equal(requiresReviewer("/r/docs/superpowers/specs/x.md"), true);
  assert.equal(requiresReviewer("/r/docs/other/x.md"), false);
  assert.equal(requiresReviewer("/r/docs/superpowers/specs/sub/x.md"), false);
});

test("writeRecord は対象のハッシュを計算して書き出す", () => {
  withRepo((root) => {
    const target = join(root, "docs/superpowers/specs/x-design.md");
    writeFileSync(target, "hello");
    const rec = writeRecord(target, {
      skill: "brainstorming",
      checks: SPEC_CHECKS.map((item) => ({ item, finding: "問題なし" })),
      now: "2026-08-01T00:00:00.000Z",
    });
    assert.equal(rec.target, "x-design.md");
    assert.equal(rec.targetSha256, sha256("hello"));
    assert.equal(rec.reviewedAt, "2026-08-01T00:00:00.000Z");
    const onDisk = JSON.parse(readFileSync(recordPath(target), "utf8"));
    assert.deepEqual(onDisk, rec);
  });
});

test("writeRecord は記録ディレクトリに自己 ignore の .gitignore を置く", () => {
  withRepo((root) => {
    const target = join(root, "docs/superpowers/specs/x-design.md");
    writeFileSync(target, "hello");
    writeRecord(target, { skill: "brainstorming", checks: fullSpecChecks() });
    assert.equal(readFileSync(join(root, ".superpowers/review-records/.gitignore"), "utf8"), "*\n");
  });
});

test("writeRecord は docs/ 配下に何も書かない", () => {
  withRepo((root) => {
    const target = join(root, "docs/superpowers/specs/x-design.md");
    writeFileSync(target, "hello");
    writeRecord(target, { skill: "brainstorming", checks: fullSpecChecks() });
    assert.deepEqual(readdirSync(join(root, "docs/superpowers/specs")), ["x-design.md"]);
  });
});

test("writeRecord 後も git 作業ツリーは記録で汚れない", () => {
  withGitRepo((root) => {
    const target = specPath(root, "a-design.md");
    writeFileSync(target, "body");
    gitCommitAll(root, "add spec", "2026-08-01T12:00:00Z");
    writeRecord(target, { skill: "brainstorming", checks: fullSpecChecks() });
    const status = execFileSync("git", ["status", "--porcelain", "-uall"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(status.trim(), "");
  });
});

test("reviewer を渡さなければ記録に含めない", () => {
  withRepo((root) => {
    const target = join(root, "docs/superpowers/specs/x-design.md");
    writeFileSync(target, "hello");
    const rec = writeRecord(target, {
      skill: "brainstorming",
      checks: SPEC_CHECKS.map((item) => ({ item, finding: "問題なし" })),
    });
    assert.equal("reviewer" in rec, false);
  });
});

test("reviewer を渡せば記録に含める", () => {
  withRepo((root) => {
    const target = join(root, "docs/superpowers/plans/x.md");
    writeFileSync(target, "plan body");
    const rec = writeRecord(target, {
      skill: "writing-plans",
      checks: PLAN_CHECKS.map((item) => ({ item, finding: "問題なし" })),
      reviewer: { status: "approved", issues: [] },
    });
    assert.deepEqual(rec.reviewer, { status: "approved", issues: [] });
  });
});

function specPath(root, name) {
  return join(root, "docs/superpowers/specs", name);
}
function planPath(root, name) {
  return join(root, "docs/superpowers/plans", name);
}
function fullSpecChecks() {
  return SPEC_CHECKS.map((item) => ({ item, finding: "問題なし" }));
}
function fullPlanChecks() {
  return PLAN_CHECKS.map((item) => ({ item, finding: "問題なし" }));
}

test("記録が無ければ ok:false", () => {
  withRepo((root) => {
    const target = specPath(root, "a-design.md");
    writeFileSync(target, "body");
    const r = validateRecord(target);
    assert.equal(r.ok, false);
    assert.match(r.reason, /記録が無い/);
  });
});

test("記録がありハッシュが一致すれば ok:true", () => {
  withRepo((root) => {
    const target = specPath(root, "a-design.md");
    writeFileSync(target, "body");
    writeRecord(target, {
      skill: "brainstorming",
      checks: fullSpecChecks(),
      reviewer: { status: "approved", issues: [] },
    });
    assert.deepEqual(validateRecord(target), { ok: true, reason: null });
  });
});

test("レビュー後に対象を編集すると ok:false", () => {
  withRepo((root) => {
    const target = specPath(root, "a-design.md");
    writeFileSync(target, "body");
    writeRecord(target, { skill: "brainstorming", checks: fullSpecChecks() });
    writeFileSync(target, "body edited");
    const r = validateRecord(target);
    assert.equal(r.ok, false);
    assert.match(r.reason, /編集されている/);
  });
});

test("観点が不足していれば ok:false", () => {
  withRepo((root) => {
    const target = specPath(root, "a-design.md");
    writeFileSync(target, "body");
    writeRecord(target, {
      skill: "brainstorming",
      checks: [{ item: "Placeholder scan", finding: "問題なし" }],
    });
    const r = validateRecord(target);
    assert.equal(r.ok, false);
    assert.match(r.reason, /観点が不足/);
  });
});

test("plan は reviewer が approved でなければ ok:false", () => {
  withRepo((root) => {
    const target = planPath(root, "a.md");
    writeFileSync(target, "body");
    writeRecord(target, {
      skill: "writing-plans",
      checks: fullPlanChecks(),
      reviewer: { status: "issues_found", issues: ["Task 3 が spec の要求を満たしていない"] },
    });
    const r = validateRecord(target);
    assert.equal(r.ok, false);
    assert.match(r.reason, /approved/);
  });
});

test("plan は reviewer の status が大文字始まりの Approved でも ok:true", () => {
  withRepo((root) => {
    const target = planPath(root, "a.md");
    writeFileSync(target, "body");
    writeRecord(target, {
      skill: "writing-plans",
      checks: fullPlanChecks(),
      reviewer: { status: "Approved", issues: [] },
    });
    const r = validateRecord(target);
    assert.equal(r.ok, true);
  });
});

test("plan は reviewer が無ければ ok:false", () => {
  withRepo((root) => {
    const target = planPath(root, "a.md");
    writeFileSync(target, "body");
    writeRecord(target, { skill: "writing-plans", checks: fullPlanChecks() });
    assert.equal(validateRecord(target).ok, false);
  });
});

test("spec も reviewer が approved でなければ ok:false", () => {
  withRepo((root) => {
    const target = specPath(root, "a-design.md");
    writeFileSync(target, "body");
    writeRecord(target, {
      skill: "brainstorming",
      checks: fullSpecChecks(),
      reviewer: { status: "issues_found", issues: ["決定事項に対応の無い要件がある"] },
    });
    const r = validateRecord(target);
    assert.equal(r.ok, false);
    assert.match(r.reason, /approved/);
  });
});

test("spec も reviewer が無ければ ok:false", () => {
  withRepo((root) => {
    const target = specPath(root, "a-design.md");
    writeFileSync(target, "body");
    writeRecord(target, { skill: "brainstorming", checks: fullSpecChecks() });
    assert.equal(validateRecord(target).ok, false);
  });
});

test("verifyAll は複数対象のうち 1 件でも欠ければ ok:false", () => {
  withRepo((root) => {
    const a = specPath(root, "a-design.md");
    const b = specPath(root, "b-design.md");
    writeFileSync(a, "a");
    writeFileSync(b, "b");
    writeRecord(a, {
      skill: "brainstorming",
      checks: fullSpecChecks(),
      reviewer: { status: "approved", issues: [] },
    });
    const r = verifyAll([a, b]);
    assert.equal(r.ok, false);
    assert.equal(r.failures.length, 1);
    assert.equal(r.failures[0].target, b);
  });
});

test("verifyAll は全件揃えば ok:true", () => {
  withRepo((root) => {
    const a = specPath(root, "a-design.md");
    const b = specPath(root, "b-design.md");
    writeFileSync(a, "a");
    writeFileSync(b, "b");
    const approved = { status: "approved", issues: [] };
    writeRecord(a, { skill: "brainstorming", checks: fullSpecChecks(), reviewer: approved });
    writeRecord(b, { skill: "brainstorming", checks: fullSpecChecks(), reviewer: approved });
    assert.deepEqual(verifyAll([a, b]), { ok: true, failures: [] });
  });
});

test("verifyAll は渡されなかったファイルを見に行かない", () => {
  withRepo((root) => {
    const a = specPath(root, "a-design.md");
    const other = specPath(root, "other-design.md");
    writeFileSync(a, "a");
    writeFileSync(other, "他セッションの成果物");
    writeRecord(a, {
      skill: "brainstorming",
      checks: fullSpecChecks(),
      reviewer: { status: "approved", issues: [] },
    });
    assert.deepEqual(verifyAll([a]), { ok: true, failures: [] });
  });
});

test("verifyAll の plansOnly は specs を除外する", () => {
  withRepo((root) => {
    const s = specPath(root, "a-design.md");
    const p = planPath(root, "a.md");
    writeFileSync(s, "a");
    writeFileSync(p, "b");
    const r = verifyAll([s, p], { plansOnly: true });
    assert.equal(r.failures.length, 1);
    assert.equal(r.failures[0].target, p);
  });
});

test("verifyAll は実在しないパスを skip する", () => {
  withRepo((root) => {
    const gone = specPath(root, "gone-design.md");
    assert.deepEqual(verifyAll([gone]), { ok: true, failures: [] });
  });
});

test("verifyAll は空配列と undefined を受け付ける", () => {
  assert.deepEqual(verifyAll([]), { ok: true, failures: [] });
  assert.deepEqual(verifyAll(undefined), { ok: true, failures: [] });
});

test("isReviewTarget は specs / plans 直下の .md に真を返す", () => {
  assert.equal(isReviewTarget("/repo/docs/superpowers/specs/a-design.md"), true);
  assert.equal(isReviewTarget("/repo/docs/superpowers/plans/a.md"), true);
});

test("isReviewTarget はサブディレクトリ配下に偽を返す", () => {
  assert.equal(isReviewTarget("/repo/docs/superpowers/specs/sub/a-design.md"), false);
  assert.equal(isReviewTarget("/repo/docs/superpowers/plans/sub/a.md"), false);
});

test("isReviewTarget は .md 以外に偽を返す", () => {
  assert.equal(isReviewTarget("/repo/docs/superpowers/specs/a-design.review.json"), false);
  assert.equal(isReviewTarget("/repo/docs/superpowers/specs/a-design.txt"), false);
  assert.equal(isReviewTarget("/repo/docs/superpowers/specs"), false);
});

test("isReviewTarget は docs/superpowers の外に偽を返す", () => {
  assert.equal(isReviewTarget("/repo/docs/specs/a-design.md"), false);
  assert.equal(isReviewTarget("/repo/README.md"), false);
  assert.equal(isReviewTarget("/repo/kiai-sp/lib/gate-state.mjs"), false);
});

test("isReviewTarget は Windows 形式の区切りも受け付ける", () => {
  assert.equal(isReviewTarget("C:\\repo\\docs\\superpowers\\specs\\a-design.md"), true);
  assert.equal(isReviewTarget("C:\\repo\\docs\\superpowers\\specs\\sub\\a-design.md"), false);
});
