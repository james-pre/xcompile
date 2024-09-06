import { readFileSync } from 'node:fs';
import { inspect, parseArgs } from 'node:util';
import { TokenDefinition, tokenize } from './tokens';
import { parse } from './parser';

const {
	positionals: [input],
} = parseArgs({
	options: {},
	allowPositionals: true,
});

const tokenDefinitions: TokenDefinition[] = [
	{ name: 'register', pattern: /^%\w+/ },
	{ name: 'immediate', pattern: /^\$(0x)?\d+/ },
	{ name: 'address', pattern: /^(0x)?\d+/ },
	{ name: 'identifier', pattern: /^\w+/ },
	{ name: 'whitespace', pattern: /^[ 	]+/ },
	{ name: 'line_terminator', pattern: /^[\n;]+/ },
	{ name: 'comma', pattern: /^,/ },
];

const source = readFileSync(input, 'utf8');

const tokens = tokenize(source, tokenDefinitions);

console.log('Tokens:\n');
for (const token of tokens) {
	console.log(inspect(token, { colors: true, compact: true }));
}

const ast = parse({
	tokens,
	literals: ['register', 'immediate', 'address', 'identifier', 'whitespace', 'line_terminator', 'comma'],
	definitions: [
		{ name: 'operand', type: 'oneof', pattern: ['register', 'immediate', 'address'] },
		{
			name: 'operand_list_continue',
			type: 'composite',
			pattern: ['comma', { kind: 'whitespace', optional: true }, 'operand', { kind: 'operand_list_continue', optional: true }],
		},
		{ name: 'operand_list', type: 'composite', pattern: ['operand', { kind: 'operand_list_continue', optional: true }] },
		{ name: 'instruction', type: 'composite', pattern: ['identifier', 'whitespace', { kind: 'operand_list', optional: true }] },
		{
			name: 'instruction_list_continue',
			type: 'composite',
			pattern: ['line_terminator', { kind: 'whitespace', optional: true }, 'instruction', { kind: 'instruction_list_continue', optional: true }],
		},
		{ name: 'instruction_list', type: 'composite', pattern: ['instruction', { kind: 'whitespace', optional: true }, 'instruction_list_continue'] },
	],
	rootNode: 'instruction_list',
});

console.log('\n\nAST:\n');
for (const node of ast) {
	console.log(inspect(node, { colors: true, compact: true, depth: null }));
}
