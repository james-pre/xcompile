import type { Token } from './tokens';

export interface DefinitionReference {
	kind: string;
	optional?: boolean;
}

export interface NodeDefinition {
	name: string;
	type: 'composite' | 'oneof' | 'literal';
	pattern: (string | DefinitionReference)[];
}

export interface Node extends Token {
	children: Node[];
}

export interface ParseOptions {
	tokens: Token[];
	definitions: NodeDefinition[];
	literals: string[];
	rootNode: string;
	debug?(message: string): void;
}

export function parse({ tokens, literals, definitions, rootNode, debug: _debug = () => {} }: ParseOptions): Node[] {
	let position = 0;

	function parseNode(kind: string, depth = 0): Node | null {
		const debug = (message: string): unknown => _debug('  '.repeat(depth) + message);
		if (literals.includes(kind)) {
			const token = tokens[position];

			if (token?.kind != kind) {
				// Token doesn't match the expected literal kind
				return null;
			}
			debug(`Literal "${kind}" at ${token.line}:${token.column}`);
			position++;
			return { ...token, children: [] };
		}

		const definition = definitions.find((def) => def.name === kind);
		if (!definition) {
			debug(`Error: Definition for node "${kind}" not found`);
			throw new Error(`Definition for node "${kind}" not found`);
		}

		const pattern = definition.pattern.map((part) => (typeof part === 'string' ? { kind: part, optional: false } : part));

		switch (definition.type) {
			case 'oneof': {
				debug(`Parsing oneof "${kind}"`);
				for (const option of pattern) {
					const node = parseNode(option.kind, depth + 1);
					if (node) return { ...node, kind: definition.name };
				}
				debug('Warning: No matches for oneof');
				return null;
			}
			case 'composite': {
				const children: Node[] = [];
				const start = position;

				debug(`Parsing composite "${kind}"`);
				for (const part of pattern) {
					const node = parseNode(part.kind, depth + 1);
					if (node) {
						children.push(node);
					} else if (!part.optional) {
						position = start; // Rollback
						return null;
					}
				}

				const token = tokens[start];
				debug(`Composite "${kind}" at ${token.line}:${token.column}`);
				return {
					kind: definition.name,
					text: token.text,
					position: token.position,
					line: token.line,
					column: token.column,
					children,
				};
			}
			default:
				console.warn('Invalid node kind:', kind);
				return null;
		}
	}

	const result: Node[] = [];
	while (position < tokens.length) {
		const node = parseNode(rootNode);
		if (!node) {
			const token = tokens[position];
			_debug(`Error: Unexpected token "${token.text}" at line ${token.line}, column ${token.column}`);
			throw new Error(`Unexpected token "${token.text}" at line ${token.line}, column ${token.column}`);
		}
		result.push(node);
	}
	return result;
}
