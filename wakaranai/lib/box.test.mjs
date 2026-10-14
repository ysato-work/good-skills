import {test} from 'node:test';
import assert from 'node:assert/strict';
import {characterWidth, displayWidth, renderDocument, STYLES} from './box.mjs';

test('字の幅は Unicode の区分で決まる', () => {
	assert.equal(characterWidth('a'), 1);
	assert.equal(characterWidth(' '), 1);
	assert.equal(characterWidth('あ'), 2);
	assert.equal(characterWidth('漢'), 2);
	assert.equal(characterWidth('✅'), 2);
	assert.equal(characterWidth('①'), undefined, '丸数字は曖昧幅。strict では弾く');
	assert.equal(characterWidth('🏷'), undefined, 'Neutral はどちらのモードでも弾く');
	assert.equal(characterWidth('╔'), undefined, '罫線の記号は曖昧幅。strict では弾く');
});

test('ambiguous モードでは曖昧幅を 1 桁として通す', () => {
	assert.equal(characterWidth('①', 'ambiguous'), 1);
	assert.equal(characterWidth('╔', 'ambiguous'), 1);
	assert.equal(characterWidth('←', 'ambiguous'), 1);
	assert.equal(characterWidth('あ', 'ambiguous'), 2, 'Wide は変わらない');
	assert.equal(characterWidth('🏷', 'ambiguous'), undefined, 'Neutral は通さない');
	assert.equal(characterWidth('🌬', 'ambiguous'), undefined, 'Neutral は通さない');
});

test('端末まかせの字を幅として数えようとすると止まる', () => {
	assert.throws(() => displayWidth('①'), /端末によって幅が変わる字/);
	assert.equal(displayWidth('①', 'ambiguous'), 1);
});

test('混ざった文字列の幅を足し上げる', () => {
	assert.equal(displayWidth('ab'), 2);
	assert.equal(displayWidth('あい'), 4);
	assert.equal(displayWidth('aあ'), 3);
});

test('罫線の字の表が 4 種類ある', () => {
	assert.deepEqual(Object.keys(STYLES).sort(), ['ascii', 'double', 'heavy', 'light']);
	for (const [name, style] of Object.entries(STYLES)) {
		for (const key of ['tl', 'tm', 'tr', 'ml', 'mm', 'mr', 'bl', 'bm', 'br', 'bandTl', 'bandTr', 'h', 'v', 'band', 'branch', 'last', 'cont']) {
			assert.equal(typeof style[key], 'string', `${name} の ${key} が無い`);
			assert.notEqual(style[key], '', `${name} の ${key} が空`);
		}
	}
});

test('罫線 4 種類それぞれで、箱の右端がそろう', () => {
	for (const line of Object.keys(STYLES)) {
		const mode = line === 'ascii' ? 'strict' : 'ambiguous';
		const lines = renderDocument({blocks: [{box: [{lines: ['日本語 🧹', 'ascii only', '✅ ❌ 🤖']}]}]}, {mode, line});
		const widths = new Set(lines.map(text => displayWidth(text, mode)));
		assert.equal(widths.size, 1, `${line}: そろっていない桁 ${[...widths].join(', ')}`);
		assert.equal([...lines[0]][0], STYLES[line].tl, `${line}: 左上の角が違う`);
		assert.equal([...lines[0]].at(-1), STYLES[line].tr, `${line}: 右上の角が違う`);
	}
});

test('strict では、罫線に ascii 以外を指定しても ascii に落ちる', () => {
	const lines = renderDocument({blocks: [{box: [{lines: ['あ']}]}], line: 'light'}, {mode: 'strict'});
	assert.match(lines[0], /^\+-+\+$/);
});

test('入れ子と横並びでもそろう', () => {
	const lines = renderDocument({blocks: [{box: [{lines: ['外']}, {box: [{lines: ['内 🟢']}]}]}]}, {mode: 'ambiguous'});
	assert.equal(new Set(lines.map(text => displayWidth(text, 'ambiguous'))).size, 1);

	const row = renderDocument({blocks: [{row: [{lines: ['あいう']}, {lines: ['x'], align: 'middle'}]}]}, {mode: 'ambiguous'});
	assert.equal(row.length, 1);
	assert.match(row[0], /^あいう\s+x$/);
});

test('枠なしで束ねられる', () => {
	const lines = renderDocument({blocks: [{stack: [{lines: ['あ']}, {lines: ['い']}]}]}, {mode: 'ambiguous'});
	assert.deepEqual(lines, ['あ', 'い'], '空行が入らない');
});

test('横並びの中に、枠なしで 2 つ積める', () => {
	const lines = renderDocument({blocks: [{row: [
		{box: [{lines: ['左']}]},
		{stack: [{box: [{lines: ['右上']}]}, {box: [{lines: ['右下']}]}]},
	]}], gap: 1}, {mode: 'ambiguous'});
	const widths = new Set(lines.map(text => displayWidth(text, 'ambiguous')));
	assert.equal(widths.size, 1, `そろっていない桁 ${[...widths].join(', ')}`);
	assert.equal(lines.length, 6, '左の箱は 3 行。右は 2 つの箱で 6 行。横並びの高さは 6 行になる');
});

test('箱の中に横の仕切り線が引ける', () => {
	const lines = renderDocument({blocks: [{box: [{lines: ['見出し']}, {rule: true}, {lines: ['中身']}]}]}, {mode: 'ambiguous'});
	assert.equal(new Set(lines.map(text => displayWidth(text, 'ambiguous'))).size, 1);
	assert.equal(lines[2], '├────────┤', '仕切り線が箱の幅いっぱいに引かれる');
});

test('rule を box の外で使うと止まる', () => {
	assert.throws(
		() => renderDocument({blocks: [{rule: true}]}, {mode: 'ambiguous'}),
		/rule は box の中だけで使えます/,
	);
});

test('表が組める。列の幅が全行でそろう', () => {
	const lines = renderDocument({blocks: [{table: {
		head: ['げんいん', 'かくにん', 'なおしかた'],
		rows: [['とびらの すきま', '紙を はさむ', 'ゴムを みる'], ['ほこり', 'うしろ', 'そうじ']],
	}}]}, {mode: 'ambiguous'});
	assert.equal(new Set(lines.map(text => displayWidth(text, 'ambiguous'))).size, 1);
	assert.equal(lines.length, 6, '上辺 + 見出し + 仕切り + 2 行 + 下辺');
	assert.match(lines[2], /^├─+┼─+┼─+┤$/);
});

test('表の罫線も種類を選べる', () => {
	const lines = renderDocument({blocks: [{table: {head: ['あ'], rows: [['い']]}}], line: 'light'}, {mode: 'ambiguous'});
	// 「あ」は幅 2 なので、列の幅は 2。罫線は 2 + 2 = 4 本になる。
	assert.equal(lines[0], '┌────┐');
	assert.equal(lines[1], '│ あ │');
	assert.equal(lines[2], '├────┤');
	assert.equal(lines[3], '│ い │');
	assert.equal(lines[4], '└────┘');
});

test('箱の中に表を入れられる', () => {
	const lines = renderDocument({blocks: [{box: [{table: {head: ['あ'], rows: [['い']]}}]}]}, {mode: 'ambiguous'});
	assert.equal(new Set(lines.map(text => displayWidth(text, 'ambiguous'))).size, 1);
});

test('字下げの木が組める', () => {
	const lines = renderDocument({blocks: [{
		tree: {label: '社長', children: [
			{label: '開発部長', children: [{label: '佐藤'}, {label: '鈴木'}]},
			{label: '経理部長'},
		]},
		style: 'indent',
	}], line: 'light'}, {mode: 'ambiguous'});
	assert.deepEqual(lines, [
		'社長',
		'├─ 開発部長',
		'│  ├─ 佐藤',
		'│  └─ 鈴木',
		'└─ 経理部長',
	]);
});

test('strict では、字下げの木の枝も ASCII になる', () => {
	const lines = renderDocument({blocks: [{
		tree: {label: '社長', children: [{label: '開発部長'}, {label: '経理部長'}]},
		style: 'indent',
	}]}, {mode: 'strict'});
	assert.deepEqual(lines, ['社長', '+-- 開発部長', '+-- 経理部長']);
});

test('箱つきの木が組める。親の柱と子の取っ手の列が合う', () => {
	const lines = renderDocument({blocks: [{
		tree: {label: '社長', children: [
			{label: '開発'},
			{label: '営業'},
			{label: '経理'},
		]},
		style: 'box',
	}], line: 'light'}, {mode: 'ambiguous'});
	assert.deepEqual(lines.map(text => text.trimEnd()), [
		'           ┌──────┐',
		'           │ 社長 │',
		'           └──┬───┘',
		'              │',
		'   ┌──────────┼──────────┐',
		'   │          │          │',
		'┌──┴───┐   ┌──┴───┐   ┌──┴───┐',
		'│ 開発 │   │ 営業 │   │ 経理 │',
		'└──────┘   └──────┘   └──────┘',
	]);
	assert.equal(new Set(lines.map(text => displayWidth(text, 'ambiguous'))).size, 1);
});

test('箱つきの木は、子が 1 つでも組める', () => {
	const lines = renderDocument({blocks: [{
		tree: {label: '親', children: [{label: '子'}]},
		style: 'box',
	}], line: 'light'}, {mode: 'ambiguous'});
	assert.equal(new Set(lines.map(text => displayWidth(text, 'ambiguous'))).size, 1);
	assert.equal(lines.some(text => text.includes('子')), true);
});

test('箱つきの木で、上にも下にも枝を出せる', () => {
	const lines = renderDocument({blocks: [{
		tree: {
			label: '親',
			above: [{label: '兄'}, {label: '姉'}],
			below: [{label: 'A'}, {label: 'B'}, {label: 'C'}],
		},
		style: 'box',
	}], line: 'light'}, {mode: 'ambiguous'});
	assert.deepEqual(lines.map(text => text.trimEnd()), [
		'   ┌────┐   ┌────┐',
		'   │ 兄 │   │ 姉 │',
		'   └─┬──┘   └─┬──┘',
		'     │        │',
		'     └────┼───┘',
		'          │',
		'        ┌─┴──┐',
		'        │ 親 │',
		'        └─┬──┘',
		'          │',
		'  ┌───────┼───────┐',
		'  │       │       │',
		'┌─┴─┐   ┌─┴─┐   ┌─┴─┐',
		'│ A │   │ B │   │ C │',
		'└───┘   └───┘   └───┘',
	]);
	assert.equal(new Set(lines.map(text => displayWidth(text, 'ambiguous'))).size, 1);
});

test('children は below と同じ。上の枝だけでも組める', () => {
	const withChildren = renderDocument({blocks: [{tree: {label: '親', children: [{label: '子'}]}, style: 'box'}], line: 'light'}, {mode: 'ambiguous'});
	const withBelow = renderDocument({blocks: [{tree: {label: '親', below: [{label: '子'}]}, style: 'box'}], line: 'light'}, {mode: 'ambiguous'});
	assert.deepEqual(withChildren, withBelow);

	const onlyAbove = renderDocument({blocks: [{tree: {label: '親', above: [{label: '子'}]}, style: 'box'}], line: 'light'}, {mode: 'ambiguous'});
	assert.equal(new Set(onlyAbove.map(text => displayWidth(text, 'ambiguous'))).size, 1);
	assert.equal(onlyAbove.some(text => text.includes('子')), true);
	assert.equal(onlyAbove.some(text => text.includes('親')), true);
});

test('囲んだまとまりの下に、戻り線が引ける', () => {
	const lines = renderDocument({blocks: [{
		loop: {
			blocks: [{box: [{lines: ['甲']}]}, {box: [{lines: ['乙']}]}, {box: [{lines: ['丙']}]}],
			back: 2,
			label: '戻る',
		},
	}], line: 'light'}, {mode: 'ambiguous'});
	assert.deepEqual(lines.map(text => text.trimEnd()), [
		'┌────┐   ┌────┐   ┌────┐',
		'│ 甲 │ → │ 乙 │ → │ 丙 │',
		'└────┘   └────┘   └────┘',
		'           ↑        │',
		'           └────────┘',
		'              戻る',
	]);
	assert.equal(new Set(lines.map(text => displayWidth(text, 'ambiguous'))).size, 1);
});

test('strict では、戻り線の矢印も ASCII になる', () => {
	const lines = renderDocument({blocks: [{
		loop: {blocks: [{box: [{lines: ['あ']}]}, {box: [{lines: ['い']}]}], back: 1},
	}]}, {mode: 'strict'});
	assert.equal(lines[1].includes('->'), true);
	assert.equal(lines[3].includes('^'), true);
	assert.equal(lines[1].includes('→'), false);
});

test('見出しの帯は、上の線だけ太く、角もその太さに合わせる', () => {
	const expected = {
		light: ['╒════════╕', '│ 見出し │', '└────────┘'],
		heavy: ['┏━━━━━━━━┓', '┃ 見出し ┃', '┗━━━━━━━━┛'],
		double: ['╔════════╗', '║ 見出し ║', '╚════════╝'],
		ascii: ['+========+', '| 見出し |', '+--------+'],
	};
	for (const [line, want] of Object.entries(expected)) {
		const lines = renderDocument({blocks: [{bar: '見出し'}], line}, {mode: 'ambiguous'});
		assert.deepEqual(lines, want, `${line}: ${lines.join(' / ')}`);
	}
});

test('木の "style" が無いと止まる', () => {
	assert.throws(
		() => renderDocument({blocks: [{tree: {label: '親', children: [{label: '子'}]}}], line: 'light'}, {mode: 'ambiguous'}),
		/木の見た目が分かりません/,
	);
});

test('木の "style" が indent でも box でもないと止まる', () => {
	assert.throws(
		() => renderDocument({blocks: [{tree: {label: '親', children: [{label: '子'}]}, style: 'boxed'}], line: 'light'}, {mode: 'ambiguous'}),
		/木の見た目が分かりません/,
	);
});

test('入れ子の木で、下の子が above を持つと止まる', () => {
	assert.throws(
		() => renderDocument({blocks: [{
			tree: {label: '親', children: [{label: '子A', above: [{label: '兄1'}, {label: '兄2'}]}]},
			style: 'box',
		}], line: 'light'}, {mode: 'ambiguous'}),
		/木を入れ子にすると、線がつながりません/,
	);
});

test('入れ子の木で、上の子が below を持つと止まる', () => {
	assert.throws(
		() => renderDocument({blocks: [{
			tree: {label: '親', above: [{label: '兄', below: [{label: '孫'}]}]},
			style: 'box',
		}], line: 'light'}, {mode: 'ambiguous'}),
		/木を入れ子にすると、線がつながりません/,
	);
});

test('入れ子の木で、上の子が children を持つと止まる', () => {
	assert.throws(
		() => renderDocument({blocks: [{
			tree: {label: '親', above: [{label: '兄', children: [{label: '孫'}]}]},
			style: 'box',
		}], line: 'light'}, {mode: 'ambiguous'}),
		/木を入れ子にすると、線がつながりません/,
	);
});

test('loop のラベルが長すぎると止まる', () => {
	assert.throws(
		() => renderDocument({blocks: [{
			loop: {
				blocks: [{box: [{lines: ['甲']}]}, {box: [{lines: ['乙']}]}],
				back: 1,
				label: '最初からやり直す',
			},
		}], line: 'light'}, {mode: 'ambiguous'}),
		/戻り線のラベルが長すぎます/,
	);
});

test('loop のラベルが図全体の幅を超えると止まる', () => {
	assert.throws(
		() => renderDocument({blocks: [{
			loop: {
				blocks: [{box: [{lines: ['甲']}]}, {box: [{lines: ['乙']}]}],
				back: 1,
				label: 'とてもとても長いラベルのための十文字のせりふ',
			},
		}], line: 'light'}, {mode: 'ambiguous'}),
		/戻り線のラベルが長すぎます/,
	);
});

test('loop の back がいちばん右のブロックと同じだと止まる', () => {
	assert.throws(
		() => renderDocument({blocks: [{
			loop: {
				blocks: [{box: [{lines: ['甲']}]}, {box: [{lines: ['乙']}]}],
				back: 2,
				label: '戻る',
			},
		}], line: 'light'}, {mode: 'ambiguous'}),
		/戻り線の戻り先が、いちばん右のブロックと同じです/,
	);
});

test('表の行のセル数が見出しと違うと止まる', () => {
	assert.throws(
		() => renderDocument({blocks: [{table: {head: ['A', 'B'], rows: [['い']]}}]}, {mode: 'ambiguous'}),
		/表の列の数がそろっていません。見出しは 2 列ですが、1 行目は 1 列です/,
	);
	assert.throws(
		() => renderDocument({blocks: [{table: {head: ['A', 'B'], rows: [['い', 'ろ'], ['は']]}}]}, {mode: 'ambiguous'}),
		/2 行目は 1 列です/,
	);
});

test('木の枝を文字だけの並びで書くと止まる。文言に tree と label が入る', () => {
	assert.throws(
		() => renderDocument({blocks: [{tree: {label: '親', children: ['兄', '弟']}, style: 'box'}], line: 'light'}, {mode: 'ambiguous'}),
		/tree/,
	);
});

test('bar を並びで書くと止まる。文言に bar が入る', () => {
	assert.throws(
		() => renderDocument({blocks: [{bar: ['見出し']}], line: 'light'}, {mode: 'ambiguous'}),
		/bar/,
	);
});

test('lines の要素が文字の並びでないと止まる', () => {
	assert.throws(
		() => renderDocument({blocks: [{lines: ['あ', 3]}], line: 'light'}, {mode: 'ambiguous'}),
		/lines/,
	);
	assert.throws(
		() => renderDocument({blocks: [{lines: 'あ'}], line: 'light'}, {mode: 'ambiguous'}),
		/lines/,
	);
});

test('table の rows の中身が文字の並びでないと止まる。rows が無くても日本語で止まる', () => {
	assert.throws(
		() => renderDocument({blocks: [{table: {head: ['あ'], rows: [['い'], [3]]}}], line: 'light'}, {mode: 'ambiguous'}),
		/table/,
	);
	assert.throws(
		() => renderDocument({blocks: [{table: {head: ['あ']}}], line: 'light'}, {mode: 'ambiguous'}),
		/table/,
	);
});

test('loop の label が文字でないと止まる', () => {
	assert.throws(
		() => renderDocument({blocks: [{loop: {blocks: [{box: [{lines: ['甲']}]}], back: 1, label: ['戻る']}}], line: 'light'}, {mode: 'ambiguous'}),
		/loop/,
	);
});

test('正しい形は今までどおり組める', () => {
	const lines = renderDocument({
		blocks: [
			{bar: '見出し'},
			{tree: {label: '親', children: [{label: '子'}]}, style: 'box'},
			{table: {head: ['あ'], rows: [['い']]}},
		],
		line: 'light',
	}, {mode: 'ambiguous'});
	assert.equal(lines[0], '╒════════╕', 'bar に文字 1 つを書く形');
	assert.equal(lines.some(text => text.includes('│ 子 │')), true);
	assert.equal(lines.at(-2), '│ い │', 'table のセル');
});

test('戻り先の番号が範囲の外なら止まる', () => {
	assert.throws(
		() => renderDocument({blocks: [{loop: {blocks: [{lines: ['あ']}], back: 3}}]}, {mode: 'ambiguous'}),
		/戻り先の番号/,
	);
});

const renderRow = (row, extra = {}, options = {mode: 'ambiguous', line: 'light'}) =>
	renderDocument({blocks: [{row, ...extra}]}, options);
const part = (...lines) => ({lines});

test('row の部品は既定で縦の真ん中に寄る。箱と矢印なら、矢印は箱の中身の行に当たる', () => {
	assert.deepEqual(renderRow([{box: [part('A', 'B', 'C')]}, part('->')]), [
		'┌───┐', '│ A │', '│ B │   ->', '│ C │', '└───┘',
	]);
	assert.deepEqual(renderRow([{box: [part('A')]}, part('->')]), ['┌───┐', '│ A │   ->', '└───┘']);
});

test('高さの差が偶数でも奇数でも、上に足す空行は差の半分の切り捨て', () => {
	assert.deepEqual(renderRow([part('a', 'b', 'c', 'd', 'e'), part('X')]), ['a', 'b', 'c   X', 'd', 'e'], '差 4');
	assert.deepEqual(renderRow([part('a', 'b', 'c', 'd'), part('X')]), ['a', 'b   X', 'c', 'd'], '差 3');
	assert.deepEqual(renderRow([part('a', 'b'), part('X')]), ['a   X', 'b'], '差 1');
	assert.deepEqual(renderRow([part('a', 'b', 'c', 'd', 'e'), part('X', 'Y')]), ['a', 'b   X', 'c   Y', 'd', 'e'], '差 3 で 2 行の部品');
});

test('高さが同じなら空行は足さない。部品が 1 つだけでも変わらない', () => {
	assert.deepEqual(renderRow([part('a', 'b'), part('X', 'Y')]), ['a   X', 'b   Y']);
	assert.deepEqual(renderRow([part('a', 'b')]), ['a', 'b']);
});

test('いちばん背の高い部品が先頭でなくても、それを基準に寄る', () => {
	assert.deepEqual(renderRow([part('X'), part('a', 'b', 'c', 'd', 'e')]), ['    a', '    b', 'X   c', '    d', '    e']);
});

test('align: top は上揃え', () => {
	assert.deepEqual(renderRow([part('a', 'b', 'c', 'd', 'e'), {lines: ['X'], align: 'top'}]), ['a   X', 'b', 'c', 'd', 'e']);
	assert.deepEqual(renderRow([{lines: ['a', 'b', 'c'], align: 'top'}, {lines: ['X'], align: 'top'}]), ['a   X', 'b', 'c'], '全部 top');
});

test('align: middle を明示しても既定と同じ', () => {
	assert.deepEqual(renderRow([part('a', 'b', 'c', 'd', 'e'), {lines: ['X'], align: 'middle'}]), ['a', 'b', 'c   X', 'd', 'e']);
});

test('top と既定の部品を混ぜられる', () => {
	assert.deepEqual(renderRow([part('a', 'b', 'c', 'd', 'e'), {lines: ['X'], align: 'top'}, part('p', 'q', 'r')]), [
		'a   X', 'b       p', 'c       q', 'd       r', 'e',
	]);
	assert.deepEqual(renderRow([{box: [part('A', 'B', 'C')]}, part('->'), {box: [part('D')], align: 'top'}]), [
		'┌───┐        ┌───┐', '│ A │        │ D │', '│ B │   ->   └───┘', '│ C │', '└───┘',
	]);
});

test('gap の既定は 3。gap を指定しても align は効く', () => {
	assert.deepEqual(renderRow([part('a'), part('b')]), ['a   b']);
	assert.deepEqual(renderRow([part('a', 'b', 'c'), part('X')], {gap: 1}), ['a', 'b X', 'c']);
});

test('strict でも箱と矢印の位置は同じ', () => {
	assert.deepEqual(renderRow([{box: [part('A', 'B', 'C')]}, part('->')], {}, {mode: 'strict'}), [
		'+---+', '| A |', '| B |   ->', '| C |', '+---+',
	]);
});

test('row の中の row は外の row の部品なので align を書ける。内側の中も真ん中揃い', () => {
	assert.deepEqual(renderRow([{row: [part('a', 'b', 'c'), part('X')]}, part('Y')]), ['a', 'b   X   Y', 'c']);
	assert.deepEqual(renderRow([part('a', 'b', 'c'), {row: [part('x'), part('y')], align: 'top'}]), ['a   x   y', 'b', 'c']);
});

const badValues = [['"bottom"', 'bottom'], ['数値', 1], ['"center"', 'center'], ['大文字 "Top"', 'Top'], ['空文字', ''], ['真偽値', true], ['配列', ['top']], ['null', null]];

for (const [name, value] of badValues) {
	test(`align に ${name} を書くと、書ける値を日本語で示して止まる`, () => {
		assert.throws(() => renderRow([{lines: ['a'], align: value}]), /"top".*"middle"/);
	});
}

test('複数の部品のうち後ろだけ align が不正でも止まる', () => {
	assert.throws(() => renderRow([part('a'), {lines: ['b'], align: 'top'}, {lines: ['c'], align: 'bottom'}]), /"top".*"middle"/);
});

const misplaced = {
	'row そのものに top': {blocks: [{row: [part('a'), part('b')], align: 'top'}]},
	'row そのものに middle': {blocks: [{row: [part('a'), part('b')], align: 'middle'}]},
	'row そのものに不正な値': {blocks: [{row: [part('a')], align: 'bottom'}]},
	'box の中の row そのもの': {blocks: [{box: [{row: [part('a')], align: 'top'}]}]},
	'一番外の blocks 直下の部品': {blocks: [{lines: ['a'], align: 'top'}]},
	'一番外の blocks 直下の box': {blocks: [{box: [part('a')], align: 'top'}]},
	'box の中の部品': {blocks: [{box: [{lines: ['a'], align: 'top'}]}]},
	'stack の中の部品': {blocks: [{stack: [{lines: ['a'], align: 'top'}]}]},
	'loop の中の部品': {blocks: [{loop: {blocks: [part('a', 'b', 'c'), {lines: ['x'], align: 'top'}], back: 1}}]},
};

for (const [name, document] of Object.entries(misplaced)) {
	test(`row の直下でない場所（${name}）に align を書くと、描画前に止まる`, () => {
		assert.throws(() => renderDocument(document, {mode: 'ambiguous'}), /row の中の部品にだけ/);
	});
}

test('深い入れ子の奥の row の部品に不正な値があっても、描画前に止まる', () => {
	assert.throws(() => renderDocument({blocks: [{box: [{row: [{lines: ['a'], align: 'bottom'}]}]}]}), /"top".*"middle"/, 'box の中の row');
	assert.throws(() => renderDocument({blocks: [{loop: {blocks: [{row: [{lines: ['a'], align: 'bottom'}]}, part('b')], back: 1}}]}), /"top".*"middle"/, 'loop の中の row');
});
