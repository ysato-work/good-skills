/**
 * forbidden-bash.mjs
 *
 * 無人実行中に走らせてはいけない Bash コマンドを判定する。純関数だけを持ち、
 * ファイルにもプロセスにも触らない。
 *
 * 指示文での禁止では足りない。無人実行では人間の承認操作が消えるので、承認が
 * 事実上果たしていたポリシー執行を機械側に移す必要がある。
 *
 * 自分の資源と開発者の資源は「名前」で分ける。コンテナ・ボリューム・ネットワークは
 * RESOURCE_PREFIX で始まる名前のものだけ操作してよく、push は ALLOWED_BRANCH_PREFIX で
 * 始まるブランチにだけ通す。状態ファイルに許可対象を記録する方式にしないのは、記録が
 * 落ちた瞬間に「何でも許す」か「何も許さない」のどちらかに倒れるからである。名前なら
 * 判定材料がコマンドの中に必ずある。
 *
 * ホストポートの固定を禁じているのは、使用中ポートの衝突を防ぐためである。実行前後で
 * ポート一覧を突き合わせるより、そもそも固定ポートを取らせないほうが確実で安い。
 *
 * 判定はコマンド全体ではなくセグメント単位で行う。`npm test && sudo rm -rf /` のような
 * 連結を見落とさないため。
 *
 * localhost の DB への書き込みは、Tier 2 の使い捨てDB（TIERS.md の規約で
 * spec-testing- を名乗る）を除いて止める。名前を名乗らない localhost 接続は
 * 開発者の実データベースである可能性を排除できないので、書き込みは通さない。
 * 読み取りは止めない（C2 が明示的に許可している）。
 *
 * pip install を単体では止めていない。プロジェクトの仮想環境への導入とシステムへの
 * 導入を、フックから渡る情報だけでは区別できない。sudo を一律で止めることで
 * `sudo pip install` は塞がる。
 *
 * export:
 *   ALLOWED_BRANCH_PREFIX / RESOURCE_PREFIX / LOCAL_HOSTS / CI_PATH
 *   splitSegments(command) / tokenize(segment)
 *   pushTargetBranch(segment) / hostsIn(segment) / hasRemoteHost(segment)
 *   BASH_RULES
 *   classifyBash(command) → { blocked, ruleId, reason, segment }
 */

/** このスキルが作る成果物ブランチの接頭辞。ここへの push だけを通す */
export const ALLOWED_BRANCH_PREFIX = "spec-testing/";

/** このスキルが立てるコンテナ・ボリューム・ネットワークの接頭辞 */
export const RESOURCE_PREFIX = "spec-testing-";

export const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "host.docker.internal",
]);

export const CI_PATH =
  /(?:^|[\s"'=/])(?:\.github\/workflows\/|\.gitlab-ci\.ya?ml|\.circleci\/|Jenkinsfile|azure-pipelines\.ya?ml|\.travis\.ya?ml|bitbucket-pipelines\.ya?ml)/;

const DB_CLIENT = /\b(?:psql|mysql|mariadb|mongosh|mongo|redis-cli|clickhouse-client|sqlcmd)\b/;

const MIGRATION =
  /\b(?:prisma\s+(?:migrate|db)|rails\s+db:|alembic\s+(?:upgrade|downgrade)|sequelize\s+db:|knex\s+migrate|artisan\s+migrate|flyway\s+(?:migrate|clean))/;

export function splitSegments(command) {
  return String(command)
    .split(/\n|&&|\|\||[;|]/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

export function tokenize(segment) {
  return String(segment)
    .split(/\s+/)
    .filter((t) => t !== "");
}

function isGitPush(segment) {
  return /\bgit\s+(?:-\S+\s+)*push\b/.test(segment);
}

export function pushTargetBranches(segment) {
  const tokens = tokenize(segment);
  const i = tokens.indexOf("push");
  if (i === -1) return [];

  const rest = tokens.slice(i + 1).filter((t) => !t.startsWith("-"));
  if (rest.length < 2) return [];

  // remote 名は rest[0]。rest[1] 以降がすべての refspec
  return rest.slice(1).map((refspec) => {
    const cleaned = refspec.replace(/^\+/, "");
    const dest = cleaned.includes(":") ? cleaned.split(":").pop() : cleaned;
    return dest.replace(/^refs\/heads\//, "");
  });
}

export function pushTargetBranch(segment) {
  const branches = pushTargetBranches(segment);
  return branches.length > 0 ? branches[0] : null;
}

export function hostsIn(segment) {
  const hosts = [];
  for (const m of String(segment).matchAll(
    /\b[a-z][a-z0-9+.-]*:\/\/(?:[^@\s/]*@)?([^\s/:?#'"]+)/gi,
  )) {
    hosts.push(m[1]);
  }
  for (const m of String(segment).matchAll(/(?:^|\s)(?:-h|--host)[=\s]+([^\s'"]+)/g)) {
    hosts.push(m[1]);
  }
  return hosts;
}

export function hasRemoteHost(segment) {
  return hostsIn(segment).some((h) => !LOCAL_HOSTS.has(h.replace(/^\[|\]$/g, "")));
}

/** docker のサブコマンドに渡された、フラグでない引数 */
function targetsOf(tail) {
  return tokenize(tail).filter((t) => !t.startsWith("-"));
}

/**
 * セグメントが Tier 2 の使い捨てDB接続を名乗っているかチェック。
 * spec-testing- がフラグの値として明示的に指定されているかを見る。
 * positional 引数からのDB名推測は迂回可能なため行わない。
 * 必要に応じて -D/--database を明示的に使用すること。
 */
function hasSpecTestingDbName(segment) {
  // -d / --dbname の直後の値に spec-testing- が含まれているか
  const dbMatch = segment.match(/(?:^|\s)(?:-d|--dbname)[=\s]+(\S+)/);
  if (dbMatch && dbMatch[1].includes("spec-testing-")) return true;

  // -D / --database の直後の値に spec-testing- が含まれているか（mysql の正式なDB指定オプション）
  const databaseMatch = segment.match(/(?:^|\s)(?:-D|--database)[=\s]+(\S+)/);
  if (databaseMatch && databaseMatch[1].includes("spec-testing-")) return true;

  // -p / --port の直後の値に spec-testing- が含まれているか
  const portMatch = segment.match(/(?:^|\s)(?:-p|--port)[=\s]+(\S+)/);
  if (portMatch && portMatch[1].includes("spec-testing-")) return true;

  // -h / --host の直後の値に spec-testing- が含まれているか
  const hostMatch = segment.match(/(?:^|\s)(?:-h|--host)[=\s]+(\S+)/);
  if (hostMatch && hostMatch[1].includes("spec-testing-")) return true;

  // 接続URI（postgresql://...など）の database 部分に spec-testing- が含まれているか
  for (const m of String(segment).matchAll(
    /\b[a-z][a-z0-9+.-]*:\/\/(?:[^@\s/]*@)?[^\s/:?#'"]+(?::\d+)?\/([^\s/:?#'"]+)/gi,
  )) {
    if (m[1].includes("spec-testing-")) return true;
  }

  return false;
}

export const BASH_RULES = [
  {
    id: "force-push",
    reason: "force push は禁止。他人の履歴を壊すうえ、取り返しがつかない",
    match: (s) =>
      isGitPush(s) &&
      /(?:^|\s)(?:-f|--force|--force-with-lease(?:=\S*)?|--force-if-includes)(?=\s|$)/.test(s),
  },
  {
    id: "push-to-foreign-branch",
    reason: `push できるのは ${ALLOWED_BRANCH_PREFIX} で始まる成果物ブランチだけ`,
    match: (s) => {
      if (!isGitPush(s)) return false;
      const branches = pushTargetBranches(s);
      return branches.length === 0 || branches.some((b) => !b.startsWith(ALLOWED_BRANCH_PREFIX));
    },
  },
  {
    id: "sudo",
    reason: "sudo は開発者マシンのグローバルな状態を変える",
    match: (s) => /(?:^|\s)sudo\s/.test(s),
  },
  {
    id: "global-install",
    reason: "グローバルなパッケージ操作は開発者マシンの状態を変える",
    match: (s) =>
      /\bnpm\s+(?:i|install|add|uninstall|rm)\b.*\s(?:-g|--global)(?=\s|$)/.test(s) ||
      /\byarn\s+global\s+(?:add|remove)\b/.test(s) ||
      /\bpnpm\s+(?:add|install|remove)\b.*\s(?:-g|--global)(?=\s|$)/.test(s) ||
      /\bbrew\s+(?:install|uninstall|upgrade|link)\b/.test(s) ||
      /\b(?:apt|apt-get|yum|dnf|apk|pacman)\s+(?:install|remove|upgrade|add)\b/.test(s) ||
      /\bgem\s+install\b/.test(s) ||
      /\bcargo\s+install\b/.test(s) ||
      /\bgo\s+install\b/.test(s),
  },
  {
    id: "prune-everything",
    reason: "prune は開発者の既存のコンテナとボリュームまで消す",
    match: (s) =>
      /\b(?:docker|podman)\s+(?:system|volume|network|container|image)\s+prune\b/.test(s),
  },
  {
    id: "touch-foreign-resource",
    reason: `操作してよいのは ${RESOURCE_PREFIX} で始まる名前のコンテナ・ボリューム・ネットワークだけ`,
    match: (s) => {
      const m = s.match(
        /\b(?:docker|podman)\s+(?:(?:container|volume|network|image)\s+)?(?:rm|rmi|stop|kill|restart|update)\b(.*)$/,
      );
      if (!m) return false;
      const targets = targetsOf(m[1]);
      return targets.length === 0 || targets.some((t) => !t.startsWith(RESOURCE_PREFIX));
    },
  },
  {
    id: "compose-without-project",
    reason: `docker compose には -p ${RESOURCE_PREFIX}... を付けて開発者のスタックと分ける`,
    match: (s) => {
      if (!/\b(?:docker\s+compose|docker-compose|podman-compose)\b/.test(s)) return false;
      if (!/\b(?:up|down|start|stop|restart|rm)\b/.test(s)) return false;
      const m = s.match(/(?:^|\s)(?:-p|--project-name)[=\s]+(\S+)/);
      return !m || !m[1].startsWith(RESOURCE_PREFIX);
    },
  },
  {
    id: "fixed-host-port",
    reason: "ホストポートを固定すると開発者が使用中のポートと衝突する。127.0.0.1::<port> か -P を使う",
    match: (s) => {
      if (!/\b(?:docker|podman)\b/.test(s)) return false;
      return /(?:^|\s)(?:-p|--publish)[=\s]+(?:[\d.]+:)?\d+:\d+/.test(s);
    },
  },
  {
    id: "remote-database",
    reason: "localhost 以外のデータベースには接続しない",
    match: (s) => DB_CLIENT.test(s) && hasRemoteHost(s),
  },
  {
    id: "remote-migration",
    reason: "localhost 以外へマイグレーションを流さない",
    match: (s) => MIGRATION.test(s) && hasRemoteHost(s),
  },
  {
    id: "local-database-write",
    reason:
      "開発用データベースへの書き込みは禁止。テスト用に立てた spec-testing- のDB/ポートを名乗る接続だけ許可する",
    match: (s) => {
      if (!DB_CLIENT.test(s) || hasRemoteHost(s)) return false;
      if (!/\b(?:INSERT|UPDATE|DELETE|MERGE)\b/i.test(s)) return false;
      // Tier 2 で立てた使い捨てDBは名前に spec-testing- を含める規約（TIERS.md）。
      // DB名・ポート・ホスト・接続URIのDB部分に spec-testing- が実際に現れていれば許可する。
      // コマンド内のどこかに文字列があるだけでなく、接続対象を表す部分に含まれていることを確認する。
      return !hasSpecTestingDbName(s);
    },
  },
  {
    id: "destructive-migration",
    reason: "データベースを落とす操作は localhost でも禁止",
    match: (s) =>
      /\brails\s+db:(?:drop|reset)\b/.test(s) ||
      /\bprisma\s+migrate\s+reset\b/.test(s) ||
      /\bflyway\s+clean\b/.test(s) ||
      ((DB_CLIENT.test(s) || MIGRATION.test(s)) &&
        /\b(?:DROP\s+(?:DATABASE|SCHEMA|TABLE)|TRUNCATE)\b/i.test(s)),
  },
  {
    id: "authenticated-remote-request",
    reason: "外部サービスへ認証情報を伴うアクセスをしない",
    match: (s) =>
      /\b(?:curl|wget|httpie|http)\b/.test(s) &&
      hasRemoteHost(s) &&
      /(?:(?:^|\s)(?:-u|--user)[=\s]|Authorization\s*:|Bearer\s|[?&](?:access_)?token=)/.test(s),
  },
  {
    id: "delete-test-file",
    reason: "テストを消して緑にするのは禁止",
    match: (s) =>
      /\b(?:rm|git\s+rm)\b[^\n]*(?:\.(?:test|spec)\.[a-z]+|_test\.(?:go|py|rb)|_spec\.rb|test_[a-z0-9_]+\.py|Test\.java)/.test(
        s,
      ),
  },
  {
    id: "write-ci-config",
    reason: "CI 設定ファイルは変更しない",
    match: (s) => /(?:>|>>|\btee\b|\bsed\s+-i|\brm\b|\bmv\b|\bcp\b)/.test(s) && CI_PATH.test(s),
  },
  {
    id: "self-disarm",
    reason: "テスト実行中のガードを自分で解除しない。解除は人間が対話中に行う",
    match: (s) => /\bguard-hook\.mjs\b/.test(s) && /\bdisarm\b/.test(s),
  },
];

export function classifyBash(command) {
  for (const segment of splitSegments(command)) {
    for (const rule of BASH_RULES) {
      if (rule.match(segment)) {
        return { blocked: true, ruleId: rule.id, reason: rule.reason, segment };
      }
    }
  }
  return { blocked: false };
}
