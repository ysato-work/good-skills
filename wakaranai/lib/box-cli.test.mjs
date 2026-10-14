import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const script = join(dirname(fileURLToPath(import.meta.url)), 'box.mjs');
const run = (input, args = []) => execFileSync('node', [script, ...args], {input, encoding: 'utf8'});
const runFail = (input, args = []) => {
	try {
		run(input, args);
	} catch (error) {
		return error;
	}

	throw new Error('止まるはずが止まらなかった');
};

test('木の "style" を省くと止まる', () => {
	const error = runFail(JSON.stringify({blocks: [{tree: {label: '親', children: [{label: '子'}]}}]}));
	assert.equal(error.status, 1);
	assert.equal(error.stderr.includes('木の見た目が分かりません'), true);
});

test('JSON が壊れていれば、日本語の 1 行で止まる', () => {
	const error = runFail('{blocks: [');
	assert.equal(error.status, 1);
	assert.equal(error.stderr.split('\n').some(line => line.includes('入力の JSON を読めませんでした:')), true);
	assert.equal(/\n\s+at /.test(error.stderr), false, 'スタックトレースを出さない');
});

test('ファイルが無ければ、日本語の 1 行で止まる', () => {
	const error = runFail('', ['no-such-file.json']);
	assert.equal(error.status, 1);
	assert.equal(error.stderr.includes('入力の JSON を読めませんでした:'), true);
});

test('JSON が null なら、入力の形を案内して止まる', () => {
	const error = runFail('null');
	assert.equal(error.status, 1);
	assert.equal(error.stderr.includes('入力の形が分かりません。{"blocks": [...]} の形にしてください。'), true);
});

test('罫線の名前が違えば止まる', () => {
	const error = runFail(JSON.stringify({blocks: [{box: [{lines: ['あ']}], line: 'dotted'}]}));
	assert.equal(error.status, 1);
	assert.equal(error.stderr.includes('罫線の種類が分かりません: dotted'), true);
	assert.equal(error.stderr.includes('ascii / light / heavy / double'), true);
});

test('rule を row の中に置いても、正しいメッセージで止まる', () => {
	const error = runFail(JSON.stringify({blocks: [{row: [{rule: true}, {lines: ['あ']}]}]}));
	assert.equal(error.status, 1);
	assert.equal(error.stderr.includes('rule は box の中だけで使えます。'), true);
});

test('木の枝を文字で書いた JSON は、日本語の 1 行で止まる', () => {
	const error = runFail(JSON.stringify({blocks: [{tree: {label: '親', children: ['兄', '弟']}, style: 'box'}]}));
	assert.equal(error.status, 1);
	assert.equal(error.stderr.includes('TypeError'), false, '生の TypeError を出さない');
	assert.equal(error.stderr.includes('tree'), true);
});

test('blocks が並びでなければ、日本語の 1 行で止まる', () => {
	const first = runFail(JSON.stringify({blocks: 5}));
	assert.equal(first.status, 1);
	assert.equal(first.stderr.includes('TypeError'), false, '生の TypeError を出さない');
	assert.equal(first.stderr.includes('{"blocks": [...]}'), true);

	const second = runFail(JSON.stringify({blocks: {lines: ['x']}}));
	assert.equal(second.status, 1);
	assert.equal(second.stderr.includes('TypeError'), false);
});

test('row の gap が 0 以上の整数でなければ止まる', () => {
	const error = runFail(JSON.stringify({blocks: [{row: [{lines: ['あ']}, {lines: ['い']}], gap: '幅'}]}));
	assert.equal(error.status, 1);
	assert.equal(error.stderr.includes('gap'), true);
});

test('gap を省いた row は今までどおり組める', () => {
	const out = run(JSON.stringify({blocks: [{row: [{lines: ['あ']}, {lines: ['い']}]}]}));
	assert.equal(out.trimEnd().split('\n').length, 1, '1 行の横並び');
});

test('標準入力の JSON から図を出す', () => {
	const out = run(JSON.stringify({blocks: [{box: [{lines: ['日本語 🧹', 'ascii']}]}]}));
	const lines = out.trimEnd().split('\n');
	assert.equal(lines.length, 4);
	assert.equal(lines[1].includes('日本語 🧹'), true);
	assert.match(lines[0], /^┌─+┐$/, '既定の罫線は light');
});

test('既定では、曖昧幅の字は通る', () => {
	const out = run(JSON.stringify({blocks: [{lines: ['① と →']}]}));
	assert.equal(out.trimEnd(), '① と →');
});

test('strict では、端末まかせの字を挙げて止まる', () => {
	assert.throws(
		() => run(JSON.stringify({blocks: [{lines: ['① と → と 🏷']}]}), ['--mode=strict']),
		error => error.status === 1
			&& error.stderr.includes('U+2460')
			&& error.stderr.includes('U+2192')
			&& error.stderr.includes('U+1F3F7'),
	);
});

test('ambiguous でも Neutral の字は止まる', () => {
	assert.throws(
		() => run(JSON.stringify({blocks: [{lines: ['① と 🏷']}]})),
		error => error.status === 1
			&& error.stderr.includes('U+1F3F7')
			&& !error.stderr.includes('U+2460'),
	);
});

test('モードの指定が分からなければ止まる', () => {
	assert.throws(
		() => run(JSON.stringify({blocks: [{lines: ['あ']}]}), ['--mode=loose']),
		error => error.status === 1,
	);
});

test('引数のファイルから読める', () => {
	const path = join(mkdtempSync(join(tmpdir(), 'box-cli-')), 'in.json');
	writeFileSync(path, JSON.stringify({blocks: [{box: [{lines: ['あ']}]}], line: 'ascii'}));
	const out = execFileSync('node', [script, path], {encoding: 'utf8'});
	assert.equal(out.trimEnd(), '+----+\n| あ |\n+----+');
});

test('row の中の部品の align が不正なら、日本語で止まる。標準出力は空', () => {
	const error = runFail(JSON.stringify({blocks: [{row: [{lines: ['a'], align: 'bottom'}]}]}));
	assert.equal(error.status, 1);
	assert.equal(error.stderr.includes('"top"'), true);
	assert.equal(error.stdout, '');
});
