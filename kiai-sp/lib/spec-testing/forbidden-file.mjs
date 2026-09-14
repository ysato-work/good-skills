/**
 * forbidden-file.mjs
 *
 * Edit / Write で触ってはいけないファイルと、書いてはいけない内容を判定する。
 * 純関数だけを持ち、ファイルには触らない。
 *
 * 中心は「落ちるテストを緑にする細工」の禁止である。追加したテストが落ちたら落ちた
 * まま残す。スキップ指定、除外設定、アサーションの削除、テストの削除はどれも
 * 「テストを追加した」ではなく「テストを追加したフリをした」であり、無人実行では
 * 誰も気づけない。落ちているテストを含む PR はマージできない状態であるべきで、
 * そこから直すのは人間の仕事である。
 *
 * アサーションの数え上げは近似である。2 つのアサーションを 1 つにまとめる正当な
 * リファクタリングも止まる。無人実行では、見逃すより止めすぎるほうがましなので
 * この精度で採る。止まったら人間が判断する。
 *
 * 件数が減らない書き換えも別に見る。期待値を実際の（誤った）出力に合わせて
 * 書き換える細工は、アサーションの件数を変えない。呼び出しの構造は同じまま
 * 埋め込まれたリテラルだけが変わるので、構造をリテラル抜きで揃えて突き合わせる。
 *
 * ガード自身の実装・設定ファイル（kiai-sp/lib/spec-testing/*.mjs や
 * kiai-sp/hooks/hooks.json、kiai-sp/hooks/testing-guard）への書き換えも同じ理由で
 * 止める。審査対象に審査機構自身が含まれていないと、無人実行のエージェントが
 * ガードの実装を直接書き換えて自分を無効化できてしまう。テストファイル
 * （*.test.mjs）はこの対象から除く。テストを書くこと自体を禁止すべきではないため。
 *
 * export:
 *   SKIP_MARKERS / ASSERTION_RE / TEST_FILE_RE
 *   isCiConfig(filePath) / isTestFile(filePath) / isGuardImplementationFile(filePath) /
 *   countAssertions(text)
 *   classifyFile({ filePath, oldString, newString, content }) → { blocked, ruleId, reason }
 */
import { CI_PATH } from "./forbidden-bash.mjs";

export const SKIP_MARKERS = [
  /\b(?:it|test|describe|context|suite)\.skip\s*\(/,
  /\bx(?:it|describe|test)\s*\(/,
  /@pytest\.mark\.(?:skip|skipif|xfail)/,
  /@(?:Ignore|Disabled)\b/,
  /\bt\.Skip(?:Now)?\s*\(/,
  /#\[ignore\]/,
  /\btestPathIgnorePatterns\b/,
  /\btestIgnore\b/,
  /\b(?:it|test|describe|context|suite)\.only\s*\(/,
  /(?<!\.)\bf(?:it|describe)\s*\(/,
];

export const ASSERTION_RE =
  /\b(?:assert\w*|expect|should)(?:\.\w+)*\s*\(|\brequire\.(?:Equal|NoError|Error|True|False)\s*\(/g;

export const TEST_FILE_RE =
  /(?:\.(?:test|spec)\.[a-z]+$|_test\.(?:go|py|rb)$|_spec\.rb$|(?:^|\/)test_[a-z0-9_]+\.py$|Test\.java$)/;

/** ガード自身の実装・設定ファイル。テストファイル (*.test.mjs) は対象外 */
const GUARD_IMPLEMENTATION_RE =
  /(?:^|\/)kiai-sp\/lib\/spec-testing\/(?!.*\.test\.mjs$)[^/]+\.mjs$|(?:^|\/)kiai-sp\/hooks\/hooks\.json$|(?:^|\/)kiai-sp\/hooks\/testing-guard$/;

export function isCiConfig(filePath) {
  return CI_PATH.test(`/${String(filePath).replace(/^\/+/, "")}`);
}

export function isTestFile(filePath) {
  return TEST_FILE_RE.test(String(filePath));
}

/** パス区切りを正規化してから、ガード自身の実装・設定ファイルかを判定する */
export function isGuardImplementationFile(filePath) {
  const normalized = String(filePath).replace(/\\/g, "/").replace(/^\/+/, "");
  return GUARD_IMPLEMENTATION_RE.test(normalized);
}

export function countAssertions(text) {
  return (String(text).match(ASSERTION_RE) ?? []).length;
}

/** アサーションを含む行だけを抜き出す。行単位で比べるので複数行の呼び出しは対象外 */
function assertionLines(text) {
  const lineRe = new RegExp(ASSERTION_RE.source);
  return String(text)
    .split(/\r?\n/)
    .filter((line) => lineRe.test(line));
}

/** 文字列・数値リテラルを潰して、アサーション行の「構造」だけを取り出す */
function assertionShape(line) {
  return line
    .replace(/"(?:[^"\\]|\\.)*"/g, "S")
    .replace(/'(?:[^'\\]|\\.)*'/g, "S")
    .replace(/`(?:[^`\\]|\\.)*`/g, "S")
    .replace(/-?\b\d+(?:\.\d+)?\b/g, "N")
    .trim();
}

/** 行がコメントアウトされているかを判定する */
function isCommentedOut(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("/*");
}

/**
 * 期待値を実際の出力に合わせて書き換える細工を検出する。
 *
 * この細工はアサーションの件数を変えない。呼び出しの形（構造）は同じまま、
 * 埋め込まれた数値や文字列リテラルだけが変わる。countAssertions の件数比較では
 * 拾えないので、行の構造をリテラル抜きで揃えて突き合わせる。
 */
function hasRewrittenAssertionValue(oldString, newString) {
  const oldByShape = new Map();
  for (const line of assertionLines(oldString)) {
    const shape = assertionShape(line);
    if (!oldByShape.has(shape)) oldByShape.set(shape, new Set());
    oldByShape.get(shape).add(line);
  }
  for (const line of assertionLines(newString)) {
    const variants = oldByShape.get(assertionShape(line));
    if (variants && !variants.has(line)) return true;
  }
  return false;
}

/**
 * アサーション行が消失（コメントアウト・メソッド反転など）していないかを検出する。
 *
 * oldStringの各アサーション行が、newStringの「コメントアウトされていない
 * アサーション行」に一字一句そのまま存在するかをチェックする。
 * コメントアウト、メソッド名の反転などが検出される。
 */
function hasVanishedAssertionLine(oldString, newString) {
  const oldLines = assertionLines(oldString);
  const newNonCommentedLines = assertionLines(newString).filter((line) => !isCommentedOut(line));
  const newNonCommentedSet = new Set(newNonCommentedLines);

  for (const oldLine of oldLines) {
    if (!newNonCommentedSet.has(oldLine)) {
      return true;
    }
  }
  return false;
}

export function classifyFile({ filePath = "", oldString = "", newString = "", content = "" }) {
  if (isGuardImplementationFile(filePath)) {
    return {
      blocked: true,
      ruleId: "guard-self-protect",
      reason: "ガード自身の実装・設定ファイルは変更しない",
    };
  }

  if (isCiConfig(filePath)) {
    return { blocked: true, ruleId: "ci-config", reason: "CI 設定ファイルは変更しない" };
  }

  const added = newString !== "" ? newString : content;
  const marker = SKIP_MARKERS.find((re) => re.test(added) && !re.test(oldString));
  if (marker) {
    return {
      blocked: true,
      ruleId: "add-skip",
      reason: "テストのスキップ指定や除外設定を足して緑にするのは禁止。落ちたまま残す",
    };
  }

  if (oldString !== "") {
    if (
      countAssertions(added) < countAssertions(oldString) ||
      hasRewrittenAssertionValue(oldString, added) ||
      hasVanishedAssertionLine(oldString, added)
    ) {
      return {
        blocked: true,
        ruleId: "weaken-assertion",
        reason: "アサーションを削ったり緩めたりして緑にするのは禁止",
      };
    }
  }

  if (isTestFile(filePath) && newString === "" && content === "") {
    return {
      blocked: true,
      ruleId: "empty-test-file",
      reason: "テストの中身を消して緑にするのは禁止",
    };
  }

  return { blocked: false };
}
