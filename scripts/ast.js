#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parse, stringifyNode } from '../dist/parser.js';
import { parseJSON as parseJSONConfig } from '../dist/config.js';

const {
	values: options,
	positionals: [input],
} = parseArgs({
	options: {
		verbose: { short: 'V', type: 'boolean', multiple: true },
		config: { short: 'c', type: 'string' },
		help: { short: 'h', type: 'boolean', default: false },
	},
	allowPositionals: true,
});

if (options.help || !input) {
	console.log(`Usage: xcompile-dump-ast [options] <file>
Options:
    --config,-c <path>  Specify the config file 
    --verbose,-V        Show verbose output. If passed multiple times, increases the verbosity level
    --help,-h           Display this help message`);
	process.exit(1);
}

const verbosity = options.verbose?.filter(Boolean)?.length ?? 0;

let config;

try {
	config = parseJSONConfig(JSON.parse(readFileSync(options.config, 'utf-8')));
} catch (e) {
	if ('errno' in e) console.error(e);
	else console.error('Failed to resolve config:', e);

	process.exit(1);
}

const ast = parse({
	...config,
	source: readFileSync(input, 'utf8'),
	log(level, message, depth) {
		if (verbosity < level) return;

		console.log(' '.repeat(4 * depth) + (level > 1 ? '[debug] ' : '') + message);
	},
});

console.log('AST:\n');
for (const node of ast) {
	console.log(stringifyNode(node));
}
