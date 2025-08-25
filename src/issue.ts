// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2025 James Prevett

import { styleText } from 'node:util';

/**
 * A location in source text
 */
export interface Location {
	line: number;
	column: number;
	position: number;
	/**
	 * The file, internal module, shared object, etc.
	 */
	unit?: string;
}

export function locationText(loc: Location): string {
	return `${loc.unit ? loc.unit + ':' : ''}${loc.line}:${loc.column}`;
}

export interface Issue {
	location?: Location;
	source?: string;
	message?: string;
	level: IssueLevel;
	stack?: string;
}

export enum IssueLevel {
	Error = 0,
	Warning = 1,
	Note = 2,
	Debug = 5,
}

const issueTypes = ['Error', 'Warning', 'Note', 'Debug'] as const;

type IssueHelperName = Lowercase<(typeof issueTypes)[number]>;

export type IssueHelpers<I> = Record<IssueHelperName, (message: string, init: I) => Issue>;

export function createIssueHelpers<const I>(parse: (input: I) => Location | undefined): IssueHelpers<I> {
	const helpers = {} as IssueHelpers<I>;

	for (const key of issueTypes) {
		helpers[key.toLowerCase() as Lowercase<typeof key>] = function __reportIssue(message: string, init: I) {
			const issue: Issue = {
				location: parse(init),
				source,
				message,
				level: IssueLevel[key],
			};

			return issue;
		};
	}

	return helpers;
}

let source: string | undefined;

export function setIssueSource(newSource: string) {
	source = newSource;
}

/**
 * Placed into ANSI escape code
 */
const colors = {
	[IssueLevel.Error]: 'red',
	[IssueLevel.Warning]: 'yellowBright',
	[IssueLevel.Note]: 'cyan',
	[IssueLevel.Debug]: 'dim',
} as const satisfies Record<IssueLevel, string>;

function extractTrace(stack: string = ''): string {
	for (const line of stack.split('\n').map(l => l.trim())) {
		if (!line.startsWith('at ')) continue;
		const [, symbol] = line.split(' ');

		if (symbol.startsWith('_') || symbol.includes('_log_')) continue;

		return line;
	}

	return '(unknown origin)';
}

export function isIssue(i: unknown): i is Issue {
	return typeof i == 'object' && i != null && 'source' in i && 'level' in i;
}

export interface IssueFormatting {
	colors: boolean;
	trace: boolean;
}

export function stringifyIssue(i: Issue, options: Partial<IssueFormatting>): string {
	const level = options.colors ? styleText([colors[i.level], 'bold'], IssueLevel[i.level]) : IssueLevel[i.level];

	const trace = options.trace ? ' ' + extractTrace(i.stack) : '';

	const message = `${level}: ${i.message}${trace}`;

	if (!i.location) return message;
	if (!i.source) return `${locationText(i.location)}\n${message}`;

	const lineText = i.source.split('\n')[i.location.line - 1];

	let { column } = i.location,
		excerpt = lineText;

	// Max 80 chars, 40 before and 40 after

	if (lineText.length > 80) {
		const offset = Math.max(0, column - 40);
		excerpt = lineText.slice(offset, column + 40);
		column -= offset;
	}

	return `${locationText(i.location)}\n\t${excerpt}\n\t${' '.repeat(column)}^\n${message}`;
}

const handlers = new Set<(issue: Issue) => unknown>();

/**
 * Report an issue
 * @internal
 */
export function emitIssue(issue: Issue) {
	for (const handler of handlers) handler(issue);
}

export function onIssue(handler: (issue: Issue) => unknown) {
	handlers.add(handler);
}
