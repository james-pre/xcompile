import { tokenize, type Token, type TokenDefinition } from './tokens.js';

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
		(node?.children?.map(child => '\n' + '    '.repeat(depth + 1) + stringifyNode(child, depth + 1)).join('') || '')
	);
}

export type Logger = (verbosity: number, message: string, depth: number) => void;

export interface ParseOptionsShared {
	definitions: NodeDefinition[];
	rootNode: string;
	ignoreLiterals: string[];
	log?: Logger;
}

export interface ParseAndTokenize extends ParseOptionsShared {
	source: string;
	literals: Iterable<TokenDefinition>;
}

export interface ParseOnly extends ParseOptionsShared {
	tokens: Token[];
	literals: string[];
}

export type ParseOptions = ParseOnly | ParseAndTokenize;

export function parse(options: ParseOptions): Node[] {
	let position = 0,
		dirtyPosition = 0;

	const tokens = 'tokens' in options ? options.tokens : tokenize(options.source, options.literals);
	const literals = 'tokens' in options ? options.literals : [...options.literals].map(literal => literal.name);

	function parseNode(kind: string, depth = 0): Node | null {
		const log = (level: number, message: string): void => options.log?.(level, message, depth);

		if (literals.includes(kind)) {
			while (options.ignoreLiterals.includes(tokens[position]?.kind)) {
				position++;
			}

			const token = tokens[position];

			if (!token) {
				log(2, `Reached end of tokens unexpectedly at position ${position}. Expected "${kind}"`);
				return null;
			}

			if (token?.kind !== kind) {
				log(3, `Expected "${kind}", but found "${token.kind}" at ${token.line}:${token.column}`);
				return null;
			}

			position++;
			return { ...token, children: [] };
		}

		const definition = options.definitions.find(def => def.name === kind);
		if (!definition) {
			log(1, `Error: Definition for node "${kind}" not found`);
			throw new Error(`Definition for node "${kind}" not found`);
		}

		const pattern = definition.pattern.map(part => (typeof part === 'string' ? { kind: part, type: 'required' } : part));

		switch (definition.type) {
			case 'oneof': {
				log(1, 'Parsing oneof: ' + kind);
				for (const option of pattern) {
					log(3, 'Attempting to parse alteration: ' + option.kind);
					const node = parseNode(option.kind, depth + 1);
					if (node) {
						log(3, `Resolved ${kind} to ${node.kind}`);
						return node;
					}
				}
				log(1, 'Warning: No matches for oneof');
				return null;
			}
			case 'sequence': {
				const children: Node[] = [];

				while (options.ignoreLiterals.includes(tokens[position]?.kind)) {
					position++;
				}

				const start = position;
				const token = tokens[position];

				log(1, 'Parsing sequence: ' + kind);
				for (const part of pattern) {
					log(3, 'Attempting to parse sequence part: ' + part.kind);
					if (part.type == 'repeated') {
						let repeatedNode: Node | null;
						while ((repeatedNode = parseNode(part.kind, depth + 1))) {
							children.push(repeatedNode);
						}
						continue;
					}

					dirtyPosition = position;
					const node = parseNode(part.kind, depth + 1);
					if (node) {
						log(2, `Parsed ${node.kind} at ${node.line}:${node.column}`);
						children.push(node);
					} else if (part.type != 'optional') {
						log(2, `Failed to parse "${part.kind}", going back`);
						position = start; // Rollback
						return null;
					}
				}

				log(1, `"${token.kind}" at ${token.line}:${token.column}`);
				return {
					kind,
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
			if (position >= tokens.length && options.ignoreLiterals.includes(tokens.at(-1)!.kind)) break;
			const token = tokens[dirtyPosition || position];
			throw new Error(`Unexpected ${token.kind} "${token.text}" at ${token.line}:${token.column}`);
		}
		result.push(node);
	}
	return result;
}
