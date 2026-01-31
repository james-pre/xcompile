// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2025 James Prevett
import { readFileSync } from 'node:fs';
import $pkg from '../../package.json' with { type: 'json' };
import * as xir from '../ir.js';
import { __setEntry } from '../issue.js';
import * as clang from './clang.js';
import * as ts from './typescript.js';
import { cToTypescriptHeader } from './x-specific.js';
// @ts-expect-error 2307
import native from '../../lib/xcompile-native.node';

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
		case 'c':
		case 'clang': {
			__setEntry(file);
			const ir: xir.Unit[] = [],
				nodes = native.getClangAST(file, []);
			for (const node of nodes) ir.push(...clang.parse(node));
			return ir;
		}
		default:
			throw new Error('Unsupported source language: ' + lang);
	}
}

export interface EmitOptions {
	/** Type casts currently are very prone to being emitted as invalid code */
	noCasts?: boolean;
}

export function emit(lang: string, units: xir.Unit[], opts: EmitOptions): string {
	switch (lang) {
		case 'typescript':
		case 'ts':
			if (opts.noCasts) ts._disableCasts();
			return `/* Compiled using XCompile v${$pkg.version} */\n${cToTypescriptHeader} ${units.map(ts.emit).join('')}`;
		case 'xir-text':
			return `XCompile v${$pkg.version}\nXIR format ${xir.textFormat}\n${units.map(xir.text).join('\n')}`;
		case 'xir-json':
			return JSON.stringify(units, null, 4).replaceAll(/^( {4})+/gim, match => '\t'.repeat(match.length / 4));
		default:
			throw new Error('Unsupported target language: ' + lang);
	}
}
