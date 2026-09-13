import assert from "node:assert/strict";
import { test } from "node:test";
import { RESOURCE_PREFIX } from "./forbidden-bash.mjs";
import { collectEnv, parseNames, verifyNoLeftovers } from "./env-snapshot.mjs";

const P = RESOURCE_PREFIX;

function env(over = {}) {
  return { available: true, containers: [], volumes: [], networks: [], ...over };
}

test("parseNames は空行を落として並べる", () => {
  assert.deepEqual(parseNames("a\n\nb\n"), ["a", "b"]);
});

test("実行前後で何も変わっていなければ ok", () => {
  const before = env({ containers: ["app_db_1"] });
  const after = env({ containers: ["app_db_1"] });
  assert.equal(verifyNoLeftovers(before, after, { prefix: P }).ok, true);
});

test("自分が立てたコンテナが残っていれば ok でない", () => {
  const before = env();
  const after = env({ containers: [`${P}pg`] });
  const r = verifyNoLeftovers(before, after, { prefix: P });
  assert.equal(r.ok, false);
  assert.deepEqual(r.leaked, [`containers:${P}pg`]);
  assert.match(r.reason, /立てた環境が残っている/);
});

test("自分が立てたボリュームが残っていれば ok でない", () => {
  const r = verifyNoLeftovers(env(), env({ volumes: [`${P}pgdata`] }), { prefix: P });
  assert.equal(r.ok, false);
  assert.deepEqual(r.leaked, [`volumes:${P}pgdata`]);
});

test("開発者の資源が増えていれば ok でない", () => {
  const r = verifyNoLeftovers(env(), env({ containers: ["app_db_1"] }), { prefix: P });
  assert.equal(r.ok, false);
  assert.deepEqual(r.foreignAdded, ["containers:app_db_1"]);
  assert.match(r.reason, /開発者の資源/);
});

test("開発者の資源が消えていれば ok でない", () => {
  const r = verifyNoLeftovers(env({ volumes: ["app_pgdata"] }), env(), { prefix: P });
  assert.equal(r.ok, false);
  assert.deepEqual(r.foreignRemoved, ["volumes:app_pgdata"]);
});

test("docker が無い環境では比較せず、そのことを理由に残す", () => {
  const r = verifyNoLeftovers(env({ available: false }), env({ available: false }), { prefix: P });
  assert.equal(r.ok, true);
  assert.match(r.reason, /docker が使えない/);
});

test("collectEnv は注入した spawn の出力をまとめる", () => {
  const outputs = {
    "ps": `${P}pg\napp_db_1\n`,
    "volume": `${P}pgdata\n`,
    "network": "bridge\n",
  };
  const fakeSpawn = (file, args) => {
    const key = args.find((a) => a in outputs) ?? "ps";
    return { status: 0, stdout: outputs[key], stderr: "" };
  };
  const e = collectEnv({ spawn: fakeSpawn });
  assert.equal(e.available, true);
  assert.deepEqual(e.containers, [`${P}pg`, "app_db_1"]);
  assert.deepEqual(e.volumes, [`${P}pgdata`]);
  assert.deepEqual(e.networks, ["bridge"]);
});

test("docker が起動できなければ available は false", () => {
  const fakeSpawn = () => ({ status: 127, stdout: "", stderr: "command not found" });
  assert.equal(collectEnv({ spawn: fakeSpawn }).available, false);
});
