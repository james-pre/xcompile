// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2025 James Prevett
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import $pkg from '../../package.json' with { type: 'json' };
import * as xir from '../ir.js';
import * as clang from './clang.js';
import * as ts from './typescript.js';
import { cToTypescriptHeader } from './x-specific.js';
import { __setEntry } from '../issue.js';

export { clang, ts };

export interface ParseOptions {
	/** If set, the exit codes of sub-shells are ignored */
	ignoreExit?: boolean;

	/** Override the entry point used for computing issue messages */
	issueEntry?: string;
}

export function parse(lang: string, file: string, opts: ParseOptions): Iterable<xir.Unit> {
	if (opts.issueEntry) __setEntry(opts.issueEntry);

	switch (lang) {
		case 'clang-ast':
			return clang.parse(JSON.parse(readFileSync(file, 'utf8')));
		case 'c': {
			const tmp = `/tmp/xcompile-${Math.random().toString(36).slice(2)}.json`;
			__setEntry(file);
			try {
				execSync(`clang -Xclang -ast-dump=json ${file} > ${tmp}`, { stdio: 'inherit' });
			} catch (err: any) {
				if (!opts.ignoreExit) throw err.toString();
			}
			const json = readFileSync(tmp, 'utf8');
			return [...clang.parse(JSON.parse(json))];
		}
		default:
			throw new Error('Unsupported source language: ' + lang);
	}
}

export function emit(lang: string, units: xir.Unit[]): string {
	switch (lang) {
		case 'typescript':
		case 'ts':
			return `/* Compiled using XCompile v${$pkg.version} */\n${cToTypescriptHeader} ${units.map(ts.emit).join('')}`;
		case 'xir-test':
			return `XCompile v${$pkg.version}\nXIR format ${xir.textFormat}\n${units.map(xir.text).join('\n')}`;

		default:
			throw new Error('Unsupported target language: ' + lang);
	}
}
