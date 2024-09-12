import { type DefinitionPart, type Node, type NodeDefinition, parse } from './parser';
import type { TokenDefinition } from './tokens';

export function parseBnfAst(source: string, verbose: number = 0): Node[] {
	return parse({
		source,
		literals: [
			{ name: 'identifier', pattern: /^[a-zA-Z_]\w*/ }, // Matches rule names like `identifier`, `register`, etc.
			{ name: 'string', pattern: /^"[^"]*"/ }, // Quoted literals like `"0x"`, `"%"`, etc.
			{ name: 'equal', pattern: /^=/ }, // Equals sign (`=`)
			{ name: 'pipe', pattern: /^\|/ }, // Pipe (alternation)
			{ name: 'comma', pattern: /^,/ }, // Comma (sequence separator)
			{ name: 'semicolon', pattern: /^;/ }, // Semicolon (end of rule)
			{ name: 'left_paren', pattern: /^\(/ }, // parenthesized start
			{ name: 'right_paren', pattern: /^\)/ }, // parenthesized end
			{ name: 'left_brace', pattern: /^\{/ }, // repetition start
			{ name: 'right_brace', pattern: /^\}/ }, // repetition end
			{ name: 'left_bracket', pattern: /^\[/ }, // optional start
			{ name: 'right_bracket', pattern: /^\]/ }, // optional end
			{ name: 'whitespace', pattern: /^[ \t]+/ }, // Whitespace
			{ name: 'line_terminator', pattern: /^[\n;]+/ }, // Newlines or semicolons as line terminators
		],
		ignoreLiterals: ['whitespace'],
		definitions: [
			// BNF Rule Definition: identifier = expression ;
			{
				name: 'rule',
				type: 'sequence',
				pattern: ['identifier', 'equal', 'expression', 'semicolon'],
			},
			// Expression: Sequence of terms separated by '|'
			{ name: 'expression_continue', type: 'sequence', pattern: ['pipe', 'term'] },
			{
				name: 'expression',
				type: 'sequence',
				pattern: ['term', { kind: 'expression_continue', type: 'repeated' }],
			},
			// Term: Sequence of factors separated by commas
			{ name: 'term_continue', type: 'sequence', pattern: ['comma', 'factor'] },
			{
				name: 'term',
				type: 'sequence',
				pattern: ['factor', { kind: 'term_continue', type: 'repeated' }],
			},
			// Factor: A factor is either a string, identifier, or a group (repetition, optional)
			{
				name: 'factor',
				type: 'oneof',
				pattern: ['string', 'identifier', 'group'],
			},
			// Group: {...} or [...] for repetition or optional
			{
				name: 'group',
				type: 'oneof',
				pattern: ['repetition', 'optional', 'parenthesized'],
			},
			{
				name: 'parenthesized',
				type: 'sequence',
				pattern: ['left_paren', 'expression', 'right_paren'],
			},
			{
				name: 'repetition',
				type: 'sequence',
				pattern: ['left_brace', 'expression', 'right_brace'],
			},
			{
				name: 'optional',
				type: 'sequence',
				pattern: ['left_bracket', 'expression', 'right_bracket'],
			},
			// Rule list: Set of BNF rules separated by newlines or semicolons
			{ name: 'rule_list_continue', type: 'sequence', pattern: [{ kind: 'rule', type: 'optional' }, 'line_terminator'] },
			{
				name: 'rule_list',
				type: 'sequence',
				pattern: ['rule', { kind: 'rule_list_continue', type: 'repeated' }],
			},
		],
		rootNode: 'rule_list',
		debug: verbose > 1 ? console.debug : undefined,
		verbose: verbose > 2 ? console.debug : undefined,
	});
}

const typeForGroup = {
	left_bracket: 'optional',
	left_brace: 'repeated',
	left_paren: 'required',
} as const;

export function convertAst(ast: Node, verbose: number = 0): { definitions: NodeDefinition[]; literals: TokenDefinition[] } {
	function _log(level: number, depth: number, message: string) {
		if (level <= verbose) {
			console.debug('  '.repeat(depth), message);
		}
	}

	const definitions: NodeDefinition[] = [];
	const literals: TokenDefinition[] = [];

	let isOneOf = false,
		currentNode: string,
		groups = 0;

	function processNode(node: Node, depth: number = 0) {
		const log = (level: number, text: string) => _log(level, depth, text);
		log(3, `Processing ${node.kind} at ${node.line}:${node.column}`);
		if (node.kind != 'rule') {
			// Recursively process child nodes
			for (const child of node.children || []) {
				processNode(child, depth + 1);
			}
			return;
		}

		// Extract the rule name (identifier) and its expression
		const name = node.children?.find((child) => child.kind === 'identifier')?.text;
		const expression = node.children?.find((child) => child.kind === 'expression');

		log(2, `Found rule "${name}" at ${node.line}:${node.column}`);
		if (!name || !expression) {
			log(1, 'Rule is missing name or expression');
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
				"[ \\t]+": /[ \t]+/ (literal)
				ws: [ { kind: "[ \\t]+", required: true } ] (definition)
			This collapses it, so we have
				ws: /[ \t]+/ (literal)
		*/
		const maybeLiteral = pattern[0].kind.replace(/^"|"$/g, '');
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
			pattern: pattern.map((part) => (typeof part === 'string' ? { kind: part, type: 'required' } : part)),
		});
	}

	function processExpression(expression: Node, depth: number = 0): DefinitionPart[] {
		isOneOf = false;
		const log = (level: number, text: string) => _log(level, depth, text);
		const pattern: DefinitionPart[] = [];

		for (const term of expression.children || []) {
			if (term.kind == 'pipe') {
				isOneOf = true;
				log(2, 'Found pipe in expression (error/invalid?)');
				continue;
			}

			if (term.kind == 'expression_continue') {
				log(2, 'Found expression_continue');
				pattern.push(...processExpression(term, depth + 1));
				isOneOf = true;
				continue;
			}

			if (term.kind != 'term' && term.kind != 'term_continue') {
				log(2, 'Invalid expression child');
				continue;
			}

			log(2, `Parsing term at ${term.line}:${term.column}`);
			if (!term.children?.length) {
				log(2, 'Term has no children');
				continue;
			}
			for (let factor of term.children) {
				if (factor.kind == 'term_continue') {
					factor = factor.children![1];
				}
				const node = factor.children?.[0] ?? factor;

				log(2, `Parsing ${node.kind} "${node.text}" at ${node.line}:${node.column}`);
				switch (node.kind) {
					case 'string': {
						const text = node.text.replace(/^"|"$/g, ''); // Strip quotes
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
							log(1, 'Missing inner expression');
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

						// Increment the group counter
						const groupCount = ++groups;

						// Determine the new rule name based on whether it's the only group
						const subName = groupCount === 1 ? `${currentNode}_${type}` : `${currentNode}_group_${groupCount}`;

						definitions.push({
							name: subName,
							type: 'sequence',
							pattern: subPattern,
						});

						// Append the new rule name to the pattern, marked as optional or repeated
						pattern.push({ kind: subName, type });

						break;
					}
					default:
						log(1, `Unexpected kind "${node.kind}" of factor child`);
						break;
				}
			}
		}

		return pattern;
	}

	// Start processing from the root node
	processNode(ast);

	return { definitions, literals };
}
