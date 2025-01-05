import type { Common as CommonConfig } from './config.js';
import { type IssueLevel, type Issue, is_issue } from './issue.js';
import type { Token, TokenDefinition } from './tokens.js';
import { tokenize } from './tokens.js';

export interface DefinitionPart {
	kind: string;
	type: 'required' | 'optional' | 'repeated';
}

export type DefinitionType = 'alternation' | 'sequence';

export interface NodeAttributes {
	[k: string]: string | number | boolean;
}

export interface NodeDefinition {
	name: string;
	type: DefinitionType;
	attributes: NodeAttributes;
	pattern: (string | DefinitionPart)[];
}

export interface PureNodeDefinition extends NodeDefinition {
	pattern: DefinitionPart[];
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

export type LogFn = (info: LogInfo | Issue) => void;

export type Logger = { (level: number, message: string, tags?: string[]): void; (issue: Issue): void };

export function logger(log: LogFn | undefined, options: Partial<LogInfo> & Pick<LogInfo, 'kind' | 'depth'>): Logger {
	if (!log) return () => {};

	function __log__(level: number, message: string, tags?: string[]): void;
	function __log__(issue: Issue): void;
	function __log__(level: number | Issue, message: string = '<unknown>', tags: string[] = []): void {
		if (is_issue(level)) {
			log!(level);
			return;
		}

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

		log!({ ...options, level, message, type, event: stage });
	}

	return __log__;
}

export interface ParseOptionsShared extends CommonConfig {
	definitions: NodeDefinition[];
	maxNodeDepth?: number;
	maxCycles?: number;
	log?: LogFn;
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

export interface AST {
	nodes: Node[];
	source: string;
}

export function parse(options: ParseOptions): AST {
	const max_depth = options.maxNodeDepth ?? 100;
	const max_cycles = options.maxCycles ?? 5;
	const id = options.id;

	const info: ParseInfo = { parseNodeCalls: 0, nodesParsed: 0, ignoredLiterals: 0 };

	if (id) parse_info.set(id, info);

	let position = 0,
		dirtyPosition = 0;

	const raw_tokens = 'tokens' in options ? options.tokens : tokenize(options.source, options.literals, id);

	const source = options.source ?? raw_tokens.map(token => token.text).join('');

	const tokens: Token[] = [];

	for (let i = 0; i < raw_tokens.length; i++) {
		if (!options.ignored_literals.includes(raw_tokens[i].kind)) tokens.push(raw_tokens[i]);
		else if (id) info.ignoredLiterals++;
	}

	const literals = [...options.literals].map(literal => (typeof literal == 'string' ? literal : literal.name));

	const attempts = new Map<string, Node | null>();

	function _issue(level: IssueLevel, message?: string): Issue {
		const token = tokens[dirtyPosition || position];
		const { stack } = new Error();
		return { location: token, source, level, message, stack };
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
				log(1, 'No matches for alternation', ['alternation', 'fail']);
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
		for (const root of options.root_nodes) {
			node = parseNode(root);
			if (node) break;
		}
		if (!node) {
			if (position >= tokens.length && options.ignored_literals.includes(tokens.at(-1)!.kind)) break;
			const token = tokens[dirtyPosition || position];
			throw _issue(0, 'Unexpected ' + token.kind);
		}
		nodes.push(node);
	}
	return { nodes, source };
}
