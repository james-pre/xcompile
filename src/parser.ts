import { tokenize, type Token, type TokenDefinition } from './tokens';

export interface DefinitionPart {
	kind: string;
	type: 'required' | 'optional' | 'repeated';
}

export interface NodeDefinition {
	name: string;
	type: 'sequence' | 'oneof';
	pattern: (string | DefinitionPart)[];
}

export interface Node extends Token {
	children?: Node[];
}

export function stringifyNode(node: Node, depth = 0): string {
	return (
		`${node.kind}${node?.children?.length ? '' : ` "${node.text.replaceAll('\n', '\\n').replaceAll('\t', '\\t')}"`} ${node.line}:${node.column}` +
		node?.children?.map((child) => '\n' + '    '.repeat(depth + 1) + stringifyNode(child, depth + 1))
	);
}

export interface ParseOptionsShared {
	definitions: NodeDefinition[];
	rootNode: string;
	debug?(message: string): void;
}

interface ParseAndTokenize extends ParseOptionsShared {
	source: string;
	literals: Iterable<TokenDefinition>;
}

interface ParseOnly extends ParseOptionsShared {
	tokens: Token[];
	literals: string[];
}

export type ParseOptions = ParseOnly | ParseAndTokenize;

export function parse({ definitions, rootNode, debug: _debug = () => {}, ...rest }: ParseOptions): Node[] {
	let position = 0;

	const tokens = 'tokens' in rest ? rest.tokens : tokenize(rest.source, rest.literals);
	const literals = 'tokens' in rest ? rest.literals : [...rest.literals].map((literal) => literal.name);

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

		const pattern = definition.pattern.map((part) => (typeof part === 'string' ? { kind: part, type: 'required' } : part));

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
			case 'sequence': {
				const children: Node[] = [];
				const start = position;

				debug(`Parsing sequence "${kind}"`);
				for (const part of pattern) {
					if (part.type == 'repeated') {
						let repeatedNode: Node | null;
						while ((repeatedNode = parseNode(part.kind, depth + 1))) {
							children.push(repeatedNode);
						}
						break;
					}
					const node = parseNode(part.kind, depth + 1);
					if (node) {
						children.push(node);
					} else if (part.type != 'optional') {
						position = start; // Rollback
						return null;
					}
				}

				const token = tokens[start];
				debug(`Sequence "${kind}" at ${token.line}:${token.column}`);
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
