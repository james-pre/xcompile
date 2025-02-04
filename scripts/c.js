#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path/posix';
import { parseArgs } from 'node:util';
import { preprocess } from '../dist/c.js';
import { parseJSON as parseConfigJSON } from '../dist/config.js';
import { stringifyIssue } from '../dist/issue.js';

const {
	values: options,
	positionals: [input],
} = parseArgs({
	options: {
		config: { short: 'c', type: 'string' },
		help: { short: 'h', type: 'boolean', default: false },
		trace: { type: 'boolean' },
		preprocess: { short: 'P', type: 'boolean' },
		output: { short: 'o', type: 'string' },
	},
	allowPositionals: true,
});

if (options.help || !input) {
	console.log(`Usage: xcompile-c [options] <file>
Options:
    -c, --config <path>   Specify the config file
        --trace           Show issue origin trace
    -h, --help            Display this help message
	-o, --output <path>   The path to the output file
    -P, --preprocess      Preprocess a file`);
	process.exit(1);
}

if (!options.preprocess) {
	console.error('Non-preprocessing not yet supported.');
	process.exit(1);
}

const { trace } = options;

let config;
try {
	config = parseConfigJSON(JSON.parse(readFileSync(options.config, 'utf-8')));
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

const processed = preprocess(source, {
	log(issue) {
		console.error(stringifyIssue(issue, { colors: true, trace }));
	},
	file(name, isPath) {
		if (!isPath) {
			console.warn('Skipping non-path import:', name);
			return '';
		}

		const path = resolve(dirname(input), name);
		try {
			return readFileSync(path, 'utf-8');
		} catch (e) {
			console.error('Failed to read imported file: ' + path + ':', e.message);
			process.exit(1);
		}
	},
	unit: input,
});

if (options.preprocess) {
	try {
		writeFileSync(options.output ?? input + '.out', processed.text);
	} catch (e) {
		console.error('Failed to write output file:', e);
		process.exit(1);
	}
}
