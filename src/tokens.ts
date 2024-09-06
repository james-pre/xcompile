export interface Token {
	kind: string;
	text: string;
	line: number;
	column: number;
	position: number;
}

export type TokenType = 'literal' | 'composite' | 'union';

export interface GenericTokenLike {
	type: string;
	name: string;
	pattern: unknown;
}

export interface LiteralToken extends GenericTokenLike {
	type: 'literal';
	pattern: RegExp;
}

export interface TokenReference {
	kind: string;
	optional?: boolean;
}

export interface CompositeToken extends GenericTokenLike {
	type: 'composite' | 'oneof';
	pattern: (string | TokenReference)[];
}

export type GenericToken = LiteralToken | CompositeToken;

export function tokenize(source: string, genericTokens: Iterable<GenericToken>): Token[] {
	const tokens: Token[] = [];

	let line = 1;
	let column = 0;
	let position = 0;

	while (position < source.length) {
		let token: Token | undefined;
		for (const { name, pattern, type } of genericTokens) {
			if (type != 'literal') {
				continue;
			}
			const match = pattern.exec(source.slice(position));
			if (match) {
				token = { kind: name, text: match[0], line, column, position };
				break;
			}
		}

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
