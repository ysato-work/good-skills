/**
 * constants.mjs
 *
 * 調整する定数の唯一の定義箇所。
 *
 * どれも根拠のある数値ではなく初期値である。実際に走らせないと適正値が分からない。
 * 数値を各モジュールや spec 本文に散らすと、調整のたびに複数箇所を書き直す羽目に
 * なるので、ここだけを直せば全体に効くようにしてある。
 *
 * 定数どうしの関係（閾値は 50 超、連続ブロックは 8 未満）は constants.test.mjs が
 * 機械的に守る。値を動かすときはテストも一緒に見ること。
 */

/** ログ 1 ファイルの上限。超えたら先頭と末尾を残して中間を省略する */
export const LOG_FILE_MAX_BYTES = 64 * 1024;

/** 省略するとき、先頭と末尾にそれぞれ残すバイト数 */
export const LOG_FILE_KEEP_BYTES = 32 * 1024;

/** 1 ケースのログ合計上限。超えたら以降のログを記録しない */
export const CASE_LOG_TOTAL_MAX_BYTES = 256 * 1024;

/** 同じケースの試行上限。超えたら error に落としてループを止める */
export const MAX_ATTEMPTS = 3;

/** S3 のレビュー合議の周回上限 */
export const REVIEW_MAX_ROUNDS = 2;

/** S3 の足切り閾値。採点が落ちたときの 50 埋めが素通りしないよう 50 より大きくする */
export const CONFIDENCE_THRESHOLD = 70;

/** S5 が自主停止するまでに許容する「前進 0」のターン数 */
export const NO_PROGRESS_MAX_TURNS = 3;

/** S5 の連続ブロック上限。8 に達すると Claude Code 側に上書きされるので必ず 8 未満 */
export const MAX_CONSECUTIVE_BLOCKS = 6;
