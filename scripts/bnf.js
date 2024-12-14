#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { inspect, parseArgs } from 'node:util';
import { stringifyNode } from '../dist/parser.js';
import * as bnf from '../dist/bnf.js';

const {
	positionals: [input],
	values: options,
} = parseArgs({
	options: {
		format: { short: 'f', type: 'string', default: 'js' },
		output: { short: 'o', type: 'string' },
		colors: { short: 'c', type: 'boolean' },
		tokens: { short: 'T', type: 'string' },
		parser: { short: 'P', type: 'string' },
		verbose: { short: 'V', type: 'boolean', multiple: true },
		help: { short: 'h', type: 'boolean', default: false },
	},
	allowPositionals: true,
});

if (options.help || !input) {
	console.log(`Usage: xcompile-bnf [options] <file>\n
Output options:
    --format,-f <format=js>  Output format (js, json)
    --output,-o <path>       Path to an output file
    --colors,-c              Colorize output messages
    --help,-h                Display this help message  
Debugging options:
    --tokens,-T [only]       Show tokenizer output. If 'only', only the tokenizer output will be shown.
    --parser,-P [only]       Show parser output. If 'only', only the parser output will be shown.
    --verbose,-V             Show verbose output. If passed multiple times, increases the verbosity level.
`);
	process.exit(0);
}

if (options.tokens == 'only' && options.parser == 'only') {
	console.error('Error: Can not use `--tokens only` and `--parser only`');
	process.exit(1);
}

if ((options.tokens == 'only' || options.parser == 'only') && (options.format || options.colors || options.output)) {
	console.error('Error: Can not use `--tokens only` or `--parser only` with output');
	process.exit(1);
}

function logger(outputLevel) {
	return function (level, message, depth) {
		if (level > outputLevel) return;

		console.log(' '.repeat(4 * depth) + (level > 1 ? '[debug] ' : '') + message);
	};
}

const verbose = options.verbose?.filter(Boolean)?.length ?? 0;

const tokens = bnf.tokenize(readFileSync(input, 'utf8'));

if (options.tokens) {
	for (const token of tokens) {
		console.log(stringifyNode(token));
	}
	if (options.tokens == 'only') process.exit(0);
}

const ast = bnf.parse(tokens, logger(parseInt(options.ast)));

if (options.ast) {
	for (const node of ast) {
		console.log(stringifyNode(node));
	}
	if (options.parser == 'only') process.exit(0);
}

const config = bnf.convert(ast[0], logger(verbose));

const write = data => (options.output ? writeFileSync(options.output, data) : console.log);

switch (options.format) {
	case 'json':
		write(JSON.stringify(config, (key, value) => (value instanceof RegExp ? value.source.slice(1) : value)));
		break;
	case 'js':
		write(inspect(config, { colors: options.colors, depth: null }));
		break;
	default:
		console.error('Unsupported output format:', options.format);
		process.exit(1);
}
