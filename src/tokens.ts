import type { Issue } from './issue.js';

/**
 * A location in source text
 */
export interface Location {
	line: number;
	column: number;
	position: number;
	/**
	 * The file, internal module, shared object, etc.
	 */
	unit?: string;
}

export function locationText(loc: Location): string {
	return `${loc.unit ? loc.unit + ':' : ''}${loc.line}:${loc.column}`;
}

export interface Token extends Location {
	kind: string;
	text: string;
}

export function stringifyToken(token: Token) {
	const text = token.text.replaceAll('\n', '\\n').replaceAll('\t', '\\t');

	return `${token.kind} "${text}" (${locationText(token)})`;
}

export interface TokenDefinition {
	name: string;
	pattern: RegExp;
}

export interface TokenizeOptions {
	source: string;
	unit?: string;
	definitions: Iterable<TokenDefinition>;
}

export function tokenize(source: string, definitions: Iterable<TokenDefinition>, unit?: string): Token[] {
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
				token = { kind: name, text: match[0], line, column, position, unit };
			}
		}

		if (!token) {
			throw {
				location: { line, column, position, unit },
				source,
				message: 'Unexpected token: ' + source[position],
				level: 0,
				stack: new Error().stack,
			} satisfies Issue;
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
