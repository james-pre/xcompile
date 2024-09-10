import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parse, stringifyNode } from '../src/parser';

const {
	positionals: [input],
	values: { verbose },
} = parseArgs({
	options: {
		verbose: { type: 'boolean', short: 'w', default: false },
	},
	allowPositionals: true,
});

const ast = parse({
	source: readFileSync(input, 'utf8'),
	literals: [
		{ name: 'register', pattern: /^%\w+/ },
		{ name: 'immediate', pattern: /^\$(0x)?\d+/ },
		{ name: 'address', pattern: /^(0x)?\d+/ },
		{ name: 'identifier', pattern: /^\w+/ },
		{ name: 'whitespace', pattern: /^[ \t]+/ },
		{ name: 'line_terminator', pattern: /^[\n;]+/ },
		{ name: 'comma', pattern: /^,/ },
	],
	definitions: [
		{ name: 'operand', type: 'oneof', pattern: ['register', 'immediate', 'address'] },
		{
			name: 'operand_list_continue',
			type: 'sequence',
			pattern: [{ kind: 'whitespace', type: 'optional' }, 'comma', { kind: 'whitespace', type: 'optional' }, 'operand'],
		},
		{ name: 'operand_list', type: 'sequence', pattern: [{ kind: 'whitespace', type: 'optional' }, 'operand', { kind: 'operand_list_continue', type: 'repeated' }] },
		{ name: 'instruction', type: 'sequence', pattern: ['identifier', { kind: 'operand_list', type: 'optional' }] },
		{
			name: 'instruction_list_continue',
			type: 'sequence',
			pattern: [{ kind: 'line_terminator', type: 'optional' }, { kind: 'whitespace', type: 'optional' }, 'instruction'],
		},
		{ name: 'instruction_list', type: 'sequence', pattern: ['instruction', { kind: 'whitespace', type: 'optional' }, { kind: 'instruction_list_continue', type: 'repeated' }] },
	],
	rootNode: 'instruction_list',
	debug: verbose ? console.debug : undefined,
});

console.log('AST:\n');
for (const node of ast) {
	console.log(stringifyNode(node));
}
