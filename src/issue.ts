export interface SourceIssue {
	id?: string;
	line: number;
	column: number;
	position: number;
	source: string;
	message?: string;
	level: IssueLevel;
}

export enum IssueLevel {
	Error = 0,
	Warning = 1,
	Note = 2,
}

/**
 * Placed into \x1b[<here>m
 */
const colors = {
	[IssueLevel.Error]: 31,
	[IssueLevel.Warning]: 33,
	[IssueLevel.Note]: 36,
};

export function is_issue(i: unknown): i is SourceIssue {
	return typeof i == 'object' && i != null && 'line' in i && 'column' in i && 'position' in i && 'source' in i && 'level' in i;
}

export function stringify_issue(i: SourceIssue, colorize: boolean): string {
	const level = colorize ? `\x1b[1;${colors[i.level]}m${IssueLevel[i.level]}\x1b[0m` : IssueLevel[i.level];

	const line_text = i.source.split('\n')[i.line - 1];

	let { column } = i,
		excerpt = line_text;

	// Max 80 chars, 40 before and 40 after

	if (line_text.length > 80) {
		const offset = Math.max(0, column - 40);
		excerpt = line_text.slice(offset, column + 40);
		column -= offset;
	}

	return `${i.id}:${i.line}:${column}\n\t${excerpt}\n\t${' '.repeat(column)}^\n${level}: ${i.message}`;
}
