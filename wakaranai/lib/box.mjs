// 図を組む。日本語と絵文字の桁数を数えて、罫線の右端をそろえる。
// 幅の判定は取り込んだ get-east-asian-width に任せる（lib/east-asian-width/、MIT）。
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {eastAsianWidthType} from './east-asian-width/index.js';

// 罫線の字。ブロックごとに "line" で選ぶ。省くと文書全体の "line" を使う。
// branch / last / cont は、字下げの木で行の頭に付ける字。
export const STYLES = {
	ascii: {tl: '+', tm: '+', tr: '+', ml: '+', mm: '+', mr: '+', bl: '+', bm: '+', br: '+', bandTl: '+', bandTr: '+', h: '-', v: '|', band: '=', branch: '+-- ', last: '+-- ', cont: '|   '},
	light: {tl: '┌', tm: '┬', tr: '┐', ml: '├', mm: '┼', mr: '┤', bl: '└', bm: '┴', br: '┘', bandTl: '╒', bandTr: '╕', h: '─', v: '│', band: '═', branch: '├─ ', last: '└─ ', cont: '│  '},
	heavy: {tl: '┏', tm: '┳', tr: '┓', ml: '┣', mm: '╋', mr: '┫', bl: '┗', bm: '┻', br: '┛', bandTl: '┏', bandTr: '┓', h: '━', v: '┃', band: '━', branch: '┣━ ', last: '┗━ ', cont: '┃  '},
	double: {tl: '╔', tm: '╦', tr: '╗', ml: '╠', mm: '╬', mr: '╣', bl: '╚', bm: '╩', br: '╝', bandTl: '╔', bandTr: '╗', h: '═', v: '║', band: '═', branch: '╠═ ', last: '╚═ ', cont: '║  '},
};

// 幅が確定しない字を「決まらない」として返すか、1 桁と決め打ちするか。
export function characterWidth(character, mode = 'strict') {
	const type = eastAsianWidthType(character.codePointAt(0));
	if (type === 'wide' || type === 'fullwidth') {
		return 2;
	}

	if (type === 'narrow' || type === 'halfwidth') {
		return 1;
	}

	// Ambiguous は、端末が 1 桁と 2 桁のどちらで描くかを決めてよい字である。
	// Unicode の TR11 は、文脈が確かめられないなら 1 桁として扱えと言っている。
	// Neutral は、それでも幅を数える手立てが無い。異体字セレクタを付けるかどうかで変わるためである。
	if (mode === 'ambiguous' && type === 'ambiguous') {
		return 1;
	}

	return undefined;
}

export function displayWidth(text, mode = 'strict') {
	let total = 0;
	for (const character of text) {
		const width = characterWidth(character, mode);
		if (width === undefined) {
			throw new Error(`端末によって幅が変わる字: ${character} U+${character.codePointAt(0).toString(16).toUpperCase()}`);
		}

		total += width;
	}

	return total;
}

// 箱の中に引く横線の目印。行の文字列として持ち回り、枠を組むときに線に置き換える。
const RULE = '\u0001';

function createRenderer(mode, defaultLine) {
	const width = text => {
		// 幅を数える経路に目印が流れ込むのは、rule が box の外に置かれたとき。どこに置かれても同じ文言を出す。
		if (text === RULE) {
			throw new Error('rule は box の中だけで使えます。');
		}

		return displayWidth(text, mode);
	};
	const padRight = (text, columns) => text + ' '.repeat(Math.max(0, columns - width(text)));
	// 目印の行は幅を持たない。箱の内側の幅を決める計算から外す。
	const blockWidth = lines => lines.reduce((widest, line) => (line === RULE ? widest : Math.max(widest, width(line))), 0);

	function styleOf(block) {
		// strict では、罫線に ascii 以外を指定しても ascii に落とす。
		const name = mode === 'strict' ? 'ascii' : (block.line ?? defaultLine);
		const style = STYLES[name];
		if (style === undefined) {
			throw new Error(`罫線の種類が分かりません: ${name}。ascii / light / heavy / double のどれかにしてください。`);
		}

		return style;
	}

	// tl / tr は上の角。帯の上辺と角の太さを合わせるため bar だけが上書きする。
	function frame(lines, style, {top = style.h, bottom = style.h, tl = style.tl, tr = style.tr} = {}) {
		const inside = blockWidth(lines);
		return [
			`${tl}${top.repeat(inside + 2)}${tr}`,
			...lines.map(line => (line === RULE
				? `${style.ml}${style.h.repeat(inside + 2)}${style.mr}`
				: `${style.v} ${padRight(line, inside)} ${style.v}`)),
			`${style.bl}${bottom.repeat(inside + 2)}${style.br}`,
		];
	}

	// separate が真なら、ブロックとブロックの間に空行を入れる。
	// stack のブロックでは偽にする。横並びの中に 2 つ積むときに、空行が入ると崩れるためである。
	function stack(blocks, {separate}) {
		const lines = [];
		for (const block of blocks) {
			if (separate && lines.length > 0) {
				lines.push('');
			}

			lines.push(...renderBlock(block));
		}

		return lines;
	}

	function renderRow(blocks, gap) {
		const rendered = blocks.map(block => renderBlock(block));
		const height = Math.max(...rendered.map(lines => lines.length));
		// 既定は縦の真ん中。上に空行を足して高さをそろえる。"top" のブロックだけ上に付ける。
		const padded = rendered.map((lines, index) => {
			if (blocks[index].align === 'top') {
				return lines;
			}

			return [...Array(Math.floor((height - lines.length) / 2)).fill(''), ...lines];
		});
		const widths = padded.map(blockWidth);
		return Array.from({length: height}, (_, row) =>
			padded.map((lines, index) => padRight(lines[row] ?? '', widths[index])).join(' '.repeat(gap)).replace(/\s+$/, ''));
	}

	function renderTable(table, style) {
		table.rows.forEach((row, index) => {
			if (row.length !== table.head.length) {
				throw new Error(`表の列の数がそろっていません。見出しは ${table.head.length} 列ですが、${index + 1} 行目は ${row.length} 列です。`);
			}
		});
		const rows = [table.head, ...table.rows];
		const columns = table.head.map((_, index) => Math.max(...rows.map(row => width(row[index]))));
		const line = joiner => columns.map(column => style.h.repeat(column + 2)).join(joiner);
		const body = row => `${style.v} ${row.map((cell, index) => padRight(cell, columns[index])).join(` ${style.v} `)} ${style.v}`;

		return [
			`${style.tl}${line(style.tm)}${style.tr}`,
			body(table.head),
			`${style.ml}${line(style.mm)}${style.mr}`,
			...table.rows.map(body),
			`${style.bl}${line(style.bm)}${style.br}`,
		];
	}

	function renderIndentTree(node, head, childPrefix, style, lines) {
		lines.push(head + node.label);
		const children = node.children ?? [];
		children.forEach((child, index) => {
			const last = index === children.length - 1;
			renderIndentTree(child, childPrefix + (last ? style.last : style.branch), childPrefix + (last ? '   ' : style.cont), style, lines);
		});
		return lines;
	}

	// 罫線の字は幅 1 なので、文字の位置と列位置が一致する。上下の辺にだけ使う。
	function attach(border, column, character) {
		return [...border].map((one, index) => (index === column ? character : one)).join('');
	}

	// 親と子をつなぐ線を引く。上へ向かう枝と、下へ向かう枝で、線の順番と角の字が変わる。
	function mergeLines(centers, stemColumn, style, total, direction) {
		const first = centers[0];
		const last = centers.at(-1);
		const row = build => Array.from({length: total}, (_, column) => build(column)).join('').trimEnd();

		const stems = row(column => (centers.includes(column) ? style.v : ' '));
		const drop = row(column => (column === stemColumn ? style.v : ' '));
		if (first === last) {
			return [drop];
		}

		const [startCorner, endCorner] = direction === 'up' ? [style.bl, style.br] : [style.tl, style.tr];
		const middle = direction === 'up' ? style.bm : style.tm;
		const bus = row(column => {
			if (column === stemColumn) return style.mm;
			if (column < first || column > last) return ' ';
			if (column === first) return startCorner;
			if (column === last) return endCorner;
			if (centers.includes(column)) return middle;
			return style.h;
		});

		return direction === 'up' ? [stems, bus, drop] : [drop, bus, stems];
	}

	const GAP = 3;

	// 子の並びを横に敷く。返すのは、各部分木と、左端からの位置と、全体の幅と、親の柱の列。
	function layOut(children, style) {
		const laid = children.map(child => layoutBoxTree(child, style));
		let edge = 0;
		const positions = laid.map(item => {
			const position = edge;
			edge += item.width + GAP;
			return position;
		});
		const centers = laid.map((item, index) => positions[index] + item.center);

		return {
			laid,
			positions,
			centers,
			width: laid.length === 0 ? 0 : edge - GAP,
			stem: centers.length === 0 ? 0 : Math.round((centers[0] + centers.at(-1)) / 2),
		};
	}

	// 部分木を組む。返すのは、行の並びと、親の線を受ける列と、幅。
	function layoutBoxTree(node, style) {
		// 親から子へつなぐ記号は、子の部分木の先頭行・最終行に置く。
		// 子が自分の above / below を持つと、その行は孫の箱の行になり、つなぎ記号が宙に浮く。
		// 親の柱を子の箱の辺まで通すには、子の枝を貫く線を引くことになり、配置の計算をやり直すことになる。
		// いまの作りの範囲を超えるので、入れない組み合わせは止めて知らせる。
		for (const child of node.above ?? []) {
			if (child.below !== undefined || child.children !== undefined) {
				throw new Error('木を入れ子にすると、線がつながりません。above や below を持つ木は、ほかの木の中に入れず、図のいちばん上に置いてください。');
			}
		}

		for (const child of node.below ?? node.children ?? []) {
			if (child.above !== undefined) {
				throw new Error('木を入れ子にすると、線がつながりません。above や below を持つ木は、ほかの木の中に入れず、図のいちばん上に置いてください。');
			}
		}

		const up = layOut(node.above ?? [], style);
		const down = layOut(node.below ?? node.children ?? [], style);
		const own = frame([node.label], style);
		const ownWidth = width(own[0]);
		const ownCenter = Math.floor((ownWidth - 1) / 2);

		// 上の枝の柱と下の枝の柱を同じ列に合わせる。
		// 左へはみ出さないよう、いちばん右の柱を基準の列にする。
		const stemColumn = Math.max(up.stem, down.stem, ownCenter);
		const upLeft = stemColumn - up.stem;
		const downLeft = stemColumn - down.stem;
		const labelLeft = stemColumn - ownCenter;
		const total = Math.max(upLeft + up.width, downLeft + down.width, labelLeft + ownWidth);

		// 部分木の並びを、横に敷いて行にする。
		const placeGroup = (group, left) => {
			const height = Math.max(...group.laid.map(item => item.lines.length));
			return Array.from({length: height}, (_, row) =>
				' '.repeat(left) + group.laid.map((item, index) => (index === 0 ? '' : ' '.repeat(GAP)) + (item.lines[row] ?? ' '.repeat(item.width))).join(''));
		};

		// 親の箱。上の枝があれば上の辺で線を受け、下の枝があれば下の辺から線を出す。
		if (up.laid.length > 0) {
			own[0] = attach(own[0], ownCenter, style.bm);
		}

		if (down.laid.length > 0) {
			own[2] = attach(own[2], ownCenter, style.tm);
		}

		const lines = [];

		if (up.laid.length > 0) {
			// 上の枝の箱は、下の辺の真ん中から柱を出す。
			for (const item of up.laid) {
				item.lines[item.lines.length - 1] = attach(item.lines.at(-1), item.center, style.tm);
			}

			lines.push(...placeGroup(up, upLeft));
			lines.push(...mergeLines(up.centers.map(column => column + upLeft), stemColumn, style, total, 'up'));
		}

		for (const line of own) {
			lines.push(' '.repeat(labelLeft) + line);
		}

		if (down.laid.length > 0) {
			// 下の枝の箱は、上の辺の真ん中で線を受ける。
			for (const item of down.laid) {
				item.lines[0] = attach(item.lines[0], item.center, style.bm);
			}

			lines.push(...mergeLines(down.centers.map(column => column + downLeft), stemColumn, style, total, 'down'));
			lines.push(...placeGroup(down, downLeft));
		}

		return {lines: lines.map(line => line + ' '.repeat(total - width(line))), center: stemColumn, width: total};
	}

	// 囲んだまとまりを横に並べ、間を矢印でつなぐ。そのうえで、下に戻り線を 1 本引く。
	function renderLoop(loop, style) {
		if (loop.blocks.length === 0) {
			throw new Error('loop の中にブロックがありません。');
		}

		if (!Number.isInteger(loop.back) || loop.back < 1 || loop.back > loop.blocks.length) {
			throw new Error(`戻り先の番号が範囲の外です: back=${loop.back}、ブロックは ${loop.blocks.length} 個です。`);
		}

		const arrow = mode === 'strict' ? '->' : '→';
		const gap = ` ${arrow} `;
		const laid = loop.blocks.map(block => renderBlock(block));
		const height = Math.max(...laid.map(lines => lines.length));
		const widths = laid.map(lines => lines.reduce((widest, line) => Math.max(widest, width(line)), 0));

		const centers = [];
		let edge = 0;
		const positions = widths.map(one => {
			const position = edge;
			centers.push(position + Math.floor((one - 1) / 2));
			edge += one + width(gap);
			return position;
		});
		const total = edge - width(gap);

		// 矢印は、図の上下の辺には出さない。ブロックの縦の真ん中の行にだけ出す。
		const middle = Math.floor((height - 1) / 2);
		const blank = ' '.repeat(width(gap));
		const lines = Array.from({length: height}, (_, row) =>
			laid.map((body, index) => (index === 0 ? '' : (row === middle ? gap : blank)) + padRight(body[row] ?? '', widths[index])).join(''));

		// 戻り線。いちばん右のブロックの下から出て、左へ渡り、back 番目のブロックの下へ上げる。
		const from = centers.at(-1);
		const to = centers[loop.back - 1];
		if (to === from) {
			throw new Error('戻り線の戻り先が、いちばん右のブロックと同じです。戻る先になるブロックを指定してください。');
		}
		const head = mode === 'strict' ? '^' : '↑';
		const draw = build => Array.from({length: total}, (_, column) => build(column)).join('').trimEnd();

		lines.push(draw(column => {
			if (column === from) return style.v;
			return column === to ? head : ' ';
		}));
		lines.push(draw(column => {
			if (column === to) return style.bl;
			if (column === from) return style.br;
			return column > to && column < from ? style.h : ' ';
		}));

		if (loop.label) {
			const labelWidth = width(loop.label);
			// 書き手は幅を数えない前提なので、中心に置けないラベルは英語のエラーではなく日本語で止める。
			const start = Math.round((to + from + 1 - labelWidth) / 2);
			if (start < 0 || labelWidth > total) {
				throw new Error(`戻り線のラベルが長すぎます。短くしてください。ラベルは ${labelWidth} 桁、戻り線は ${from - to + 1} 桁です。`);
			}

			lines.push(' '.repeat(start) + loop.label);
		}

		return lines.map(line => line + ' '.repeat(total - width(line)));
	}

	function renderBlock(block) {
		const style = styleOf(block);

		if ('lines' in block) {
			return [...block.lines];
		}

		if ('rule' in block) {
			return [RULE];
		}

		if ('stack' in block) {
			return stack(block.stack, {separate: false});
		}

		if ('bar' in block) {
			return frame([block.bar], style, {top: style.band, tl: style.bandTl, tr: style.bandTr});
		}

		if ('box' in block) {
			return frame(stack(block.box, {separate: false}), style);
		}

		if ('row' in block) {
			// "gap" は ' '.repeat の回数になる。0 未満や整数でない値では Invalid count value で落ちるため点検する。
			if (block.gap !== undefined && (!Number.isInteger(block.gap) || block.gap < 0)) {
				throw new Error('row の gap は 0 以上の整数で書いてください。例: {"row": [...], "gap": 3}');
			}

			return renderRow(block.row, block.gap ?? 3);
		}

		if ('table' in block) {
			return renderTable(block.table, style);
		}

		if ('loop' in block) {
			return renderLoop(block.loop, style);
		}

		if ('tree' in block) {
			const shape = block.style;
			// 罫線の種類と同じく、知らない見た目は黙って別の絵を出さずに止める。
			if (shape !== 'indent' && shape !== 'box') {
				throw new Error(`木の見た目が分かりません: ${JSON.stringify(shape)}。木の "style" には "indent" か "box" を書いてください。`);
			}

			return shape === 'box' ? layoutBoxTree(block.tree, style).lines : renderIndentTree(block.tree, '', '', style, []);
		}

		throw new Error(`ブロックの形が分かりません: ${JSON.stringify(block)}`);
	}

	function renderDocument(document) {
		const lines = stack(document.blocks ?? [], {separate: true});
		if (lines.some(line => line === RULE)) {
			throw new Error('rule は box の中だけで使えます。');
		}

		return lines;
	}

	return {renderDocument};
}

export function renderDocument(document, {mode = 'ambiguous', line} = {}) {
	// "blocks" は手で書くので、配列を 1 段忘れる書き方を点検する。for...of が英語の TypeError になる前に、ここで受ける。
	if (document.blocks !== undefined && !Array.isArray(document.blocks)) {
		throw new Error('入力の形が分かりません。{"blocks": [...]} の形にしてください。');
	}

	for (const block of document.blocks ?? []) {
		checkShape(block);
	}

	// 既定の罫線は light。strict のときは createRenderer の中で ascii に落ちる。
	return createRenderer(mode, line ?? document.line ?? 'light').renderDocument(document);
}

// 幅の決まらない字を、まとめて見つける。
function collectTexts(block, texts) {
	if ('lines' in block) {
		texts.push(...block.lines);
	}

	if ('bar' in block) {
		texts.push(block.bar);
	}

	if ('table' in block) {
		texts.push(...block.table.head, ...block.table.rows.flat());
	}

	if ('tree' in block) {
		const walk = node => [node.label, ...(node.above ?? []).flatMap(walk), ...(node.below ?? node.children ?? []).flatMap(walk)];
		texts.push(...walk(block.tree));
	}

	if ('loop' in block) {
		for (const child of block.loop.blocks) {
			collectTexts(child, texts);
		}
	}

	for (const key of ['box', 'row', 'stack']) {
		for (const child of block[key] ?? []) {
			collectTexts(child, texts);
		}
	}

	return texts;
}

// 弾かれた字を一度に全部挙げる。1 字ずつ止まると、直しては止まるを繰り返すことになる。
function findTerminalDependentCharacters(block, mode, found) {
	for (const text of collectTexts(block, [])) {
		for (const character of text) {
			if (characterWidth(character, mode) === undefined) {
				found.set(character.codePointAt(0), character);
			}
		}
	}

	return found;
}

// 文字を書くところに文字でないものが入ると、幅の計算で英語の TypeError になったり、
// 配列の 1 字だけを数えて崩れた枠が出たりする。図を組む前に 1 回歩いて形を点検し、違えば日本語で止める。
// 歩き方は collectTexts (字の点検) と同じ。点検はその手前に走らせる。

const isText = value => typeof value === 'string';
const isTexts = value => Array.isArray(value) && value.every(isText);

function checkTree(node) {
	if (node === null || typeof node !== 'object' || Array.isArray(node) || !isText(node.label)) {
		throw new Error('tree の節は {"label": "親"} の形にしてください。枝の要素 ({"label": "子"}) も同じ形です。');
	}

	for (const key of ['above', 'below', 'children']) {
		if (node[key] === undefined) {
			continue;
		}

		if (!Array.isArray(node[key])) {
			throw new Error(`tree の枝 (${key}) は [...] の並びにしてください。`);
		}

		node[key].forEach(child => checkTree(child));
	}
}

export function checkShape(block, inRow = false) {
	if (block === null || typeof block !== 'object' || Array.isArray(block)) {
		throw new Error('blocks の要素は {...} の形のブロックにしてください。');
	}

	// "align" は row が読むだけで、ほかの場所では効かない。黙って無視すると、効いたつもりの図が出る。
	if ('align' in block) {
		if (!inRow) {
			throw new Error('"align" は row の中の部品にだけ書けます。例: {"row": [{"box": [...], "align": "top"}, ...]}');
		}

		if (block.align !== 'top' && block.align !== 'middle') {
			throw new Error('"align" には "top" か "middle" を書いてください。省くと "middle" になります。');
		}
	}

	if ('bar' in block && !isText(block.bar)) {
		throw new Error('bar は文字で書いてください。例: {"bar": "見出し"}');
	}

	if ('lines' in block && !isTexts(block.lines)) {
		throw new Error('lines の要素は文字の並びにしてください。例: {"lines": ["1 行目", "2 行目"]}');
	}

	if ('table' in block) {
		const table = block.table;
		if (table === null || typeof table !== 'object'
			|| !isTexts(table.head) || !Array.isArray(table.rows)
			|| !table.rows.every(row => isTexts(row))) {
			throw new Error('table は {"head": ["見出し"], "rows": [["セル"]]} の形にしてください。head と rows の中身は文字の並びにします。');
		}
	}

	if ('tree' in block) {
		checkTree(block.tree);
	}

	if ('loop' in block) {
		const loop = block.loop;
		if (loop === null || typeof loop !== 'object' || Array.isArray(loop) || !Array.isArray(loop.blocks)) {
			throw new Error('loop は {"blocks": [...], "back": 番号, "label": "戻る"} の形にしてください。');
		}

		if (loop.label !== undefined && !isText(loop.label)) {
			throw new Error('loop の label は文字で書いてください。例: {"label": "戻る"}');
		}

		for (const child of loop.blocks) {
			checkShape(child);
		}
	}

	for (const key of ['box', 'row', 'stack']) {
		if (block[key] === undefined) {
			continue;
		}

		if (!Array.isArray(block[key])) {
			throw new Error(`${key} の中は [...] の並びにしてください。`);
		}

		for (const child of block[key]) {
			checkShape(child, key === 'row');
		}
	}
}

function main() {
	const args = process.argv.slice(2);
	const modeArgument = args.find(argument => argument.startsWith('--mode='));
	const mode = modeArgument ? modeArgument.slice('--mode='.length) : 'ambiguous';
	if (mode !== 'strict' && mode !== 'ambiguous') {
		console.error(`モードの指定が分かりません: ${mode}`);
		process.exitCode = 1;
		return;
	}

	const path = args.find(argument => !argument.startsWith('--'));
	let document;
	try {
		const raw = path ? readFileSync(path, 'utf8') : readFileSync(0, 'utf8');
		document = JSON.parse(raw);
	} catch (error) {
		// 書き手が手で JSON を書くため、いちばん踏みやすい道。生のスタックでは止めて知らせられない。
		console.error(`入力の JSON を読めませんでした: ${error.message}`);
		process.exitCode = 1;
		return;
	}

	if (document === null || typeof document !== 'object' || Array.isArray(document)) {
		console.error('入力の形が分かりません。{"blocks": [...]} の形にしてください。');
		process.exitCode = 1;
		return;
	}

	// "blocks" に配列を書く段を忘れると、for...of で英語の TypeError になる。字の点検の前に点検する。
	if (document.blocks !== undefined && !Array.isArray(document.blocks)) {
		console.error('入力の形が分かりません。{"blocks": [...]} の形にしてください。');
		process.exitCode = 1;
		return;
	}
	const found = new Map();
	for (const block of document.blocks ?? []) {
		// 形の点検は字の点検の前。collectTexts は形が正しいことを前提に歩くため、先に形を通す。
		// 違えば日本語の 1 文で止める。main の外では拾わないため、ここで受け取る。
		try {
			checkShape(block);
			findTerminalDependentCharacters(block, mode, found);
		} catch (error) {
			console.error(error.message);
			process.exitCode = 1;
			return;
		}
	}

	if (found.size > 0) {
		console.error('端末によって幅が変わる字が混ざっています。ASCII か、幅が決まっている字に書き直してください。');
		for (const [codePoint, character] of found) {
			console.error(`  ${character} U+${codePoint.toString(16).toUpperCase()}`);
		}

		process.exitCode = 1;
		return;
	}

	try {
		console.log(renderDocument(document, {mode}).join('\n'));
	} catch (error) {
		console.error(error.message);
		process.exitCode = 1;
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main();
}
