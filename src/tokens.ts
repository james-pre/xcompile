export interface Token {
	kind: string;
	text: string;
	line: number;
	column: number;
	position: number;
}

export interface TokenDefinition {
	name: string;
	pattern: RegExp;
}

export interface TokenError {
	line: number;
	column: number;
	position: number;
	source: string;
	reason: string;
}

export function tokenize(source: string, definitions: Iterable<TokenDefinition>): Token[] {
	const tokens: Token[] = [];

	let line = 1;
	let column = 0;
	let position = 0;

	while (position < source.length) {
		let token: Token | undefined;
		const slice = source.slice(position);
		if (!slice.length) break;
		for (const { name, pattern } of definitions) {
			const match = pattern.exec(slice);
			if (match && match[0].length > (token?.text.length || 0)) {
				token = { kind: name, text: match[0], line, column, position };
			}
		}

		if (!token) {
			throw { line, column, position, source, reason: 'unexpected' };
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
