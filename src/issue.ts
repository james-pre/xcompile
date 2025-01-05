import { location_text, type Location } from './tokens.js';

export interface Issue {
	location?: Location;
	source: string;
	message?: string;
	level: IssueLevel;
	stack?: string;
}

export enum IssueLevel {
	Error = 0,
	Warning = 1,
	Note = 2,
}

/**
 * Placed into ANSI escape code
 */
const colors = {
	[IssueLevel.Error]: 31,
	[IssueLevel.Warning]: 33,
	[IssueLevel.Note]: 36,
};

function extract_trace(stack: string = ''): string {
	for (const line of stack.split('\n').map(l => l.trim())) {
		if (!line.startsWith('at ')) continue;
		const [, symbol] = line.split(' ');

		if (symbol.startsWith('_') || symbol.includes('_log_')) continue;

		return line;
	}

	return '(unknown origin)';
}

export function is_issue(i: unknown): i is Issue {
	return typeof i == 'object' && i != null && 'source' in i && 'level' in i;
}

export interface IssueFormatting {
	colors: boolean;
	trace: boolean;
}

export function stringify_issue(i: Issue, options: Partial<IssueFormatting>): string {
	const level = options.colors ? `\x1b[1;${colors[i.level]}m${IssueLevel[i.level]}\x1b[0m` : IssueLevel[i.level];

	const trace = options.trace ? ' ' + extract_trace(i.stack) : '';

	const base_message = `${level}: ${i.message}${trace}`;

	if (!i.location) return base_message;

	const line_text = i.source.split('\n')[i.location.line - 1];

	let { column } = i.location,
		excerpt = line_text;

	// Max 80 chars, 40 before and 40 after

	if (line_text.length > 80) {
		const offset = Math.max(0, column - 40);
		excerpt = line_text.slice(offset, column + 40);
		column -= offset;
	}

	return `${location_text(i.location)}\n\t${excerpt}\n\t${' '.repeat(column)}^\n${base_message}`;
}
