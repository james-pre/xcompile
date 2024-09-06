import { readFileSync } from 'node:fs';
import { GenericToken, tokenize } from './tokenizer';
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
	{ name: 'instruction', type: 'literal', pattern: /^\w+/ },
	{ name: 'whitespace', type: 'literal', pattern: /^\s+/ },
	{ name: 'comma', type: 'literal', pattern: /^,/ },
	{ name: 'operand', type: 'union', pattern: ['register', 'immediate', 'address'] },
	{ name: 'operand_list_continue', type: 'composite', pattern: [{ kind: ',' }, { kind: 'operand' }, { kind: 'operand_list_continue', optional: true }] },
	{ name: 'operand_list', type: 'composite', pattern: [{ kind: 'operand' }, { kind: 'operand_list_continue', optional: true }] },
];

const source = readFileSync(input, 'utf8');

const tokens = tokenize(source, genericTokens);

for (const token of tokens) {
	console.log(inspect(token, { colors: true, compact: true }));
}
