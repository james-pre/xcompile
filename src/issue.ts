// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2025 James Prevett

import { openSync, readSync } from 'node:fs';
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
	length?: number;
}

export function locationText(loc: Location): string {
	return styleText('whiteBright', `${loc.unit ? loc.unit + ':' : ''}${loc.line ?? '??'}:${loc.column ?? '??'}`);
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

export function createIssueHelpers<const I>(parse: (input: I) => Pick<Issue, 'location' | 'source'>): IssueHelpers<I> {
	const helpers = {} as IssueHelpers<I>;

	for (const key of issueTypes) {
		helpers[key.toLowerCase() as Lowercase<typeof key>] = function __reportIssue(message: string, init: I) {
			const issue: Issue = {
				...parse(init),
				message,
				level: IssueLevel[key],
			};

			emitIssue(issue);
			return issue;
		};
	}

	return helpers;
}

const colors = {
	[IssueLevel.Error]: 'red',
	[IssueLevel.Warning]: 'yellow',
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

/**
 * The entry point for the "current" file being processed.
 * Used for last-ditch attempt at getting an issue's source file name
 */
export let __entry: string | undefined;

export function __setEntry(entry: string) {
	__entry = entry;
}

const openFiles = new Map<string, number>();

export function getSource(path: string | undefined, offset: number): string | undefined {
	if (!path) return undefined;
	if (!openFiles.has(path)) {
		const fd = openSync(path, 'r');
		openFiles.set(path, fd);
	}

	const fd = openFiles.get(path)!;
	// Max 80 chars, 40 before and 40 after
	const length = offset < 40 ? 80 - offset : 80;
	const data = new Uint8Array(length);
	readSync(fd, data, 0, length, Math.max(0, offset - 40));

	return new TextDecoder().decode(data).replaceAll('\0', '');
}

export function stringifyIssue(i: Issue, options: Partial<IssueFormatting>): string {
	const level = options.colors ? styleText([colors[i.level], 'bold'], IssueLevel[i.level]) : IssueLevel[i.level];

	const trace = options.trace && i.stack ? ' ' + extractTrace(i.stack) : '';

	const message = level + styleText(colors[i.level], ': ' + i.message + trace);

	if (!i.location) return message;
	if (!i.source) return `${locationText(i.location)}: ${message}`;

	let { column, position, length = 1 } = i.location;
	let text = i.source;

	// exactly how far into the data the `position` is
	let offset = position < 40 ? position : 40;

	const maybeBreakAfter = text.slice(offset).indexOf('\n');
	if (maybeBreakAfter !== -1) text = text.slice(0, offset + maybeBreakAfter);

	const maybeBreakBefore = text.slice(0, offset).lastIndexOf('\n');
	if (maybeBreakBefore !== -1) {
		text = text.slice(maybeBreakBefore + 1);
		offset -= maybeBreakBefore + 1;
	}

	const nLeadingTabs = text.match(/^\t*/)?.[0].length || 0;
	const leftPadding = 3 + (offset < 40 ? column : offset + 1) + nLeadingTabs * 3;

	return `${locationText(i.location)}: ${message}\n    ${text.replaceAll('\t', '    ')}\n${' '.repeat(leftPadding)}^${'~'.repeat(length - 1)}`;
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
