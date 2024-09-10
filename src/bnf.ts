import { type Node, type NodeDefinition, type DefinitionPart, parse } from './parser';
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
			{ name: 'left_brace', pattern: /^\{/ }, // Left brace (repetition `{}`)
			{ name: 'right_brace', pattern: /^\}/ }, // Right brace (repetition end)
			{ name: 'left_bracket', pattern: /^\[/ }, // Left bracket (optional `[]`)
			{ name: 'right_bracket', pattern: /^\]/ }, // Right bracket (optional end)
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
				pattern: ['repetition', 'optional'],
			},
			// Repetition: { expression }
			{
				name: 'repetition',
				type: 'sequence',
				pattern: ['left_brace', 'expression', 'right_brace'],
			},
			// Optional: [ expression ]
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

export function convertAst(ast: Node, verbose: number = 0): { definitions: NodeDefinition[]; literals: TokenDefinition[] } {
	function _log(level: number, depth: number, message: string) {
		if (level >= verbose) {
			console.debug('  '.repeat(depth), message);
		}
	}

	const definitions: NodeDefinition[] = [];
	const literals: TokenDefinition[] = [];

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

		// Convert the expression node to a pattern
		const pattern = processExpression(expression, depth + 1);

		// Add the NodeDefinition for this rule
		definitions.push({
			name,
			type: pattern.some((part) => part.kind === 'pipe') ? 'oneof' : 'sequence',
			pattern: pattern.map((part) => (typeof part === 'string' ? { kind: part, type: 'required' } : part)),
		});
	}

	function processExpression(expression: Node, depth: number = 0): DefinitionPart[] {
		const log = (level: number, text: string) => _log(level, depth, text);
		const pattern: DefinitionPart[] = [];
		let inOneOf = false; // To track whether we're in an alternation (`|`)

		for (const child of expression.children || []) {
			if (child.kind == 'pipe') {
				inOneOf = true;
				log(2, 'Found pipe in expression');
				continue;
			}

			if (child.kind != 'term' && child.kind != 'term_continue') {
				log(2, 'Expression child not term or term_continue');
				continue;
			}

			log(2, `Parsing factor: ${child.kind} "${child.text}" at ${child.line}:${child.column}`);
			for (const factor of child.children || []) {
				const factorChild = factor.children?.[0];

				if (!factorChild) continue; // Skip if there's no factorChild

				log(2, `Parsing factor child: ${factorChild.kind} "${factorChild.text}" at ${factorChild.line}:${factorChild.column}`);
				switch (factorChild.kind) {
					case 'string': {
						const literalText = factorChild.text.replace(/^"|"$/g, ''); // Strip quotes
						literals.push({
							name: literalText,
							pattern: new RegExp(`^${literalText}`),
						});
						pattern.push({ kind: literalText, type: 'required' });
						break;
					}
					case 'identifier':
						pattern.push({ kind: factorChild.text, type: 'required' });
						break;
					case 'left_bracket':
					case 'left_brace': {
						const innerExpression = factor.children?.find((grandchild: Node) => grandchild.kind === 'expression');
						if (innerExpression) {
							const subPattern = processExpression(innerExpression, depth + 1);
							const repeatType = factorChild.kind === 'left_bracket' ? 'optional' : 'repeated';
							subPattern.forEach((sub) => pattern.push({ ...sub, type: repeatType }));
						}
						break;
					}
					default:
						log(1, `Unexpected kind "${factorChild.kind}" of factor child`);
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
