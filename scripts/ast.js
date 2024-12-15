#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parse, parseInfo, stringifyNode } from '../dist/parser.js';
import { parseJSON as parseJSONConfig } from '../dist/config.js';

const {
	values: options,
	positionals: [input],
} = parseArgs({
	options: {
		verbose: { short: 'V', type: 'boolean', multiple: true },
		quiet: { short: 'q', type: 'boolean', multiple: true },
		info: { short: 'I', type: 'boolean', multiple: true },
		config: { short: 'c', type: 'string' },
		help: { short: 'h', type: 'boolean', default: false },
	},
	allowPositionals: true,
});

if (options.help || !input) {
	console.log(`Usage: xcompile-dump-ast [options] <file>
Options:
    --config,-c <path>  Specify the config file
    --quiet,-q          Don't output the AST
    --info,-I           Output parser info
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

let ast;
try {
	ast = parse({
		...config,
		source: readFileSync(input, 'utf8'),
		log(level, message, depth) {
			if (verbosity < level) return;

			console.log(' '.repeat(4 * depth) + (level > 1 ? '[debug] ' : '') + message);
		},
		id: input,
	});
	if (options.info) {
		const info = parseInfo.get(input);
		console.error('parseNode calls:', info.parseNodeCalls);
	}
} catch (e) {
	console.error('Error: parsing failed:', e);
	if (options.info) {
		const info = parseInfo.get(input);
		console.error('parseNode calls:', info.parseNodeCalls);
	}
	process.exit(1);
}

if (options.quiet) process.exit(0);

for (const node of ast) {
	console.log(stringifyNode(node));
}
