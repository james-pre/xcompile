#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path/posix';
import { parseArgs } from 'node:util';
import { preprocess } from '../dist/c.js';
import { stringifyIssue } from '../dist/issue.js';

const {
	values: options,
	positionals: [input],
} = parseArgs({
	options: {
		help: { short: 'h', type: 'boolean', default: false },
		trace: { type: 'boolean' },
		preprocess: { short: 'P', type: 'boolean' },
		output: { short: 'o', type: 'string' },
		quiet: { short: 'q', type: 'boolean' },
		include: { short: 'I', type: 'string', multiple: true },
		'show-imports': { type: 'boolean' },
		'ignore-directive-errors': { type: 'boolean' },
		'ignore-directive-warnings': { type: 'boolean' },
	},
	allowPositionals: true,
});

if (options.help || !input) {
	console.log(`Usage: xcompile-c [options] <file>
Options:
        --trace                      Show issue origin trace
    -h, --help                       Display this help message
    -o, --output <path>              The path to the output file
    -q, --quiet                      Hide common warnings
    -P, --preprocess                 Preprocess a file
	-I, --include <...path>          Use headers from paths for non-path includes and embeds
        --show-imports               Show imports
        --ignore-directive-errors    Ignore error directives
        --ignore-directive-warnings  Ignore error directives`);
	process.exit(1);
}

if (!options.preprocess) {
	console.error('Non-preprocessing not yet supported.');
	process.exit(1);
}

const { trace } = options;

let source;
try {
	source = readFileSync(input, 'utf-8');
} catch (e) {
	console.error('Failed to read input file:', e);
	process.exit(1);
}

const seenHeaders = new Set();

const processed = preprocess(source, {
	log(issue) {
		console.error(stringifyIssue(issue, { colors: true, trace }));
	},
	file(name, isPath, unit) {
		if (!isPath && !options.include.length) {
			!options.quiet && console.warn('Skipping non-path import:', name);
			return { contents: '', unit: '<error>' };
		}

		if (isPath) {
			try {
				const path = resolve(dirname(unit), name);
				const contents = readFileSync(path, 'utf-8');
				return { contents: `# "${path}" \n` + contents, unit: path };
			} catch (e) {
				console.error('Failed to read imported file: ' + resolve(dirname(input), name) + ':', e.message);
				process.exit(1);
			}
		}

		for (const dir of options.include) {
			const path = resolve(dir, name);
			try {
				const contents = readFileSync(path, 'utf-8');
				if (!seenHeaders.has(path) && options['show-imports']) console.log('[+]', path);
				seenHeaders.add(path);
				return { contents: `# "${path}" \n` + contents, unit: path };
			} catch (e) {
				if (e.code != 'ENOENT') {
					console.error('Failed to read imported file: ' + path + ':', e.message);
					process.exit(1);
				}
			}
		}

		console.error(`Missing system header or embed, <${name}> (from ${unit})`);
		return { contents: '', unit: '<error>' };
	},
	unit: input,
	ignoreDirectiveErrors: options['ignore-directive-errors'],
	ignoreDirectiveWarnings: options['ignore-directive-warnings'],
	stripComments: true,
});

if (options.preprocess) {
	try {
		const output = options.output ?? input + '.out';
		writeFileSync(output, processed.text.replaceAll(/\n{2,}/g, '\n\n'));
		writeFileSync(output + '-logical.c', processed.logicalSource);
	} catch (e) {
		console.error('Failed to write output file:', e);
		process.exit(1);
	}
}
