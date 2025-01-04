#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { inspect, parseArgs } from 'node:util';
import * as bnf from '../dist/bnf.js';
import { stringify_node } from '../dist/parser.js';
import { is_issue, stringify_issue } from '../dist/issue.js';
import { dirname, resolve } from 'node:path/posix';
import { compress as compress_config } from '../dist/config.js';

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
		compress: { type: 'boolean', default: false },
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
    --compress               Compress the output config
Debugging options:
    --tokens,-T [only]       Show tokenizer output. If 'only', only the tokenizer output will be shown.
    --parser,-P [only]       Show parser output. If 'only', only the parser output will be shown.
    --verbose,-V             Show verbose output. If passed multiple times, increases the verbosity level.`);
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
	return function ({ level, message, depth }) {
		if (outputLevel < level) return;

		console.log(' '.repeat(4 * depth) + (level > 2 ? '[debug] ' : '') + message);
	};
}

const verbose = options.verbose?.filter(Boolean)?.length ?? 0;

let contents;
try {
	contents = readFileSync(input, 'utf8');
} catch (e) {
	console.error(e.message);
	process.exit(1);
}

let tokens;
try {
	tokens = bnf.tokenize(contents);
} catch (e) {
	if (!is_issue(e)) throw e;

	console.error(stringify_issue(e));
	process.exit(1);
}

if (options.tokens) {
	for (const token of tokens) {
		console.log(stringify_node(token));
	}
	if (options.tokens == 'only') process.exit(0);
}

const parseLogger = logger(options.parser ? parseInt(options.parser) : 0);

const ast = bnf.parse(tokens, parseLogger);

if (options.ast) {
	for (const node of ast) {
		console.log(stringify_node(node));
	}
	if (options.parser == 'only') process.exit(0);
}

function include(path) {
	const fullPath = resolve(dirname(input), path);

	try {
		return bnf.parse(bnf.tokenize(readFileSync(fullPath, 'utf8')), parseLogger);
	} catch (e) {
		console.error(e.message);
		process.exit(1);
	}
}

let config = bnf.ast_to_config(ast, logger(verbose), include);

if (options.compress) config = compress_config(config);

const write = data => (options.output ? writeFileSync(options.output, data) : console.log);

switch (options.format) {
	case 'json':
		write(
			JSON.stringify({
				...config,
				literals: config.literals.map(literal => {
					const base = {
						name: literal.name,
						pattern: literal.pattern.source,
					};

					const { flags } = literal.pattern;

					return flags.length ? { ...base, flags } : base;
				}),
			})
		);
		break;
	case 'js':
		write(inspect(config, { colors: options.colors, depth: null }));
		break;
	default:
		console.error('Unsupported output format:', options.format);
		process.exit(1);
}
