import { tokenize, type Token, type TokenDefinition } from './tokens.js';

export interface DefinitionPart {
	kind: string;
	type: 'required' | 'optional' | 'repeated';
}

export interface NodeDefinition {
	name: string;
	type: 'sequence' | 'alternation';
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
	rootNodes: string[];
	ignoreLiterals: string[];
	maxNodeDepth?: number;
	maxCycles?: number;
	log?: Logger;
	id?: string;
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

function find_loop(strings: string[], counts: number): string[] | null {
	const subArrayCounts: Map<string, number> = new Map();

	for (let i = 0; i < strings.length - 1; i++) {
		const subArray = strings[i] + ',' + strings[i + 1]; // Create a unique representation of the sub-array
		subArrayCounts.set(subArray, (subArrayCounts.get(subArray) || 0) + 1);

		if (subArrayCounts.get(subArray)! >= counts) return subArray.split(',');
	}

	return null; // No duplicate sub-array found with the specified threshold
}

interface ParseInfo {
	parseNodeCalls: number;
	nodesParsed: number;
}

export const parseInfo = new Map<string, ParseInfo>();

export function parse(options: ParseOptions): Node[] {
	const max_depth = options.maxNodeDepth ?? 100;
	const max_cycles = options.maxCycles ?? 5;
	const id = options.id;

	let position = 0,
		dirtyPosition = 0;

	const tokens = 'tokens' in options ? options.tokens : tokenize(options.source, options.literals);
	const literals = 'tokens' in options ? options.literals : [...options.literals].map(literal => literal.name);

	const attempts = new Map<string, Node | null>();

	if (id) parseInfo.set(id, { parseNodeCalls: 0, nodesParsed: 0 });

	function parseNode(kind: string, parents: string[] = []): Node | null {
		if (id) parseInfo.get(id)!.parseNodeCalls++;

		const depth = parents.length;

		if (depth >= max_depth) throw 'Max depth exceeded when parsing ' + kind;

		const log = (level: number, message: string): void => options.log?.(level, message, depth);

		const attempt = kind + position + (depth == 0 ? '' : parents.at(-1));

		const _cache = (node: Node | null) => {
			attempts.set(attempt, node);
			return node;
		};

		if (attempts.has(attempt) && find_loop(parents, 3)) {
			log(3, `Already parsed ${kind} at ${position}`);
			return attempts.get(attempt) ?? null;
		}

		_cache(null);

		const loop = find_loop(parents, max_cycles);

		if (loop) {
			const node = tokens[position];
			throw `Possible infinite loop: ${loop.join(' -> ')} -> ... at ${node.line}:${node.column}`;
		}

		if (id) parseInfo.get(id)!.nodesParsed++;

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
			return _cache({ ...token, children: [] });
		}

		const definition = options.definitions.find(def => def.name === kind);
		if (!definition) {
			log(1, `Error: Definition for node "${kind}" not found`);
			throw `Definition for node "${kind}" not found`;
		}

		const pattern = definition.pattern.map(part => (typeof part === 'string' ? { kind: part, type: 'required' } : part));

		switch (definition.type) {
			case 'alternation': {
				log(1, 'Parsing alternation: ' + kind);
				for (const option of pattern) {
					log(3, 'Attempting to parse alteration: ' + option.kind);
					const node = parseNode(option.kind, [...parents, kind]);
					if (node) {
						log(3, `Resolved ${kind} to ${node.kind}`);
						return _cache(node);
					}
				}
				log(1, 'Warning: No matches for alternation');
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
						while ((repeatedNode = parseNode(part.kind, [...parents, kind]))) {
							children.push(repeatedNode);
						}
						continue;
					}

					dirtyPosition = position;
					const node = parseNode(part.kind, [...parents, kind]);
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
				return _cache({
					kind,
					text: token.text,
					position: token.position,
					line: token.line,
					column: token.column,
					children,
				});
			}
			default:
				console.warn('Invalid node kind:', kind);
				return null;
		}
	}

	const nodes: Node[] = [];
	while (position < tokens.length) {
		let node: Node | null = null;
		for (const root of options.rootNodes) {
			node = parseNode(root);
			if (node) break;
		}
		if (!node) {
			if (position >= tokens.length && options.ignoreLiterals.includes(tokens.at(-1)!.kind)) break;
			const token = tokens[dirtyPosition || position];
			throw `Unexpected ${token.kind} "${token.text}" at ${token.line}:${token.column}`;
		}
		nodes.push(node);
	}
	return nodes;
}
