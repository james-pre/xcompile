import type { IssueLevel, SourceIssue } from './issue.js';
import { tokenize, type Token, type TokenDefinition } from './tokens.js';

export interface DefinitionPart {
	kind: string;
	type: 'required' | 'optional' | 'repeated';
}

export type DefinitionType = 'alternation' | 'sequence';

export interface PureNodeDefinition {
	name: string;
	type: DefinitionType;
	pattern: DefinitionPart[];
}

export interface NodeDefinition {
	name: string;
	type: DefinitionType;
	pattern: (string | DefinitionPart)[];
}

export interface Node extends Token {
	children?: Node[];
}

export function stringify_node(node: Node, depth = 0): string {
	return (
		`${node.kind}${node?.children?.length ? '' : ` "${node.text.replaceAll('\n', '\\n').replaceAll('\t', '\\t')}"`} ${node.line}:${node.column}` +
		(node?.children?.map(child => '\n' + '    '.repeat(depth + 1) + stringify_node(child, depth + 1)).join('') || '')
	);
}

export interface LogInfo {
	level: number;
	message: string;
	kind: string;
	depth: number;
	type?: DefinitionType;
	event?: 'attempt' | 'resolve' | 'fail' | 'start';
}

export type Logger = (info: LogInfo) => void;

export function logger(log: Logger | undefined, options: Partial<LogInfo> & Pick<LogInfo, 'kind' | 'depth'>): (level: number, message: string, tags?: string[]) => void {
	if (!log) return () => {};

	return function (level, message, tags = []) {
		// parse tags into type and stage

		let type: DefinitionType | undefined, stage: LogInfo['event'] | undefined;

		for (const tag of tags) {
			switch (tag) {
				case 'alternation':
				case 'sequence':
					type = tag;
					break;
				case 'attempt':
				case 'resolve':
				case 'fail':
				case 'start':
					stage = tag;
					break;
			}
		}

		log({ ...options, level, message, type, event: stage });
	};
}

export interface ParseOptionsShared {
	definitions: NodeDefinition[];
	rootNodes: string[];
	ignoreLiterals: string[];
	maxNodeDepth?: number;
	maxCycles?: number;
	log?: Logger;
	id?: string;
	source?: string;
}

export interface ParseAndTokenize extends ParseOptionsShared {
	source: string;
	literals: Iterable<TokenDefinition>;
}

export interface ParseOnly extends ParseOptionsShared {
	tokens: Token[];
	literals: Iterable<TokenDefinition> | string[];
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
	ignoredLiterals: number;
}

export const parse_info = new Map<string, ParseInfo>();

export function parse(options: ParseOptions): Node[] {
	const max_depth = options.maxNodeDepth ?? 100;
	const max_cycles = options.maxCycles ?? 5;
	const id = options.id;

	const info: ParseInfo = { parseNodeCalls: 0, nodesParsed: 0, ignoredLiterals: 0 };

	if (id) parse_info.set(id, info);

	let position = 0,
		dirtyPosition = 0;

	const raw_tokens = 'tokens' in options ? options.tokens : tokenize(options.source, options.literals);

	const source = options.source ?? raw_tokens.map(token => token.text).join('');

	const tokens: Token[] = [];

	for (let i = 0; i < raw_tokens.length; i++) {
		if (!options.ignoreLiterals.includes(raw_tokens[i].kind)) tokens.push(raw_tokens[i]);
		else if (id) info.ignoredLiterals++;
	}

	const literals = [...options.literals].map(literal => (typeof literal == 'string' ? literal : literal.name));

	const attempts = new Map<string, Node | null>();

	function _issue(level: IssueLevel, message?: string): SourceIssue {
		const token = tokens[position];
		const { stack } = new Error();
		return { id, line: token.line, column: token.column, position: token.position, source, level, message, stack };
	}

	function parseNode(kind: string, parents: string[] = []): Node | null {
		if (id) info.parseNodeCalls++;

		const depth = parents.length;

		if (depth >= max_depth) throw _issue(0, 'Max depth exceeded while parsing ' + kind);

		const log = logger(options.log, { kind, depth });

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
			throw _issue(0, `Possible infinite loop: ${loop.join(' -> ')} -> ...`);
		}

		if (id) info.nodesParsed++;

		if (literals.includes(kind)) {
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
		if (!definition) throw _issue(0, `Definition for "${kind}" not found`);

		const pattern = definition.pattern.map(part => (typeof part === 'string' ? { kind: part, type: 'required' } : part));

		switch (definition.type) {
			case 'alternation': {
				log(1, 'Parsing alternation: ' + kind, ['alternation', 'start']);
				for (const option of pattern) {
					log(3, 'Attempting to parse alteration: ' + option.kind, ['alternation', 'attempt']);
					const node = parseNode(option.kind, [...parents, kind]);
					if (node) {
						log(3, `Resolved ${kind} to ${node.kind}`, ['alternation', 'resolve']);
						return _cache(node);
					}
				}
				log(1, 'Warning: No matches for alternation', ['alternation', 'fail']);
				return null;
			}
			case 'sequence': {
				const children: Node[] = [];

				const start = position;
				const token = tokens[position];

				log(1, 'Parsing sequence: ' + kind, ['sequence', 'start']);
				for (const part of pattern) {
					log(3, 'Attempting to parse sequence part: ' + part.kind, ['sequence', 'attempt']);
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
						log(2, `Parsed ${node.kind} at ${node.line}:${node.column}`, ['sequence']);
						children.push(node);
					} else if (part.type != 'optional') {
						log(2, `Failed to parse "${part.kind}", going back`, ['sequence', 'fail']);
						position = start; // Rollback
						return null;
					}
				}

				log(1, `"${token.kind}" at ${token.line}:${token.column}`, ['sequence', 'resolve']);
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
			throw _issue(0, 'Unexpected ' + token.kind);
		}
		nodes.push(node);
	}
	return nodes;
}
