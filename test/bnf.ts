import { readFileSync } from 'node:fs';
import { inspect, parseArgs } from 'node:util';
import { stringifyNode } from '../src/parser';
import { convertAst, parseBnfAst } from '../src/bnf';

const {
	positionals: [input],
	values: options,
} = parseArgs({
	options: {
		verbose: { type: 'boolean', short: 'v', multiple: true },
		ast: { type: 'boolean', short: 'a' },
	},
	allowPositionals: true,
});

const verbose = options.verbose?.filter(Boolean)?.length ?? 0;

const ast = parseBnfAst(readFileSync(input, 'utf8'), options.ast ? verbose : 0);

if (options.ast) {
	for (const node of ast) {
		console.log(stringifyNode(node));
	}
	process.exit();
}

console.log(inspect(convertAst(ast[0], verbose), { colors: true, depth: null }));
