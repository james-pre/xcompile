import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parse, stringifyNode } from '../src/parser';
import { tokenize } from '../src/tokens';

const {
	positionals: [input],
	values: options,
} = parseArgs({
	options: {
		verbose: { type: 'boolean', short: 'v', multiple: true },
	},
	allowPositionals: true,
});

const verbose = options.verbose?.filter(Boolean)?.length ?? 0;

const ast = parse({
	source: readFileSync(input, 'utf8'),
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
	debug: verbose ? console.debug : undefined,
	verbose: +verbose > 1 ? console.debug : undefined,
});

console.log('AST:\n');
for (const node of ast) {
	console.log(stringifyNode(node));
}
