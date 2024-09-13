import { readFileSync } from 'node:fs';
import { inspect, parseArgs } from 'node:util';
import { stringifyNode } from '../src/parser';
import { convertBnf, parseBnf, tokenizeBnf } from '../src/bnf';

const {
	positionals: [input],
	values: options,
} = parseArgs({
	options: {
		verbose: { type: 'boolean', short: 'v', multiple: true },
		colors: { type: 'boolean', short: 'c' },
		format: { type: 'string', short: 'f', default: 'js' },
		stage: { type: 'string', short: 's', default: '' },
	},
	allowPositionals: true,
});

const verbose = options.verbose?.filter(Boolean)?.length ?? 0;

const tokens = tokenizeBnf(readFileSync(input, 'utf8'));

if (options.stage == 'tokens') {
	for (const token of tokens) {
		console.log(stringifyNode(token));
	}
	process.exit();
}

const ast = parseBnf(tokens, options.stage == 'ast' ? verbose : 0);

if (options.stage == 'ast') {
	for (const node of ast) {
		console.log(stringifyNode(node));
	}
	process.exit();
}

const config = convertBnf(ast[0], verbose);

console.log(
	options.format == 'json' ? JSON.stringify(config, (key, value) => (value instanceof RegExp ? value.source : value)) : inspect(config, { colors: options.colors, depth: null })
);
