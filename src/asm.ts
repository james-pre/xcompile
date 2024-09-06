import { readFileSync } from 'node:fs';
import { GenericToken, tokenize } from './tokens';
import { inspect, parseArgs } from 'node:util';

const {
	positionals: [input],
} = parseArgs({
	options: {},
	allowPositionals: true,
});

const genericTokens: GenericToken[] = [
	{ name: 'register', type: 'literal', pattern: /^%\w+/ },
	{ name: 'immediate', type: 'literal', pattern: /^\$(0x)?\d+/ },
	{ name: 'address', type: 'literal', pattern: /^(0x)?\d+/ },
	{ name: 'identifier', type: 'literal', pattern: /^\w+/ },
	{ name: 'whitespace', type: 'literal', pattern: /^\s+/ },
	{ name: 'comma', type: 'literal', pattern: /^,/ },
	{ name: 'operand', type: 'oneof', pattern: ['register', 'immediate', 'address'] },
	{
		name: 'operand_list_continue',
		type: 'composite',
		pattern: [{ kind: ',' }, { kind: 'whitespace', optional: true }, { kind: 'operand' }, { kind: 'operand_list_continue', optional: true }],
	},
	{ name: 'operand_list', type: 'composite', pattern: [{ kind: 'operand' }, { kind: 'operand_list_continue', optional: true }] },
	{ name: 'instruction', type: 'composite', pattern: [{ kind: 'identifier' }, { kind: 'whitespace' }, { kind: 'operand_list', optional: true }] },
];

const source = readFileSync(input, 'utf8');

const tokens = tokenize(source, genericTokens);

for (const token of tokens) {
	console.log(inspect(token, { colors: true, compact: true }));
}
