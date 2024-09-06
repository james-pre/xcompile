import { readFileSync } from 'node:fs';
import { TokenDefinition, tokenize } from './tokens';
import { inspect, parseArgs } from 'node:util';
import type { NodeDefinition } from './parser';

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
	{ name: 'whitespace', pattern: /^\s+/ },
	{ name: 'comma', pattern: /^,/ },
];

const nodeDefinitions: NodeDefinition[] = [
	{ name: 'operand', type: 'oneof', pattern: ['register', 'immediate', 'address'] },
	{
		name: 'operand_list_continue',
		type: 'composite',
		pattern: ['comma', { kind: 'whitespace', optional: true }, 'operand', { kind: 'operand_list_continue', optional: true }],
	},
	{ name: 'operand_list', type: 'composite', pattern: ['operand', { kind: 'operand_list_continue', optional: true }] },
	{ name: 'instruction', type: 'composite', pattern: ['identifier', 'whitespace', { kind: 'operand_list', optional: true }] },
];

const source = readFileSync(input, 'utf8');

const tokens = tokenize(source, tokenDefinitions);

console.log('Tokens:\n');
for (const token of tokens) {
	console.log(inspect(token, { colors: true, compact: true }));
}
