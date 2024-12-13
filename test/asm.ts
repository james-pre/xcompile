import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parse, stringifyNode } from '../src/parser';
import type { NodeDefinition } from '../src/parser';
import type { TokenDefinition } from '../src/tokens';

const {
	positionals: [input],
	values: options,
} = parseArgs({
	options: {
		verbose: { type: 'boolean', short: 'w', default: false },
		json: { type: 'string', short: 'j' },
	},
	allowPositionals: true,
});

if (!input) {
	console.error('Missing input path');
	process.exit(1);
}

let literals = [
	{ name: 'register', pattern: /^%\w+/ },
	{ name: 'immediate', pattern: /^\$(0x)?\d+/ },
	{ name: 'address', pattern: /^(0x)?\d+/ },
	{ name: 'identifier', pattern: /^\w+/ },
	{ name: 'whitespace', pattern: /^[ \t]+/ },
	{ name: 'line_terminator', pattern: /^[\n;]+/ },
	{ name: 'comma', pattern: /^,/ },
];

let definitions = [
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
] satisfies NodeDefinition[];

try {
	if (options.json) {
		const json = JSON.parse(readFileSync(options.json, 'utf-8'));

		literals = json.literals.map(({ name, pattern }) => ({ name, pattern: new RegExp('^' + pattern) }));

		definitions = json.definitions;
	}
} catch (e) {
	if ('errno' in e) console.error(e);
	else console.error('Failed to resolve JSON config:', e);

	process.exit(1);
}

const ast = parse({
	source: readFileSync(input, 'utf8'),
	literals,
	ignoreLiterals: ['whitespace'],
	definitions,
	rootNode: 'instruction_list',
	debug: options.verbose ? console.debug : undefined,
});

console.log('AST:\n');
for (const node of ast) {
	console.log(stringifyNode(node));
}
