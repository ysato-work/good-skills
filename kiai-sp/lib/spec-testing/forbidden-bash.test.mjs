import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALLOWED_BRANCH_PREFIX,
  BASH_RULES,
  RESOURCE_PREFIX,
  classifyBash,
  hasRemoteHost,
  pushTargetBranch,
  splitSegments,
} from "./forbidden-bash.mjs";

function blockedBy(command) {
  const v = classifyBash(command);
  return v.blocked ? v.ruleId : null;
}

test("splitSegments は連結されたコマンドを分ける", () => {
  assert.deepEqual(splitSegments("a && b || c ; d | e"), ["a", "b", "c", "d", "e"]);
});

test("pushTargetBranch はリモートの次の refspec を宛先として読む", () => {
  assert.equal(pushTargetBranch("git push origin spec-testing/x"), "spec-testing/x");
  assert.equal(pushTargetBranch("git push -u origin spec-testing/x"), "spec-testing/x");
  assert.equal(pushTargetBranch("git push origin HEAD:spec-testing/x"), "spec-testing/x");
  assert.equal(pushTargetBranch("git push origin refs/heads/main"), "main");
});

test("pushTargetBranch は宛先を特定できなければ null", () => {
  assert.equal(pushTargetBranch("git push"), null);
  assert.equal(pushTargetBranch("git push origin"), null);
});

test("hasRemoteHost は localhost を外部とみなさない", () => {
  assert.equal(hasRemoteHost("psql -h localhost -U u"), false);
  assert.equal(hasRemoteHost("psql postgresql://u:p@127.0.0.1:5432/db"), false);
  assert.equal(hasRemoteHost("psql -h db.internal -U u"), true);
});

test("成果物ブランチへの push は通る", () => {
  assert.equal(blockedBy(`git push -u origin ${ALLOWED_BRANCH_PREFIX}2026-08-31-x`), null);
});

test("既存ブランチへの push は止まる", () => {
  assert.equal(blockedBy("git push -u origin main"), "push-to-foreign-branch");
  assert.equal(blockedBy("git push"), "push-to-foreign-branch");
});

test("force push は成果物ブランチ相手でも止まる", () => {
  assert.equal(blockedBy(`git push --force origin ${ALLOWED_BRANCH_PREFIX}x`), "force-push");
  assert.equal(blockedBy(`git push -f origin ${ALLOWED_BRANCH_PREFIX}x`), "force-push");
  assert.equal(
    blockedBy(`git push --force-with-lease origin ${ALLOWED_BRANCH_PREFIX}x`),
    "force-push",
  );
});

test("複数refspecのpushは、1つでも許可外ブランチがあれば止まる", () => {
  assert.equal(blockedBy(`git push origin ${ALLOWED_BRANCH_PREFIX}x main`), "push-to-foreign-branch");
});

test("複数refspecのpushで全てが成果物ブランチなら通る", () => {
  assert.equal(blockedBy(`git push origin ${ALLOWED_BRANCH_PREFIX}x ${ALLOWED_BRANCH_PREFIX}y`), null);
});

test("sudo は止まる", () => {
  assert.equal(blockedBy("sudo apt-get install -y postgresql"), "sudo");
  assert.equal(blockedBy("npm test && sudo rm -rf /var/lib/x"), "sudo");
});

test("グローバルなパッケージ操作は止まる", () => {
  assert.equal(blockedBy("npm install -g typescript"), "global-install");
  assert.equal(blockedBy("yarn global add serve"), "global-install");
  assert.equal(blockedBy("brew install postgresql"), "global-install");
  assert.equal(blockedBy("gem install rails"), "global-install");
});

test("プロジェクト内のインストールは通る", () => {
  assert.equal(blockedBy("npm install"), null);
  assert.equal(blockedBy("npm ci"), null);
  assert.equal(blockedBy("pip install -r requirements.txt"), null);
});

test("prune は止まる", () => {
  assert.equal(blockedBy("docker system prune -af"), "prune-everything");
  assert.equal(blockedBy("docker volume prune"), "prune-everything");
});

test("自分の資源以外のコンテナ操作は止まる", () => {
  assert.equal(blockedBy("docker rm app_db_1"), "touch-foreign-resource");
  assert.equal(blockedBy("docker stop app_db_1"), "touch-foreign-resource");
  assert.equal(blockedBy("docker volume rm app_pgdata"), "touch-foreign-resource");
});

test("自分の資源の後始末は通る", () => {
  assert.equal(blockedBy(`docker rm -f ${RESOURCE_PREFIX}pg`), null);
  assert.equal(blockedBy(`docker volume rm ${RESOURCE_PREFIX}pgdata`), null);
});

test("docker compose はプロジェクト名が無いと止まる", () => {
  assert.equal(blockedBy("docker compose up -d"), "compose-without-project");
  assert.equal(blockedBy("docker compose down -v"), "compose-without-project");
  assert.equal(blockedBy("docker compose -p app up -d"), "compose-without-project");
});

test("プロジェクト名を分けた docker compose は通る", () => {
  assert.equal(blockedBy(`docker compose -p ${RESOURCE_PREFIX}x -f compose.test.yml up -d`), null);
});

test("ホストポートの固定は止まる", () => {
  assert.equal(blockedBy("docker run -p 5432:5432 postgres:16"), "fixed-host-port");
  assert.equal(blockedBy("docker run --publish 8080:80 nginx"), "fixed-host-port");
});

test("エフェメラルなポート割り当ては通る", () => {
  assert.equal(blockedBy(`docker run --name ${RESOURCE_PREFIX}pg -p 127.0.0.1::5432 postgres:16`), null);
  assert.equal(blockedBy(`docker run --name ${RESOURCE_PREFIX}pg -P postgres:16`), null);
});

test("localhost 以外のデータベースへの接続は止まる", () => {
  assert.equal(blockedBy("psql -h db.internal -U u -c 'select 1'"), "remote-database");
  assert.equal(blockedBy("mysql --host=db.internal -e 'select 1'"), "remote-database");
});

test("localhost のデータベースへの接続は通る", () => {
  assert.equal(blockedBy("psql -h 127.0.0.1 -U u -c 'select 1'"), null);
});

test("localhost の開発用データベースへの書き込みは止まる", () => {
  assert.equal(blockedBy("psql -h localhost -U u -c 'UPDATE users SET x = 1'"), "local-database-write");
  assert.equal(blockedBy("psql -U u -c 'INSERT INTO logs VALUES (1)'"), "local-database-write");
  assert.equal(blockedBy("mysql -h 127.0.0.1 -e 'DELETE FROM sessions'"), "local-database-write");
});

test("Tier 2 の使い捨てDBへの書き込みは、spec-testing- のポートやDB名を名乗れば通る", () => {
  assert.equal(
    blockedBy("psql -h 127.0.0.1 -p 55432 -U u -d spec-testing-db -c 'UPDATE users SET x = 1'"),
    null,
  );
});

test("spec-testing-を無関係な位置に置いただけのlocalhost書き込みは止まる", () => {
  assert.equal(
    blockedBy('psql -h localhost -U u -c "UPDATE users SET x=1" -- spec-testing-'),
    "local-database-write",
  );
});

test("DB名がspec-testing-で始まる書き込みは通る(既存挙動の維持確認)", () => {
  assert.equal(
    blockedBy("psql -h 127.0.0.1 -p 55432 -U u -d spec-testing-db -c 'UPDATE users SET x = 1'"),
    null,
  );
});

test("mysqlのpositional DB名だけでは通らない(推測は迂回可能なため廃止)", () => {
  // positional 引数からのDB名推測は -u などのフラグ値を誤認識する迂回可能性があるため廃止。
  // 代わりに -D/--database フラグで明示的に指定する必要がある。
  assert.equal(
    blockedBy("mysql -h 127.0.0.1 spec-testing-db -e 'UPDATE users SET x=1'"),
    "local-database-write",
  );
});

test("mysqlは--databaseフラグでspec-testing-を明示すれば通る", () => {
  assert.equal(
    blockedBy("mysql -h 127.0.0.1 --database spec-testing-db -e 'UPDATE users SET x=1'"),
    null,
  );
});

test("-uの値にspec-testing-を仕込んでも実データベースへの書き込みは止まる(スプーフィング対策)", () => {
  // ブラックリスト方式のフラグ判定では回避可能だったため、positional 引数推測を廃止した。
  // これにより -u の値に spec-testing- を混ぜても、positional 引数として誤認識されない。
  assert.equal(
    blockedBy("mysql -h 127.0.0.1 -u spec-testing-x realdb -e 'DELETE FROM users'"),
    "local-database-write",
  );
});

test("localhost の読み取りは止めない", () => {
  assert.equal(blockedBy("psql -h localhost -U u -c 'select 1 from users'"), null);
});

test("データベースを落とす操作は localhost でも止まる", () => {
  assert.equal(blockedBy("rails db:reset"), "destructive-migration");
  assert.equal(blockedBy("npx prisma migrate reset"), "destructive-migration");
  assert.equal(
    blockedBy("psql -h localhost -c 'DROP DATABASE app'"),
    "destructive-migration",
  );
});

test("DROP を含むだけのコードの grep は止めない", () => {
  assert.equal(blockedBy("grep -rn 'DROP TABLE' src/"), null);
});

test("認証情報つきの外部アクセスは止まる", () => {
  assert.equal(
    blockedBy("curl -H 'Authorization: Bearer abc' https://api.example.test/v1/x"),
    "authenticated-remote-request",
  );
  assert.equal(blockedBy("curl -u user:pw https://api.example.test/x"), "authenticated-remote-request");
});

test("認証なしの外部アクセスと localhost へのアクセスは止めない", () => {
  assert.equal(blockedBy("curl https://example.test/health"), null);
  assert.equal(blockedBy("curl -H 'Authorization: Bearer abc' http://localhost:8080/x"), null);
});

test("テストファイルの削除は止まる", () => {
  assert.equal(blockedBy("rm src/foo.test.ts"), "delete-test-file");
  assert.equal(blockedBy("git rm tests/test_foo.py"), "delete-test-file");
});

test("CI 設定への書き込みは止まる", () => {
  assert.equal(blockedBy("sed -i s/a/b/ .github/workflows/ci.yml"), "write-ci-config");
  assert.equal(blockedBy("echo x > .gitlab-ci.yml"), "write-ci-config");
});

test("普通のテスト実行は何も止めない", () => {
  for (const command of [
    "npm test",
    "node --test kiai-sp/lib/spec-testing/*.test.mjs",
    "pytest tests/",
    "go test ./...",
    "git add -A && git commit -m 'test: 追加'",
    "git status --short",
  ]) {
    assert.equal(blockedBy(command), null, `${command} が止まった`);
  }
});

test("ルール ID は重複しない", () => {
  const ids = BASH_RULES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("すべてのルールが理由文を持つ", () => {
  for (const rule of BASH_RULES) {
    assert.equal(typeof rule.reason, "string");
    assert.notEqual(rule.reason, "", `${rule.id} の理由が空`);
  }
});

test("エージェント自身によるガードの解除は止まる", () => {
  assert.equal(blockedBy("node kiai-sp/lib/spec-testing/guard-hook.mjs disarm --session s1"), "self-disarm");
  assert.equal(blockedBy("node /abs/path/guard-hook.mjs disarm --session s1"), "self-disarm");
});

test("Rubyのspecファイルの削除も止まる", () => {
  assert.equal(blockedBy("rm spec/models/user_spec.rb"), "delete-test-file");
});
