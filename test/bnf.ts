import { readFileSync } from 'node:fs';
import { inspect, parseArgs } from 'node:util';
import { parse, stringifyNode } from '../src/parser';
import { convertAst, parseBnfAst } from '../src/bnf';

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

const ast = parseBnfAst(readFileSync(input, 'utf8'), verbose);

if (verbose) {
	console.log('AST:\n');
	for (const node of ast) {
		console.log(stringifyNode(node));
	}
}

for (const node of ast) {
	console.log(inspect(convertAst(node), { colors: true }));
}
