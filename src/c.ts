import type { Issue, IssueLevel } from './issue.js';

const directive_regex = /^\s*#\s*(\w+)(?:\s+(.*))?$/;
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
 * @property stripComments If true, comments (both block and line) will be stripped from the source.
 */
export interface PreprocessOptions {
	log?: (info: Issue) => void;
	file?(name: string, isPath: boolean, unit: string): FileInfo;
	unit?: string;
	defines?: Map<string, Define>;
	_files?: Set<string>;
	ignoreDirectiveErrors?: boolean;
	ignoreDirectiveWarnings?: boolean;
	stripComments?: boolean;
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
 * This function evaluates a macro expression in conditional directives.
 * It performs various replacements (numeric suffix removal, defined(...) substitution,
 * identifier replacement) and then evaluates the resulting JavaScript expression.
 *
 * @param macro The original macro expression.
 * @param log A function used to log errors encountered during evaluation.
 * @param defines The current macro definitions.
 * @returns The evaluated result (typically a number whose truthiness is used for #if conditions).
 *
 */
function evaluateCondition(macro: string, log: (level: IssueLevel, message: string) => void, defines: Map<string, Define>): any {
	// Remove suffixed numeric constants.
	// E.g. "0UL", "123ull", "0x1FUL" become "0", "123", "0x1F".
	macro = macro.replace(/\b((?:0x[\da-fA-F]+|\d+))([uUlL]+)\b/g, '$1');

	// Built-in macro functions and constants available to the evaluated expression.
	const builtins = {
		__X_UNDEFINED: () => 0,
		__has_attribute: (attr: string) => false,
		IS_ENABLED: (name: string) => true,
		__has_builtin: () => false,
		IS_BUILTIN: () => false,
		__GLIBC_USE: (feature: string) => true,
		__GNUC_PREREQ: (maj: number, min: number) => true,
		__glibc_has_builtin: () => false,
		__x86_64__: true,
		__LITTLE_ENDIAN_BITFIELD: true,
		HZ: 1000,
		__BYTE_ORDER: 1234,
	};

	// Replace defined(MACRO) and defined MACRO.
	let replaced = macro
		.replaceAll(/\bdefined\s*\(\s*(\w+)\s*\)/g, (_, macroName) => (defines.has(macroName) || macroName in builtins ? '1' : '0'))
		.replaceAll(/\bdefined\s+(\w+)/g, (_, macroName) => (defines.has(macroName) || macroName in builtins ? '1' : '0'));

	// First, replace identifiers used in a function-call context.
	// The regex uses a positive lookahead to check for an open parenthesis (allowing whitespace).
	replaced = replaced.replaceAll(/\b([A-Za-z_]\w*)(?=\s*\()/g, (match, id) => {
		if (id in builtins) return id;
		if (!defines.has(id)) return '__X_UNDEFINED';
		const val = defines.get(id);
		if (typeof val != 'string') return '1';
		const num = Number(val);
		return isNaN(num) ? '__X_UNDEFINED' : '1';
	});

	// Next, replace identifiers not used as function calls.
	// The negative lookahead (?!\s*\() prevents re-matching function-call identifiers.
	replaced = replaced.replaceAll(/\b([A-Za-z_]\w*)\b(?!\s*\()/g, (match, id) => {
		if (id in builtins) return id;
		if (!defines.has(id)) return '0';
		const val = defines.get(id);
		if (typeof val != 'string') return '1';
		const num = Number(val);
		return isNaN(num) ? '0' : String(num);
	});

	try {
		// The built-in functions are passed as parameters.
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		const eval_expression = new Function(...Object.keys(builtins), `return (${replaced});`);
		return eval_expression(...Object.values(builtins));
	} catch (e: any) {
		log(0, 'Failed to evaluate condition: ' + e);
		return false;
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
	// Optional comment stripping.
	if (opt.stripComments) {
		// Remove block comments while preserving newlines.
		source = source.replace(/\/\*[\s\S]*?\*\//g, match => {
			const newlines = match.split('\n').length - 1;
			return '\n'.repeat(newlines);
		});
		// Remove line comments.
		source = source.replace(/\/\/.*$/gm, '');
	}

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

		// Determine if the current line is active based on conditional stack.
		const active = !condStack.length || condStack.every(block => block.currentlyActive);

		// Non-directive lines: output them only if all conditionals are active.
		if (!line.trim().startsWith('#')) {
			if (active) outputLines.push(line);
			true_position += line.length + 1;
			continue;
		}

		// Use the updated directive regex which now allows no arguments.
		const parts = line.match(directive_regex);
		if (!parts) {
			if (active) outputLines.push(line);
			true_position += line.length + 1;
			continue;
		}
		// Default the text argument to an empty string if missing.
		const [, directive, text = ''] = parts;

		// Process conditional-control directives even if not active.
		if (!isConditionalDirective(directive) && !active) {
			true_position += line.length + 1;
			continue;
		}

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
