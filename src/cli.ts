#!/usr/bin/env node
import { program } from 'commander';
import $pkg from '../package.json' with { type: 'json' };
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { clang, ts, xir, versions as v } from './index.js';
import { execSync } from 'node:child_process';

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
		version: { short: 'v', type: 'boolean' },
		verbose: { short: 'w', type: 'boolean' },
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

Options:
	-h, --help           Display this help message
	-v, --version        Display version information and exit
	-w, --verbose        Display verbose messages
	-o, --output <path>  Write output to path`);
	process.exit(1);
}

let [source, target, ...rest] = formats.split(':');

if (rest.length) console.log('Ignoring: ' + rest.join(', '));

// This is surprisingly the most readable way to write this.
const ir = (() => {
	if (source == 'clang-ast') return [...clang.parse(JSON.parse(readFileSync(input, 'utf8')))];

	if (source == 'c') {
		const json = execSync('clang -cc1 -ast-dump=json ' + input, {
			stdio: ['inherit', 'pipe', 'inherit'],
			encoding: 'utf-8',
		});
		return [...clang.parse(JSON.parse(json))];
	}

	console.error('Invalid source: ' + source);
	process.exit(1);
})();

const content = (() => {
	if (target == 'ts' || target == 'typescript') {
		return `/* XCompile ${$pkg.version} */\n${ts.cHeader} ${ir.map(ts.emit).join('')}`;
	}

	if (target == 'xir-text') {
		return `XCompile v${$pkg.version}\nXIR format ${v.xir.text}\n${ir.map(xir.text).join('\n')}`;
	}

	console.error('Invalid target: ' + target);
	process.exit(1);
})();

if (!opt.output) {
	console.log('No output file specified.');
	process.exit(0);
}

writeFileSync(opt.output, content);
