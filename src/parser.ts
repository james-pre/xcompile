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
}

export function parse({ tokens, literals, definitions, rootNode }: ParseOptions): Node[] {
	let position = 0;

	function parseNode(name: string): Node | null {
		if (literals.includes(name)) {
			const token = tokens[position];
			if (token && token.kind === name) {
				position++;
				return { ...token, children: [] };
			}
			return null; // Token doesn't match the expected literal kind
		}

		const definition = definitions.find((def) => def.name === name);
		if (!definition) {
			throw new Error(`Definition for node "${name}" not found`);
		}

		const pattern = definition.pattern.map((part) => (typeof part === 'string' ? { kind: part, optional: false } : part));

		switch (definition.type) {
			case 'oneof': {
				for (const option of pattern) {
					const node = parseNode(option.kind);
					if (node) return { ...node, kind: definition.name };
				}
				return null;
			}
			case 'composite': {
				const children: Node[] = [];
				const start = position;

				for (const part of pattern) {
					const node = parseNode(part.kind);
					if (node) {
						children.push(node);
					} else if (!part.optional) {
						position = start; // Rollback
						return null;
					}
				}

				const token = tokens[start];
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
				return null;
		}
	}

	const result: Node[] = [];
	while (position < tokens.length) {
		const node = parseNode(rootNode);
		if (!node) {
			const token = tokens[position];
			throw new Error(`Unexpected token "${token.text}" at line ${token.line}, column ${token.column}`);
		}
		result.push(node);
	}
	return result;
}
