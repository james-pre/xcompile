#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parse, parseInfo, stringifyNode } from '../dist/parser.js';
import { parseJSON as parseJSONConfig } from '../dist/config.js';
import { tokenize } from '../dist/tokens.js';

const {
	values: options,
	positionals: [input],
} = parseArgs({
	options: {
		verbose: { short: 'V', type: 'boolean', multiple: true },
		debug: { short: 'D', type: 'string', multiple: true },
		quiet: { short: 'q', type: 'boolean', default: false },
		info: { short: 'I', type: 'boolean', default: false },
		config: { short: 'c', type: 'string' },
		help: { short: 'h', type: 'boolean', default: false },
		ast: { short: 'A', type: 'boolean', default: false },
		tokens: { short: 'T', type: 'boolean', default: false },
		mode: { short: 'm', type: 'string', default: 'normal' },
		debug: { short: 'D', type: 'string', multiple: true, default: [] },
	},
	allowPositionals: true,
});

if (options.help || !input) {
	console.log(`Usage: xcompile-dump [options] <file>
Options:
    --ast,-A             Output the AST
    --tokens,-T          Output tokens
    --mode,-m <mode>     Controls --tokens output.
                             normal: Output tokens, excluding ignored literals (default)
                             all: Output all tokens, even ignored literals
    --config,-c <path>   Specify the config file
    --quiet,-q           Don't output the AST
    --info,-I            Output parser info
    --verbose,-V         Show verbose output. If passed multiple times, increases the verbosity level
	--debug,-D <option>  Controls debug output when parsing
                             depth: Set the maximum depth to output
                             kind: Only output nodes of the given kind
    --help,-h            Display this help message`);
	process.exit(1);
}

if (options.ast && options.tokens) {
	console.error('Error: Cannot use --ast with --tokens');
	process.exit(1);
}

const verbosity = options.verbose?.filter(Boolean)?.length ?? 0;

const debug = {};

for (const rawOption of options.debug) {
	if (!isNaN(rawOption)) {
		debug.depth = parseInt(rawOption);
		continue;
	}

	const [key, value = true] = rawOption.split('=');
	debug[key] = value;
}

let config;
try {
	config = parseJSONConfig(JSON.parse(readFileSync(options.config, 'utf-8')));
} catch (e) {
	if ('errno' in e) console.error(e);
	else console.error('Failed to resolve config:', e);

	process.exit(1);
}

let source;
try {
	source = readFileSync(input, 'utf-8');
} catch (e) {
	console.error('Failed to read input file:', e);
	process.exit(1);
}

const tokens = tokenize(source, config.literals);

if (options.info) {
	console.error('Tokens:', tokens.length);
}

if (options.tokens) {
	if (options.quiet) process.exit(0);

	for (const token of tokens) {
		if (options.mode != 'all' && config.ignoreLiterals.includes(token.kind)) continue;
		console.log(stringifyNode(token));
	}

	process.exit(0);
}

function dump_info() {
	if (!options.info) return;

	const info = parseInfo.get(input);

	for (const [k, v] of Object.entries(info)) {
		console.error(k + ': ', v);
	}
}

function log(info) {
	// handle debug options

	if ('depth' in debug && info.depth > debug.depth) return;
	if ('kind' in debug && debug.kind != info.kind) return;
	if ('type' in debug && debug.type != info.type) return;

	if (verbosity < info.level) return;

	console.log(' '.repeat(4 * info.depth) + (info.level > 1 ? '[debug] ' : '') + info.message);
}

let ast;
try {
	ast = parse({ ...config, tokens, log, id: input });
	dump_info();
} catch (e) {
	console.error('Error: parsing failed:', e);
	dump_info();
	process.exit(1);
}

if (options.quiet) process.exit(0);

for (const node of ast) {
	console.log(stringifyNode(node));
}
