interface Token {
	kind: string;
	text: string;
	line: number;
	column: number;
}

interface Node extends Token {
	children: Node[];
}

interface GenericToken {
	name: string;
	pattern: RegExp;
}

function findNextToken(source: string, genericTokens: GenericToken, position: number, line: number, column: number): Token | null {
	for (const { name, pattern } of genericTokens) {
		const match = pattern.exec(source.slice(position));
		if (!match) {
			continue;
		}
		return {
			kind: name,
			text: match[0],
			line,
			column,
		};
	}
	return null;
}

export function tokenize(source: string, genericTokens: GenericToken): Token[] {
	const tokens: Token[] = [];
	let line = 1;
	let column = 0;
	let position = 0;

	while (position < source.length) {
		const token = findNextToken(source, position, line, column);

		if (!token) {
			throw new Error(`Unexpected token "${source[position - 1]}" at line ${line}, column ${column}`);
		}

		tokens.push(token);
		position += token.text.length;

		// Update line and column based on the token text
		const lines = token.text.split('\n');
		line += lines.length - 1;
		column = lines.length > 1 ? lines[lines.length - 1].length : column + token.text.length;
	}

	return tokens;
}
