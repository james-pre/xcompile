import type { Issue, IssueLevel } from './issue.js';

const directive_regex = /^#(\w+)\s+(.*)$/;
const define_regex = /^(\w+)(?:\(([^)]*)\))?\s+(.*)$/;

export type Define = string | ((...args: string[]) => string);

export interface Preprocessed {
	defines: Map<string, Define>;
	text: string;
	logicalSource: string;
}

export interface FileInfo {
	contents: string;
	unit?: string;
}

/**
 * Preprocessor options.
 *
 * @property log A unified logging function (for errors, warnings, etc.).
 * @property file A function that returns the content for an include/embed.
 * @property unit An optional unit name (for example, a filename) to attach to Issue locations.
 */
export interface PreprocessOptions {
	log?: (info: Issue) => void;
	file?(name: string, isPath: boolean, unit: string): FileInfo;
	unit?: string;
	defines?: Map<string, Define>;
	_files?: Set<string>;
	ignoreDirectiveErrors?: boolean;
	ignoreDirectiveWarnings?: boolean;
}

// A block representing a conditional (#if/#ifdef etc.) region.
interface ConditionalBlock {
	parentActive: boolean; // Was the enclosing region active?
	satisfied: boolean; // Has any branch in this block already been taken?
	currentlyActive: boolean; // Is the current branch active?
}

/** Returns true if the directive controls conditionals. */
function isConditionalDirective(dir: string): boolean {
	return ['if', 'ifdef', 'ifndef', 'elif', 'elifdef', 'elifndef', 'else', 'endif'].includes(dir);
}

/**
 * This function evaluates a macro. expression in conditional statements
 * @param macro The original macro
 * @param log A function used to log stuff encountered during evaluation.
 * @param defines The current macro definitions.
 */
function evaluateCondition(macro: string, log: (level: IssueLevel, message: string) => void, defines: Map<string, Define>): any {
	// replace suffixed numeric constants
	macro = macro.replace(/\b((?:0x[\da-fA-F]+|\d+))([uUlL]+)\b/g, '$1');

	// Hard-coded built-in macro functions.
	const builtins: { [key: string]: (...args: any[]) => any } = {
		__has_attribute: (attr: string) => true,
		IS_ENABLED: () => true,
		__has_builtin: () => false,
		IS_BUILTIN: () => false,
	};

	// Replace defined(MACRO) and defined MACRO.
	let replaced = macro
		.replaceAll(/\bdefined\s*\(\s*(\w+)\s*\)/g, (_, macro) => (defines.has(macro) ? '1' : '0'))
		.replaceAll(/\bdefined\s+(\w+)/g, (_, macro) => (defines.has(macro) ? '1' : '0'));

	// Replace any remaining identifier:
	// - If it is one of our built-ins, leave it as-is.
	// - Else if it is defined in `defines`, replace it with its numeric value (or "1" for function-like macros).
	// - Otherwise, replace it with "0".
	replaced = replaced.replaceAll(/\b[A-Za-z_]\w*\b/g, id => {
		if (id in builtins) return id;
		if (!defines.has(id)) return '0';
		const val = defines.get(id);
		if (typeof val != 'string') return '1';
		const num = Number(val);
		return isNaN(num) ? '0' : String(num);
	});

	try {
		// Evaluate the resulting expression, passing in the built-in functions
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		const func = new Function(...Object.keys(builtins), `return (${replaced});`);
		return func(...Object.values(builtins));
	} catch (e: any) {
		log(0, 'Failed to evaluate condition: ' + e);
	}
}

/**
 * Preprocess a C-like source file.
 *
 * Lines ending with a backslash are joined, and preprocessor directives are processed.
 *
 * @param source The source text.
 * @param opt Preprocessing options.
 * @returns A Preprocessed object containing the final text and collected macro definitions.
 */
export function preprocess(source: string, opt: PreprocessOptions): Preprocessed {
	source = source.replaceAll('\\\n', '');

	const outputLines: string[] = [];
	opt.defines ??= new Map<string, Define>();
	opt._files ??= new Set<string>();
	opt.unit ??= '';

	// Stack for conditional directives (#if, #ifdef, etc.)
	const condStack: ConditionalBlock[] = [];

	let true_position = 0;

	const lines = source.split('\n');
	for (let i = 0; i < lines.length; i++) {
		let column = 1,
			position = true_position;
		const line = lines[i];

		const log = (level: IssueLevel, message: string) => {
			const issue: Issue = {
				location: { line: i + 1, column, position, unit: opt.unit },
				source,
				message,
				level,
				stack: new Error().stack,
			};
			opt.log?.(issue);
		};

		// Compute the current global active state.
		const active = !condStack.length || condStack.every(block => block.currentlyActive);

		// Non-directive lines: output them only if all conditionals are active.
		if (!line.trim().startsWith('#')) {
			if (active) outputLines.push(line);
			continue;
		}

		const parts = line.match(directive_regex);
		if (!parts) {
			if (active) outputLines.push(line);
			continue;
		}
		const [, directive, text] = parts;

		// Process conditional-control directives even if not active.
		if (!isConditionalDirective(directive) && !active) continue;

		column += directive.length + 1;
		position += directive.length + 1;

		switch (directive) {
			// Conditional Compilation Directives
			case 'if': {
				const conditionValue = active && evaluateCondition(text, log, opt.defines);
				condStack.push({
					parentActive: active,
					satisfied: conditionValue,
					currentlyActive: conditionValue,
				});
				break;
			}
			case 'ifdef':
			case 'ifndef': {
				const isMet = active && opt.defines.has(text.trim()) == (directive == 'ifdef');
				condStack.push({
					parentActive: active,
					satisfied: isMet,
					currentlyActive: isMet,
				});
				break;
			}
			case 'elifdef':
			case 'elifndef': {
				if (!condStack.length) {
					log(0, directive + ' without matching #if');
					break;
				}
				const block = condStack.at(-1)!;
				if (!block.parentActive || block.satisfied) {
					block.currentlyActive = false;
				} else {
					const has = opt.defines.has(text.trim()) == (directive == 'elifdef');
					block.currentlyActive = has;
					if (has) block.satisfied = true;
				}
				break;
			}
			case 'elif': {
				if (!condStack.length) {
					log(0, '#elif without matching #if');
					break;
				}
				const block = condStack.at(-1)!;
				if (!block.parentActive || block.satisfied) {
					block.currentlyActive = false;
				} else {
					const conditionValue = evaluateCondition(text, log, opt.defines);
					block.currentlyActive = conditionValue;
					if (conditionValue) block.satisfied = true;
				}
				break;
			}
			case 'else': {
				if (!condStack.length) {
					log(0, '#else without matching #if');
					break;
				}
				const block = condStack.at(-1)!;
				if (!block.parentActive) {
					block.currentlyActive = false;
				} else {
					block.currentlyActive = !block.satisfied;
					block.satisfied = true;
				}
				break;
			}
			case 'endif': {
				if (!condStack.length) {
					log(0, '#endif without matching #if');
					break;
				}
				condStack.pop();
				break;
			}

			// Other Directives (processed only in active regions)
			case 'include':
			case 'embed': {
				const isInclude = directive === 'include';
				if (!opt.file) {
					log(0, 'Cannot import a file');
					break;
				}

				const trimmedText = text.trim();
				let isPath: boolean;
				let name: string;
				let m: RegExpMatchArray | null;
				if ((m = trimmedText.match(/^<([^>]+)>/))) {
					name = m[1].trim();
					isPath = false;
				} else if ((m = trimmedText.match(/^"([^"]+)"/))) {
					name = m[1].trim();
					isPath = true;
				} else {
					log(1, 'Malformed directive: ' + line);
					break;
				}

				let { contents: included, unit = name } = opt.file(name, isPath, opt.unit);
				// For #include, recursively preprocess the included file.
				if (isInclude) {
					if (!isPath && opt._files.has(name)) break;
					if (!isPath) opt._files.add(name);

					const preprocessed = preprocess(included, { ...opt, unit });
					included = preprocessed.text;
				}
				outputLines.push(included);

				break;
			}
			case 'define': {
				const defMatch = text.match(define_regex);
				if (!defMatch) break;
				const [, name, rawParams, body] = defMatch;
				if (!rawParams) {
					opt.defines.set(name, body);
					break;
				}

				const params = rawParams
					.split(',')
					.map(param => param.trim())
					.filter(param => param.length > 0);

				// Create a function-like macro.
				opt.defines.set(name, (...args: string[]): string => {
					let result = body;
					for (let i = 0; i < params.length; i++) {
						// Replace all occurrences of the parameter (using word boundaries)
						result = result.replaceAll(new RegExp(`\\b${params[i]}\\b`, 'g'), args[i] || '');
					}
					return result;
				});

				break;
			}
			case 'undef': {
				opt.defines.delete(text.trim());
				break;
			}
			case 'line': {
				log(1, '#line is not supported.');
				break;
			}
			case 'error': {
				if (active && !opt.ignoreDirectiveErrors) log(0, text);
				break;
			}
			case 'warning': {
				if (active && !opt.ignoreDirectiveWarnings) log(1, text);
				break;
			}
			case 'pragma': {
				log(1, '#pragma is not supported.');
				break;
			}
			default: {
				log(1, 'Unknown directive: ' + directive);
				break;
			}
		}
		true_position += line.length + 1;
	}

	return {
		defines: opt.defines,
		text: outputLines.join('\n'),
		logicalSource: source,
	};
}
