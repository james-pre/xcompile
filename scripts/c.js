#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path/posix';
import { parseArgs } from 'node:util';
import { inlineMacros, preprocess } from '../dist/c.js';
import { stringifyIssue } from '../dist/issue.js';

const {
	values: options,
	positionals: [input],
} = parseArgs({
	options: {
		help: { short: 'h', type: 'boolean', default: false },
		trace: { type: 'boolean' },
		'preprocess-only': { short: 'P', type: 'boolean' },
		output: { short: 'o', type: 'string' },
		quiet: { short: 'q', type: 'boolean' },
		include: { short: 'I', type: 'string', multiple: true, default: [] },
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
    -P, --preprocess-only            Preprocess a file
	-I, --include <...path>          Use headers from paths for non-path includes and embeds
        --show-imports               Show imports
        --ignore-directive-errors    Ignore error directives
        --ignore-directive-warnings  Ignore error directives`);
	process.exit(1);
}

if (!options['preprocess-only']) {
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

options.include.push('/usr/include');

const _includesReversed = options.include.toReversed();

let n_includes = 0;

const pp_options = {
	log(issue) {
		console.error(stringifyIssue(issue, { colors: true, trace }));
	},
	file(name, startRelative, isNext, isInclude, unit) {
		let found = false;

		const includes = startRelative ? [dirname(unit), ...options.include] : [..._includesReversed, dirname(unit)];

		for (const dir of includes) {
			const path = resolve(dir, name);
			if (!existsSync(path)) continue;
			if (isNext && !found) {
				found = true;
				continue;
			}
			try {
				if (!seenHeaders.has(path)) n_includes++;
				const contents = (isInclude ? `# ${n_includes} "${path}" \n` : '') + readFileSync(path, 'utf-8');
				if (!seenHeaders.has(path) && options['show-imports']) console.log('[+]', path);
				seenHeaders.add(path);
				return { contents, unit: path };
			} catch (e) {
				console.error(`Failed to import ${name} from ${dir}: ${e.message}`);
				process.exit(1);
			}
		}

		console.error(`Missing header or embed: ${name} (from ${unit})`);
		return { contents: '', unit: '<error>' };
	},
	unit: input,
	ignoreDirectiveErrors: options['ignore-directive-errors'],
	ignoreDirectiveWarnings: options['ignore-directive-warnings'],
	stripComments: true,
};

const processed = preprocess(source, pp_options);

inlineMacros(processed);

if (options['preprocess-only']) {
	try {
		const output = options.output ?? input + '.out';
		writeFileSync(output, processed.text.replaceAll(/^\s*$/gm, '').replaceAll(/\n{2,}/g, '\n\n'));
		process.exit(0);
	} catch (e) {
		console.error('Failed to write output file:', e);
		process.exit(1);
	}
}
