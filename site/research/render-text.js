// Render a small, predictable Markdown subset using DOM nodes only.
// Model HTML remains literal text; links are restricted to HTTP(S).
function inline(target, value) {
	const pattern =
		/(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;
	let offset = 0;
	for (const match of value.matchAll(pattern)) {
		target.append(document.createTextNode(value.slice(offset, match.index)));
		const node = document.createElement(
			match[2] ? "strong" : match[3] ? "code" : "a",
		);
		node.textContent = match[2] || match[3] || match[4];
		if (match[5]) {
			try {
				const url = new URL(match[5]);
				if (url.username || url.password) throw Error();
				node.href = url.href;
			} catch {
				target.append(document.createTextNode(match[0]));
				offset = match.index + match[0].length;
				continue;
			}
		}
		target.append(node);
		offset = match.index + match[0].length;
	}
	target.append(document.createTextNode(value.slice(offset)));
}
export function renderText(target, source) {
	target.replaceChildren();
	target.classList.add("formatted-text");
	const lines = source.split("\n");
	let list = null;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line.trim()) {
			list = null;
			continue;
		}
		if (line.startsWith("```")) {
			const code = [];
			i++;
			while (i < lines.length && !lines[i].startsWith("```"))
				code.push(lines[i++]);
			const pre = document.createElement("pre"),
				node = document.createElement("code");
			node.textContent = code.join("\n");
			pre.append(node);
			target.append(pre);
			list = null;
			continue;
		}
		const heading = line.match(/^#{1,6}\s+(.+)/);
		if (heading) {
			const node = document.createElement("h4");
			inline(node, heading[1]);
			target.append(node);
			list = null;
			continue;
		}
		const item = line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)/);
		if (item) {
			const tag = /^\s*\d/.test(line) ? "OL" : "UL";
			if (!list || list.tagName !== tag) {
				list = document.createElement(tag);
				target.append(list);
			}
			const li = document.createElement("li");
			inline(li, item[1]);
			list.append(li);
			continue;
		}
		list = null;
		const p = document.createElement("p");
		inline(p, line);
		target.append(p);
	}
}
