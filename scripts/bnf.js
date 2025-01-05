#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import * as bnf from '../dist/bnf.js';
import { stringify_node } from '../dist/parser.js';
import { is_issue, stringify_issue } from '../dist/issue.js';
import { dirname, parse, resolve } from 'node:path/posix';
import { compress as compress_config } from '../dist/config.js';

const {
	positionals: [input],
	values: options,
} = parseArgs({
	options: {
		output: { short: 'o', type: 'string' },
		colors: { short: 'c', type: 'boolean' },
		tokens: { short: 'T', type: 'string' },
		parser: { short: 'P', type: 'string' },
		verbose: { short: 'V', type: 'boolean', multiple: true },
		help: { short: 'h', type: 'boolean', default: false },
		compress: { type: 'boolean', default: false },
		trace: { type: 'boolean' },
		'visual-depth': { type: 'string', default: '0' },
	},
	allowPositionals: true,
});

if (options.help || !input) {
	console.log(`Usage: xcompile-bnf [options] <file>\n
Output options:
    --output,-o <path>       Path to an output file
    --colors,-c              Colorize output messages
    --help,-h                Display this help message  
    --compress               Compress the output config
Debugging options:
    --tokens,-T [only]       Show tokenizer output. If 'only', only the tokenizer output will be shown.
    --parser,-P [only]       Show parser output. If 'only', only the parser output will be shown.
    --verbose,-V             Show verbose output. If passed multiple times, increases the verbosity level.
    --visual-depth <size>    Display depth visually using indentation, using 
    --trace                  Show issue origin`);
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

const depth_indentation = parseInt(options['visual-depth']) || 0;

function logger(outputLevel) {
	return function __log(entry) {
		if (is_issue(entry)) {
			console.error(stringify_issue(entry, options));
			return;
		}

		const { level, message, depth } = entry;

		if (outputLevel < level) return;

		const debug = level > 2 ? 'debug' : '';

		const header = depth_indentation ? `${' '.repeat(depth_indentation)}(${debug})` : `[${depth} ${debug}]`;

		console.log(header + ' ' + message);
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
	console.error(is_issue(e) ? stringify_issue(e, options) : e.message);
	process.exit(1);
}

if (options.tokens) {
	for (const token of tokens) {
		console.log(stringify_node(token));
	}
	if (options.tokens == 'only') process.exit(0);
}

const parseLogger = logger(options.parser ? parseInt(options.parser) : 0);

let ast;
try {
	ast = bnf.parse(tokens, parseLogger);
} catch (e) {
	console.error(is_issue(e) ? stringify_issue(e, options) : e.message);
	process.exit(1);
}

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
		console.error(is_issue(e) ? stringify_issue(e, options) : e.message);
		process.exit(1);
	}
}

let config = bnf.create_config(ast, { log: logger(verbose), include });

if (options.compress) config = compress_config(config);

writeFileSync(
	options.output || parse(input).name + '.json',
	JSON.stringify({
		...config,
		literals: config.literals.map(literal => {
			const base = {
				name: literal.name,
				pattern: literal.pattern.source.slice(1),
			};

			const { flags } = literal.pattern;

			return flags.length ? { ...base, flags } : base;
		}),
	})
);
