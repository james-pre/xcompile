#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { ts, clang, xir, versions as v, versionsText } from './dist/index.js';
import { execSync } from 'node:child_process';
import $package from './package.json' with { type: 'json' };

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

if (opt.version) {
	console.log(`XCompile ${$package.version}\n${versionsText()}`);
	process.exit(0);
}

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
		return `/* XCompile ${$package.version} */\n${ts.cHeader} ${ir.map(ts.emit).join('')}`;
	}

	if (target == 'xir-text') {
		return `XCompile v${$package.version}\nXIR v${v.xir.major}.${v.xir.minor} (text v${v.xir.text})\n${ir.map(xir)}`;
	}

	console.error('Invalid target: ' + target);
	process.exit(1);
})();

if (!opt.output) {
	console.log('No output file specified.');
	process.exit(0);
}

writeFileSync(opt.output, content);
