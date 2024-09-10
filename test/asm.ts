import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parse, stringifyNode } from '../src/parser';
import { tokenize } from '../src/tokens';

const {
	positionals: [input],
} = parseArgs({
	options: {},
	allowPositionals: true,
});

const ast = parse({
	tokens: tokenize(readFileSync(input, 'utf8'), [
		{ name: 'register', pattern: /^%\w+/ },
		{ name: 'immediate', pattern: /^\$(0x)?\d+/ },
		{ name: 'address', pattern: /^(0x)?\d+/ },
		{ name: 'identifier', pattern: /^\w+/ },
		{ name: 'whitespace', pattern: /^[ \t]+/ },
		{ name: 'line_terminator', pattern: /^[\n;]+/ },
		{ name: 'comma', pattern: /^,/ },
	]),
	literals: ['register', 'immediate', 'address', 'identifier', 'whitespace', 'line_terminator', 'comma'],
	definitions: [
		{ name: 'operand', type: 'oneof', pattern: ['register', 'immediate', 'address'] },
		{
			name: 'operand_list_continue',
			type: 'composite',
			pattern: [{ kind: 'whitespace', optional: true }, 'comma', { kind: 'whitespace', optional: true }, 'operand', { kind: 'operand_list_continue', optional: true }],
		},
		{ name: 'operand_list', type: 'composite', pattern: [{ kind: 'whitespace', optional: true }, 'operand', { kind: 'operand_list_continue', optional: true }] },
		{ name: 'instruction', type: 'composite', pattern: ['identifier', { kind: 'operand_list', optional: true }] },
		{
			name: 'instruction_list_continue',
			type: 'composite',
			pattern: [{ kind: 'line_terminator', optional: true }, { kind: 'whitespace', optional: true }, 'instruction', { kind: 'instruction_list_continue', optional: true }],
		},
		{ name: 'instruction_list', type: 'composite', pattern: ['instruction', { kind: 'whitespace', optional: true }, { kind: 'instruction_list_continue', optional: true }] },
	],
	rootNode: 'instruction_list',
});

console.log('AST:\n');
for (const node of ast) {
	console.log(stringifyNode(node));
}
