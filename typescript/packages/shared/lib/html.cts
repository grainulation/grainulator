interface HtmlToken {
	text?: string;
	raw: string;
	name?: string;
	close?: boolean;
	selfClosing?: boolean;
	attrs?: Record<string, string>;
}
("use strict");
// Text extraction/conversion helpers, not a browser HTML sanitizer. Consumers
// rendering text must escape for their output context. Decode entities once.
const entities: Record<string, string> = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
};
function decodeEntities(value: unknown): string {
	return String(value ?? "").replace(
		/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
		(raw: string, name: string) => {
			if (name[0] !== "#") return entities[name.toLowerCase()] ?? raw;
			const code =
				name.charAt(1).toLowerCase() === "x"
					? Number.parseInt(name.slice(2), 16)
					: Number(name.slice(1));
			return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
				? String.fromCodePoint(code)
				: "\ufffd";
		},
	);
}
// A bounded tokenizer. Quotes inside tags cannot prematurely end a tag; raw
// script/style content is discarded by consumers using withoutElements.
function* tokens(input: unknown): Generator<HtmlToken> {
	const source = String(input);
	let i = 0;
	while (i < source.length) {
		if (source[i] !== "<") {
			let end = source.indexOf("<", i);
			if (end < 0) end = source.length;
			yield { text: source.slice(i, end), raw: source.slice(i, end) };
			i = end;
			continue;
		}
		if (source.startsWith("<!--", i)) {
			const end = source.indexOf("-->", i + 4);
			i = end < 0 ? source.length : end + 3;
			continue;
		}
		let end = i + 1,
			quote = "";
		for (; end < source.length; end++) {
			const c = source[end] ?? "";
			if (quote) {
				if (c === quote) quote = "";
			} else if (c === '"' || c === "'") quote = c;
			else if (c === ">") break;
			else if (c === "<") break;
		}
		if (source[end] !== ">") {
			const raw = source.slice(i, end);
			yield { text: raw, raw };
			i = end;
			continue;
		}
		const raw = source.slice(i, end + 1);
		const match = /^<\s*(\/?)\s*([a-z][a-z0-9:-]*)(?=[\s/>])/i.exec(raw);
		if (!match) {
			if (!raw.startsWith("<!")) yield { text: raw, raw };
			i = end + 1;
			continue;
		}
		const attrs: Record<string, string> = Object.create(null);
		const attr = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
		attr.lastIndex = match[0].length;
		let a = attr.exec(raw.slice(0, -1));
		while (a) {
			attrs[(a[1] ?? "").toLowerCase()] = decodeEntities(
				a[2] ?? a[3] ?? a[4] ?? "",
			);
			a = attr.exec(raw.slice(0, -1));
		}
		yield {
			name: (match[2] ?? "").toLowerCase(),
			close: !!match[1],
			selfClosing: raw.endsWith("/>"),
			attrs,
			raw,
		};
		i = end + 1;
	}
}
function withoutElements(
	html: unknown,
	names = ["script", "style"],
	{ keepTags = false }: { keepTags?: boolean } = {},
) {
	const omitted = new Set(names);
	let blocked = "",
		depth = 0;
	const output: string[] = [];
	for (const t of tokens(html)) {
		if (blocked) {
			if (t.name === blocked) {
				if (t.close) {
					if (--depth === 0) {
						blocked = "";
						if (keepTags) output.push(t.raw);
					}
				} else if (!t.selfClosing && !["script", "style"].includes(blocked))
					depth++;
			}
		} else if (t.name && omitted.has(t.name) && !t.close) {
			if (keepTags) output.push(t.raw);
			if (!t.selfClosing) {
				blocked = t.name;
				depth = 1;
			}
		} else output.push(t.raw);
	}
	return output.join("");
}
function htmlText(html: unknown) {
	const output: string[] = [];
	for (const t of tokens(withoutElements(html)))
		if (t.text !== undefined) output.push(t.text);
	return decodeEntities(output.join(""));
}
export = { tokens, decodeEntities, withoutElements, htmlText };
