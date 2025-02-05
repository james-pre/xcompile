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
	const level = options.colors ? `\x1b[1;${colors[i.level]}m${IssueLevel[i.level]}\x1b[0m` : IssueLevel[i.level];

	const trace = options.trace ? ' ' + extractTrace(i.stack) : '';

	const message = `${level}: ${i.message}${trace}`;

	if (!i.location) return message;

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
