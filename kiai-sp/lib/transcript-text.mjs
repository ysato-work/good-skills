/**
 * transcript-text.mjs
 *
 * いまいるセッションの会話の記録から、人間の発言だけを平文にして出す。
 *
 * セッションは環境変数 CLAUDE_CODE_SESSION_ID で名指しする。記録の場所は
 * セッション ID の走査で決める。cwd のエンコード規則を推測する道は置かない。
 * 記録はセッションを始めた作業ディレクトリの下に置かれるので、cwd から組む
 * のは二重の仕組みになり、片方だけ直すと食い違うため。
 *
 * export:
 *   resolveTranscriptPath(opts) → 実際に存在する記録のパス。セッション ID が無ければ null
 *   humanMessages(fileText)     → 人間の発言の配列
 *   render(path, messages)      → 平文
 */
import {
  closeSync,
  existsSync,
  fstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

// レコード側の区分 (isMeta, origin.kind) を主にして大半を落とす。この接頭辞の
// 列挙は最終手段で、isMeta の付かない差し込み文 (task-notification など) だけ
// を落とす。wakaranai/lib/transcript.mjs と rules-distill の extract.mjs も同
// じ一覧を持つが、プラグインをまたげないため写している。
const MACHINE_PREFIX =
  /^\s*<(task-notification|system-reminder|local-command|bash-|agent-message|pasted_content|command-)/;
// タグで書き出されない差し込み文。スラッシュコマンドのコマンド行、別セッション
// から届いた文（再開の告知も含む）、コマンドの注意書き、スキルの前置きと止まった
// 場合の告知。rules-distill の一覧と突き合わせて足した
const MACHINE_TEXT_PREFIX =
  /^(Another Claude session sent a message|This session is being continued|Caveat:|Base directory for this skill|Stop hook feedback|\[Request interrupted)/;

/**
 * 記録はセッション ID の名前のファイルとして projects/<作業ディレクトリ>/ の下
 * に置かれる。セッション ID は一意なので、その名前で projects の下を走査して
 * 1 本に決める。session-purge の purge.mjs と同じ規則。
 */
function rel(p) {
  return basename(p);
}

// セッション ID は記録のファイル名の一部になる。環境から来る値なので、置き場に
// 留まらない形 (上へ遡る指定、区切り文字) を受け付けない。
const SESSION_ID_SHAPE = /^[0-9A-Za-z_-]+$/;

// root の実体が無いときは文字列のまま確かめる (記録をまだ書いていない環境のため)。
function scopeOf(root, target) {
  let scope = root;
  try {
    scope = realpathSync(root);
  } catch {
    // root 未作成
  }
  try {
    target = realpathSync(target);
  } catch {
    // target 未作成。実体ではなく名前で確かめる
  }
  return [scope, target];
}

// 別名 (リンクをたどった後の実体) が確かめるべき記録そのものかを確かめる。絶対
// パスの実体は置き場の下でも、外にある元の実体のハードリンクだと、置き場の下に
// 作られた名前なので実体の位置検査では見分けが付かない。記録の実体は 1 つの名前
// しか持たないため、リンク数で外の実体の別名を外す。
function isAliased(path) {
  try {
    return statSync(path).nlink !== 1;
  } catch {
    // 実体が読めないときはここでは外さない (下流の読み取りで扱う)
    return false;
  }
}

// root と環境から、記録の置き場のパスを組む。
function projectsRoot({ home, env }) {
  return join(env.CLAUDE_CONFIG_DIR || join(home, ".claude"), "projects");
}

// 開いた記述子の実体が、名指されたパスの実体と同じかを dev/ino で確かめる。
export function fdMatches(fd, actual) {
  const opened = fstatSync(fd);
  const named = statSync(actual);
  return opened.dev === named.dev && opened.ino === named.ino;
}

// 範囲内と確かめたパスを、実体のまま開く。
//
// 確かめと読みの間に途中のディレクトリを差し替えられる余地 (TOCTOU) を閉じる。
// 開いた記述子の実体を /proc/self/fd で確かめ、範囲の外の実体を掴んでいたら閉
// じて拒否する。開いた後は差し替えで記述子の実体は変わらないため、その記述子
// で読み切る。/proc が無い環境 (macOS など) では、名前の実体をもう一度確かめ
// て範囲を見たうえで、開いた記述子の実体 (dev/ino) がその名前と一致するかを
// 見る。開いた後の記述子の実体は変わらないため、確かめと開きの間に差し替えら
// れていたら一致せず拒否する。統合テストのために記述子実体の場所だけ差し替え
// られるようにしている (既定は /proc/self/fd)。Node に openat は無いため、こ
// の形が限界。
export function openVerified(root, path, { procFdDir = "/proc/self/fd" } = {}) {
  const fd = openSync(path, "r");
  try {
    let actual;
    let scope = root;
    try {
      actual = realpathSync(join(procFdDir, String(fd)));
      scope = realpathSync(root);
    } catch {
      // /proc が無い環境。名前の実体をもう一度確かめ、記述子との一致も見る
      actual = realpathSync(path);
      if (!fdMatches(fd, actual)) {
        throw new Error("会話の記録の置き場の外の実体を開きました");
      }
    }
    if (relative(scope, actual).startsWith("..")) {
      throw new Error("会話の記録の置き場の外の実体を開きました");
    }
    return fd;
  } catch (e) {
    closeSync(fd);
    throw e;
  }
}

export function resolveTranscriptPath({
  file,
  sessionId = process.env.CLAUDE_CODE_SESSION_ID,
  home = homedir(),
  env = process.env,
} = {}) {
  const root = projectsRoot({ home, env });
  if (file) {
    // --file を記録の置き場の下に閉じる。任意のパスを通すと、この道具で範囲外の
    // ファイルを平文化できてしまうため。比較はリンクをたどった実体で行う。置き場
    // の下に外を指すリンクがあっても、それを通せないようにする。拡張子も記録の
    // ものに限定する。
    // 確かめた実体のパスを返す。名指されたパスを返すと、比較と読みの間にリンクを
    // 差し替えられて、範囲の外の実体を読めてしまうため
    const [scope, target] = scopeOf(root, file);
    if (!file.endsWith(".jsonl") || relative(scope, target).startsWith("..") || isAliased(target)) {
      throw new Error("--file は会話の記録の置き場の下の jsonl ファイルで名指す");
    }
    return target;
  }
  if (!sessionId) return null;
  if (!SESSION_ID_SHAPE.test(sessionId)) {
    throw new Error("セッション ID は英数字と - _ だけで名指す");
  }
  const hits = [];
  if (existsSync(root)) {
    for (const dir of readdirSync(root)) {
      const candidate = join(root, dir, `${sessionId}.jsonl`);
      if (!existsSync(candidate)) continue;
      // セッション ID から組み立てた道筋も、--file と同じく実体で範囲を確かめる。
      // 置き場の下に外を指すリンクがあると、名前のまま読むと範囲外の実体を読めるため
      const [scope, target] = scopeOf(root, candidate);
      if (relative(scope, target).startsWith("..") || isAliased(target)) continue;
      // 確かめた実体のパスを返す。名前のパスを返すと、決めてから読むまでの間に
      // リンクを差し替えられて、別の実体を読めてしまうため
      hits.push(target);
    }
  }
  if (hits.length === 1) return hits[0];
  // 関数から出るエラーの文面にはパスを載せない。関数として別の道具から呼ばれた
  // とき、文面がそのまま平文として流れるため。入口は CLI ブロック (下) で、そこ
  // では例外の文面を出さない。
  if (hits.length === 0) throw new Error(`セッション ${sessionId} の会話の記録が見つからない`);
  throw new Error("会話の記録が複数ある。--file で指定する");
}

// textOf・humanMessages・parseArgs は wakaranai/lib/transcript.mjs と rules-distill
// の extract.mjs にある同じ役割の関数と丸ごと同じ規則。プラグインをまたげないた
// め写している。このファイル固有なのは origin.kind の判定と render の平文の組み
// 立てだけ。
// 区分 (origin, isMeta) を持たない形式の記録では、道具の実行結果が user 行に
// 入ることがある。tool_result の塊を含む行は、本文に人間の語が混ざっていても
// 全体を落とす。接頭辞の一覧では実行結果の本文を防げないため。
function hasToolResult(message) {
  return Array.isArray(message?.content) && message.content.some((b) => b?.type === "tool_result");
}

function textOf(message) {
  const c = message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .filter((b) => b?.type === "text")
      .map((b) => b.text ?? "")
      .join("");
  }
  return "";
}

export function humanMessages(fileText) {
  const out = [];
  for (const lineText of fileText.split("\n")) {
    if (!lineText.trim()) continue;
    let r;
    try {
      r = JSON.parse(lineText);
    } catch {
      continue;
    }
    if (r.type !== "user") continue;
    if (r.isMeta || r.isCompactSummary || r.isVisibleInTranscriptOnly) continue;
    if (r.origin && r.origin.kind !== "human") continue;
    if (hasToolResult(r.message)) continue;
    const text = textOf(r.message).trim();
    if (!text || MACHINE_PREFIX.test(text) || MACHINE_TEXT_PREFIX.test(text)) continue;
    out.push({ timestamp: r.timestamp, text });
  }
  return out;
}

export function render(path, messages) {
  const head = [`# 会話の記録: ${rel(path)}`, `# 人間の発言 ${messages.length} 件`];
  const body = messages.map((m) => `\n<<<human ${m.timestamp}>>>\n${m.text}`);
  return [...head, ...body].join("\n") + "\n";
}

// 記録の全文を一度にメモリへ読む。上側の上限で大きさを確かめ、極端に大きい記録
// は読まずに拒否する。閾値はテストから注入できるようにしている。
const MAX_TRANSCRIPT_BYTES = 100 * 1024 * 1024; // 100 MB

export function run({ file, sessionId, home, env = process.env, maxBytes = MAX_TRANSCRIPT_BYTES } = {}) {
  const path = resolveTranscriptPath({ file, sessionId, home, env });
  if (!path) throw new Error("Claude Code ではないので、会話の記録は読めない。");
  const root = projectsRoot({ home, env });
  // 読み取りの下流 (openSync の ENOENT など) の例外文面にはパスが乗る。関数とし
  // て他の道具から呼ばれたとき、文面がそのまま平文として流れるため、簡潔な文面に
  // 包み直す。CLI ブロックで握りつぶされるのは起動したときだけなので、ここでも閉じる。
  try {
    const fd = openVerified(root, path);
    try {
      if (fstatSync(fd).size > maxBytes) {
        throw new Error("会話の記録が大きすぎて読めませんでした");
      }
      return render(path, humanMessages(readFileSync(fd, "utf8")));
    } finally {
      closeSync(fd);
    }
  } catch {
    throw new Error("会話の記録を読めませんでした");
  }
}

// parseArgs は wakaranai と rules-distill の CLI と同じ --key value 形。
function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--") || i + 1 >= argv.length) throw new Error(`bad argument: ${key}`);
    o[key.slice(2)] = argv[i + 1];
    i += 1;
  }
  return o;
}

// 同名の別ファイルでの誤発火を避ける。argv[1] の末尾一致は使わない。
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const args = parseArgs(process.argv.slice(2));
    for (const key of Object.keys(args)) {
      if (key !== "file") throw new Error(`知らない引数: --${key}`);
    }
    process.stdout.write(run({ file: args.file }));
  } catch {
    // 例外の文面 (readFileSync の ENOENT のパスなど) をそのまま出さない。
    // パスや権限の情報が平文として流れるため、簡潔な文面に絞る。
    process.stderr.write("会話の記録の平文化に失敗しました\n");
    process.exit(2);
  }
}
