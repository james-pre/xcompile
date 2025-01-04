import rawConfig from './bnf.json' with { type: 'json' };
import * as config from './config.js';
import type { DefinitionPart, Logger, Node, PureNodeDefinition } from './parser.js';
import { logger, parse } from './parser.js';
import type { Token, TokenDefinition } from './tokens.js';
import { tokenize } from './tokens.js';

export const { literals, definitions, ignoreLiterals, rootNodes } = config.parseJSON(rawConfig as config.Json);

/**
 * Shortcut for tokenize(source, bnf.literals);
 */
function tokenizeBnf(source: string): Token[] {
	return tokenize(source, literals);
}

export { tokenizeBnf as tokenize };

export function parseSource(source: string, log?: Logger): Node[] {
	return parse({ ignoreLiterals, definitions, rootNodes, log, source, literals });
}

function parseBnf(tokens: Token[], log?: Logger): Node[] {
	return parse({ ignoreLiterals, definitions, rootNodes, log, tokens, literals: literals.map(t => t.name) });
}

export { parseBnf as parse };

const typeForGroup = {
	left_bracket: 'optional',
	left_brace: 'repeated',
	left_paren: 'required',
} as const;

export function ast_to_config(ast: Node[], log: Logger = () => {}, include?: (name: string) => Node[]): config.Config {
	const definitions: PureNodeDefinition[] = [],
		literals: TokenDefinition[] = [],
		ignoreLiterals: string[] = [],
		rootNodes: string[] = [];

	let currentNode: string,
		groups = 0;

	function processNode(node: Node, depth: number = 0) {
		const _log = logger(log, { kind: node.kind, depth });

		_log(3, `Processing ${node.kind} at ${node.line}:${node.column}`);

		if (node.kind == 'directive') {
			const [, directive, contents] = node.text.match(/##(\w+) (.*)/i)!;

			switch (directive) {
				case 'root':
					rootNodes.push(...contents.split(/[ ,;]/));
					break;
				case 'ignore':
					ignoreLiterals.push(...contents.split(/[ ,;]/));
					break;
				case 'include':
					if (!include) {
						_log(0, 'Warning: Missing include()');
						break;
					}
					_log(1, 'Including: ' + contents);
					for (const node of include(contents)) {
						processNode(node, depth + 1);
					}
					break;
				// ##flags <rule> <flags>
				case 'flags': {
					const [, name, flags] = contents.match(/(\w+)\s+(\w+)/) || [];
					const literal = literals.find(({ name: n }) => n == name);
					if (!literal) {
						_log(0, 'Warning: ##flags references missing literal: ' + name);
						break;
					}

					literal.pattern = new RegExp(literal.pattern.source, flags);

					break;
				}
				// ##groups <rule> <name 0> <name 1> ... <name n>
				case 'groups': {
					const [, name, _names] = contents.match(/(\w+)\s+(.+)/) || [];
					const groupNames = _names.split(/[\s,]+/);
					const rule = definitions.find(d => d.name == name);
					if (!rule) {
						_log(0, 'Warning: ##groups: missing rule ' + JSON.stringify(name));
						break;
					}
					for (let i = 0; i < groupNames.length; i++) {
						const group = definitions.find(d => d.name == name + '#' + i);

						if (!group) {
							_log(0, 'Warning: ##groups: missing group ' + i);
							break;
						}

						const new_name = groupNames[i].replaceAll('%', name);

						for (const part of definitions.flatMap(d => d.pattern)) {
							if (part.kind == group.name) {
								part.kind = new_name;
							}
						}

						_log(1, `Renaming group: ${group.name} -> ${new_name}`);
						group.name = new_name;
					}
					break;
				}
				default:
					_log(0, 'Warning: unsupported directive: ' + directive);
			}

			return;
		}

		if (node.kind != 'rule') {
			// Recursively process child nodes
			for (const child of node.children || []) {
				processNode(child, depth + 1);
			}
			return;
		}

		// Extract the rule name (identifier) and its expression
		const name = node.children?.find(child => child.kind === 'identifier')?.text;
		const expression = node.children?.find(child => child.kind === 'expression');

		_log(2, `Found rule "${name}" at ${node.line}:${node.column}`);
		if (!name || !expression) {
			_log(1, 'Rule is missing name or expression');
			return;
		}

		currentNode = name;
		groups = 0;

		const [pattern, isAlternation] = processExpression(expression, depth + 1);

		/*
			Inline single-use literals
			For example:
			`ws = "[ \t]+";`
			Gets converted to
				"[ \\t]+": /[ \t]+/ (a literal)
				ws: [ { kind: "[ \\t]+", required: true } ] (a definition)
			This collapses it, so we have
				ws: /[ \t]+/ (a literal)
		*/

		const maybeLiteral = pattern[0].kind;

		const index = literals.findIndex(l => l.name == maybeLiteral);
		if (index != -1 && pattern.length == 1 && pattern[0].type == 'required' && literals[index].pattern.source.slice(1) == pattern[0].kind) {
			let regex;
			try {
				regex = new RegExp('^' + maybeLiteral);
			} catch (e: any) {
				throw `Invalid literal: ${name}: ${e}`;
			}
			literals.splice(index, 1, {
				name,
				pattern: regex,
			});
			return;
		}

		// Add the NodeDefinition for this rule
		definitions.push({
			name,
			type: isAlternation ? 'alternation' : 'sequence',
			pattern: pattern.map(part => (typeof part === 'string' ? { kind: part, type: 'required' } : part)),
		});
	}

	function processExpression(expression: Node, depth: number = 0): [DefinitionPart[], boolean] {
		let isAlternation = false;

		const _log = logger(log, { kind: expression.kind, depth });

		const pattern: DefinitionPart[] = [];

		for (const term of expression.children || []) {
			if (term.kind == 'pipe') {
				isAlternation = true;
				_log(2, 'Found pipe in expression');
				continue;
			}

			if (term.kind == 'expression_continue' || term.kind == 'expression#0') {
				_log(2, 'Found expression_continue');
				let next;
				[next, isAlternation] = processExpression(term, depth + 1);
				pattern.push(...next);
				continue;
			}

			if (term.kind != 'sequence' && term.kind != 'sequence_continue' && term.kind != 'sequence#0') {
				_log(2, 'Invalid expression child: ' + term.kind);
				continue;
			}

			_log(2, `Parsing sequence at ${term.line}:${term.column}`);
			if (!term.children?.length) {
				_log(2, 'Sequence has no children');
				continue;
			}
			for (const factor of term.children) {
				const node = factor.children?.[0] ?? factor;

				_log(2, `Parsing ${node.kind} "${node.text}" at ${node.line}:${node.column}`);
				switch (node.kind) {
					case 'string': {
						const quote = node.text.charAt(0); // either ' or "

						// Remove the surrounding quotes
						const text = node.text.slice(1, -1).replaceAll('\\' + quote, quote);

						try {
							const regex = new RegExp('^' + text);

							if (!literals.some(l => l.name == text)) {
								literals.push({ name: text, pattern: regex });
							}
						} catch (e: any) {
							throw `Invalid literal: ${text}: ${e.message}`;
						}

						pattern.push({ kind: text, type: 'required' });
						break;
					}
					case 'identifier': {
						const modifer = factor.children?.[1]?.kind;
						pattern.push({ kind: node.text, type: modifer == '\\?' ? 'optional' : modifer == '\\*' ? 'repeated' : 'required' });
						break;
					}
					case 'left_bracket':
					case 'left_brace':
					case 'left_paren': {
						const inner = factor.children?.find(({ kind }) => kind == 'expression');
						if (!inner) {
							_log(1, 'Missing inner expression');
							break;
						}

						const type = typeForGroup[node.kind];

						const [subPattern, isAlternation] = processExpression(inner, depth + 1);

						// Check if subPattern contains another rule name, if so, no need to create a new group
						const existing = subPattern.length == 1 && subPattern[0].kind !== 'string' ? subPattern[0].kind : null;
						if (existing) {
							pattern.push({ kind: existing, type });
							break;
						}

						const subName = `${currentNode}#${groups++}`;

						definitions.push({
							name: subName,
							type: isAlternation ? 'alternation' : 'sequence',
							pattern: subPattern,
						});

						// Append the new rule name to the pattern, marked as optional or repeated
						pattern.push({ kind: subName, type });

						break;
					}
					default:
						_log(1, `Unexpected kind "${node.kind}" of factor child`);
						break;
				}
			}
		}

		return [pattern, isAlternation];
	}

	// Start processing from the root node
	for (const node of ast) {
		processNode(node);
	}

	if (!rootNodes) {
		throw 'Missing root node';
	}

	return { definitions, literals, rootNodes, ignoreLiterals };
}
