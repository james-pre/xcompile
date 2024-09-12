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
		(node?.children?.map((child) => '\n' + '    '.repeat(depth + 1) + stringifyNode(child, depth + 1)).join('') || '')
	);
}

export interface ParseOptionsShared {
	definitions: NodeDefinition[];
	rootNode: string;
	ignoreLiterals: string[];
	debug?(message: string): void;
	verbose?(message: string): void;
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

export function parse(options: ParseOptions): Node[] {
	let position = 0,
		dirtyPosition = 0;

	const tokens = 'tokens' in options ? options.tokens : tokenize(options.source, options.literals);
	const literals = 'tokens' in options ? options.literals : [...options.literals].map((literal) => literal.name);

	function parseNode(kind: string, depth = 0): Node | null {
		const debug = (message: string): void => options?.debug?.('  '.repeat(depth) + message);
		const verbose = (message: string): void => options?.verbose?.('  '.repeat(depth + 1) + 'verbose: ' + message);
		if (literals.includes(kind)) {
			while (options.ignoreLiterals.includes(tokens[position]?.kind)) {
				position++;
			}

			const token = tokens[position];

			if (!token) {
				verbose(`Reached end of tokens unexpectedly at position ${position}. Expected "${kind}"`);
				return null;
			}

			if (token?.kind !== kind) {
				verbose(`Expected "${kind}", but found "${token.kind}" at ${token.line}:${token.column}`);
				return null;
			}

			debug(`"${kind}" at ${token.line}:${token.column}`);
			position++;
			return { ...token, children: [] };
		}

		const definition = options.definitions.find((def) => def.name === kind);
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
					if (node) {
						return node;
					}
				}
				debug('Warning: No matches for oneof');
				return null;
			}
			case 'sequence': {
				const children: Node[] = [];
				const start = position;

				debug(`Parsing sequence "${kind}"`);
				for (const part of pattern) {
					verbose(`Attempting to parse "${part.kind}"`);
					if (part.type == 'repeated') {
						let repeatedNode: Node | null;
						while ((repeatedNode = parseNode(part.kind, depth + 1))) {
							children.push(repeatedNode);
						}
					} else {
						dirtyPosition = position;
						const node = parseNode(part.kind, depth + 1);
						if (node) {
							verbose(`parsed "${part.kind}", adding`);
							children.push(node);
						} else if (part.type != 'optional') {
							verbose(`failed to parse "${part.kind}", going back`);
							position = start; // Rollback
							return null;
						}
					}
				}

				const token = tokens[start];
				debug(`"${kind}" at ${token.line}:${token.column}`);
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
		const node = parseNode(options.rootNode);
		if (!node) {
			const token = tokens[dirtyPosition || position];
			throw new Error(`Unexpected token "${token.text}" at line ${token.line}, column ${token.column}`);
		}
		result.push(node);
	}
	return result;
}
