#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2025 James Prevett
import { program } from 'commander';
import { writeFileSync } from 'node:fs';
import { parseArgs, styleText } from 'node:util';
import $pkg from '../package.json' with { type: 'json' };
import type { xir } from './index.js';
import { emit, IssueLevel, onIssue, parse, stringifyIssue } from './index.js';

// @todo implement CLI using commander.
program
	.name('xcompile')
	.version($pkg.version)
	.description('Compile between various formats')
	.argument('<from>:<to>', 'The source and target languages')
	.argument('<input...>', 'Path to input file(s)');

const {
	values: opt,
	positionals: [formats, input],
} = parseArgs({
	options: {
		output: { short: 'o', type: 'string' },
		help: { short: 'h', type: 'boolean' },
		version: { short: 'V', type: 'boolean' },
		verbose: { short: 'v', type: 'boolean' },
		'ignore-exit': { short: 'k', type: 'boolean' },
		'allow-dupe': { type: 'boolean' },
		'issue-entry': { type: 'string' },
		'emit-no-casts': { type: 'boolean' },
	},
	allowPositionals: true,
});

if (opt.help || !input) {
	console.log(`Usage: xcompile <from>:<to> [options] <input>
	from: The source language
	to: The target language
	input: Path to input file(s)

Sources:
	c                    C, handles generation of the Clang AST automatically
	clang-ast            C, uses a Clang AST in JSON format

Targets:
	ts, typescript       TypeScript
	xir-text             A textual representation of the XCompile IR
	xir-json			 The raw JSON of the XCompile IR

Options:
	-h, --help           Display this help message
	-V, --version        Display version information and exit
	-v, --verbose        Display verbose messages
	-o, --output <path>  Write output to path
	-k, --ignore-exit    Ignore the exit code of sub-shells
	    --allow-dupe     Report duplicate issues
	    --issue-entry    Set the entry point used when computing issue messages
        --emit-no-casts  Type casts will not be emitted`);
	process.exit(1);
}

let [source, target, ...rest] = formats.split(':');

if (rest.length) console.log('Ignoring: ' + rest.join(', '));

let reported = new Set<string>();

onIssue(i => {
	if (i.level == IssueLevel.Debug && !opt.verbose) return;
	const content = stringifyIssue(i, { colors: true, trace: opt.verbose });
	if (reported.has(content) && !opt['allow-dupe']) return;
	reported.add(content);
	console.error(content);
});

let ir: Iterable<xir.Unit>;
try {
	ir = parse(source, input, { ignoreExit: opt['ignore-exit'], issueEntry: opt['issue-entry'] });
} catch (err: any) {
	console.error(styleText('red', err instanceof Error ? err.stack : err.toString()));
	process.exit(1);
}

let content: string;
try {
	content = emit(target, [...ir], { noCasts: opt['emit-no-casts'] });
} catch (err: any) {
	console.error(styleText('red', err instanceof Error ? err.stack : err.toString()));
	process.exit(1);
}

if (!opt.output) {
	console.log('No output file specified.');
	process.exit(0);
}

writeFileSync(opt.output, content);
