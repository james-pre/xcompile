import rawConfig from './bnf.json' with { type: 'json' };
import * as config from './config.js';
import type { DefinitionPart, Logger, Node, NodeDefinition } from './parser.js';
import { parse } from './parser.js';
import type { Token, TokenDefinition } from './tokens.js';
import { tokenize } from './tokens.js';

export const { literals, definitions, ignoreLiterals, rootNode } = config.parseJSON(rawConfig as config.Json);

/**
 * Shortcut for tokenize(source, bnf.literals);
 */
function tokenizeBnf(source: string): Token[] {
	return tokenize(source, literals);
}

export { tokenizeBnf as tokenize };

export function parseSource(source: string, log?: Logger): Node[] {
	return parse({ ignoreLiterals, definitions, rootNode, log, source, literals });
}

function parseBnf(tokens: Token[], log?: Logger): Node[] {
	return parse({ ignoreLiterals, definitions, rootNode, log, tokens, literals: literals.map(t => t.name) });
}

export { parseBnf as parse };

const typeForGroup = {
	left_bracket: 'optional',
	left_brace: 'repeated',
	left_paren: 'required',
} as const;

export function ast_to_config(ast: Node[], log: Logger = () => {}): config.Config {
	const definitions: NodeDefinition[] = [],
		literals: TokenDefinition[] = [],
		ignoreLiterals: string[] = [];

	let isOneOf = false,
		currentNode: string,
		rootNode: string | undefined,
		groups = 0;

	function processNode(node: Node, depth: number = 0) {
		const _log = (level: number, text: string) => log(level, text, depth);
		_log(3, `Processing ${node.kind} at ${node.line}:${node.column}`);

		if (node.kind == 'directive') {
			const [, directive, contents] = node.text.match(/##(\w+) (.*)/i)!;

			switch (directive) {
				case 'root':
					if (rootNode) _log(0, `Warning: overwriting root node ("${rootNode}" -> "${contents}")`);
					rootNode = contents;
					break;
				case 'ignore':
					ignoreLiterals.push(...contents.split(/[ ,;]/));
					break;
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

		const pattern = processExpression(expression, depth + 1);

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
		const index = literals.findIndex(({ name }) => name == maybeLiteral);
		if (index != -1 && pattern.length == 1 && pattern[0].type == 'required') {
			literals.splice(index, 1, {
				name,
				pattern: new RegExp('^' + maybeLiteral),
			});
			return;
		}

		// Add the NodeDefinition for this rule
		definitions.push({
			name,
			type: isOneOf ? 'oneof' : 'sequence',
			pattern: pattern.map(part => (typeof part === 'string' ? { kind: part, type: 'required' } : part)),
		});
	}

	function processExpression(expression: Node, depth: number = 0): DefinitionPart[] {
		isOneOf = false;
		const _log = (level: number, text: string) => log(level, text, depth);
		const pattern: DefinitionPart[] = [];

		for (const term of expression.children || []) {
			if (term.kind == 'pipe') {
				isOneOf = true;
				_log(2, 'Found pipe in expression');
				continue;
			}

			if (term.kind == 'expression_continue' || term.kind == 'expression#0') {
				_log(2, 'Found expression_continue');
				pattern.push(...processExpression(term, depth + 1));
				isOneOf = true;
				continue;
			}

			if (term.kind != 'term' && term.kind != 'term_continue' && term.kind != 'term#0') {
				_log(2, 'Invalid expression child: ' + term.kind);
				continue;
			}

			_log(2, `Parsing term at ${term.line}:${term.column}`);
			if (!term.children?.length) {
				_log(2, 'Term has no children');
				continue;
			}
			for (let factor of term.children) {
				if (factor.kind == 'term_continue' || factor.kind == 'term#0') {
					factor = factor.children![1];
				}
				const node = factor.children?.[0] ?? factor;

				_log(2, `Parsing ${node.kind} "${node.text}" at ${node.line}:${node.column}`);
				switch (node.kind) {
					case 'string': {
						const quote = node.text.charAt(0); // either ' or "

						// Remove the surrounding quotes
						const text = node.text.slice(1, -1).replaceAll('\\' + quote, quote);

						literals.push({ name: text, pattern: new RegExp('^' + text) });
						pattern.push({ kind: text, type: 'required' });
						break;
					}
					case 'identifier':
						pattern.push({ kind: node.text, type: 'required' });
						break;
					case 'left_bracket':
					case 'left_brace':
					case 'left_paren': {
						const inner = factor.children?.find(({ kind }) => kind == 'expression');
						if (!inner) {
							_log(1, 'Missing inner expression');
							break;
						}

						const type = typeForGroup[node.kind];

						const subPattern = processExpression(inner, depth + 1);

						// Check if subPattern contains another rule name, if so, no need to create a new group
						const existing = subPattern.length == 1 && subPattern[0].kind !== 'string' ? subPattern[0].kind : null;
						if (existing) {
							pattern.push({ kind: existing, type });
							break;
						}

						const subName = `${currentNode}#${groups++}`;

						definitions.push({
							name: subName,
							type: isOneOf ? 'oneof' : 'sequence',
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

		return pattern;
	}

	// Start processing from the root node
	for (const node of ast) {
		processNode(node);
	}

	if (!rootNode) {
		throw 'Missing root node';
	}

	return { definitions, literals, rootNode, ignoreLiterals };
}
