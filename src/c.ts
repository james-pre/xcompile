import type { Issue, IssueLevel } from './issue.js';

const directive_regex = /^#(\w+)\s+(.*)$/;
const define_regex = /^(\w+)(?:\(([^)]*)\))?\s+(.*)$/;

export type Define = string | ((...args: string[]) => string);

export interface Preprocessed {
	defines: Map<string, Define>;
	text: string;
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
	file?(name: string, isPath: boolean): string;
	unit?: string;
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
	const defines = new Map<string, Define>();

	// Stack for conditional directives (#if, #ifdef, etc.)
	const condStack: ConditionalBlock[] = [];

	/** Returns true if all enclosing conditionals are active. */
	function globalActive(): boolean {
		return condStack.every(block => block.currentlyActive);
	}

	/** A very simple condition evaluator.
	 *  In this implementation, if the trimmed expression equals "0" it is false;
	 *  everything else is considered true.
	 */
	function evaluateCondition(expr: string): boolean {
		return expr.trim() != '0';
	}

	let position = 0;

	const lines = source.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		const log = (level: IssueLevel, message: string) => {
			const issue: Issue = {
				location: { line: i + 1, column: 1, position, unit: opt.unit },
				source,
				message,
				level,
				stack: new Error().stack,
			};
			opt.log?.(issue);
		};

		// Compute the current global active state.
		const active = globalActive();

		// Non-directive lines: output them only if all conditionals are active.
		if (!line.trim().startsWith('#')) {
			if (active) outputLines.push(line);
			continue;
		}

		const parts = line.match(directive_regex);
		if (!parts) continue;
		const [, directive, text] = parts;

		// Process conditional-control directives even if not active.
		if (!isConditionalDirective(directive) && !active) continue;

		switch (directive) {
			// Conditional Compilation Directives
			case 'if': {
				const conditionValue = active && evaluateCondition(text);
				condStack.push({
					parentActive: active,
					satisfied: conditionValue,
					currentlyActive: conditionValue,
				});
				break;
			}
			case 'ifdef':
			case 'ifndef': {
				const isMet = active && defines.has(text.trim()) == (directive == 'ifdef');
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
					const has = defines.has(text.trim()) == (directive == 'elifdef');
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
					const conditionValue = evaluateCondition(text);
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
				if (trimmedText.startsWith('<') && trimmedText.endsWith('>')) {
					name = trimmedText.slice(1, -1);
					isPath = false;
				} else if (trimmedText.startsWith('"') && trimmedText.endsWith('"')) {
					name = trimmedText.slice(1, -1);
					isPath = true;
				} else {
					log(1, 'Malformed directive: ' + line);
					break;
				}
				let included = opt.file(name, isPath);
				// For #include, recursively preprocess the included file.
				if (!isInclude) {
					outputLines.push(included);
					break;
				}
				const preprocessed = preprocess(included, opt);
				included = preprocessed.text;
				for (const [key, value] of preprocessed.defines) {
					if (defines.has(key)) log(1, key + ' is defined multiple times.');
					defines.set(key, value);
				}

				break;
			}
			case 'define': {
				const defMatch = text.match(define_regex);
				if (!defMatch) break;
				const [, name, rawParams, body] = defMatch;
				if (!rawParams) {
					defines.set(name, body);
					break;
				}

				const params = rawParams
					.split(',')
					.map(param => param.trim())
					.filter(param => param.length > 0);

				// Create a function-like macro.
				defines.set(name, (...args: string[]): string => {
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
				defines.delete(text.trim());
				break;
			}
			case 'line': {
				log(1, '#line is not supported.');
				break;
			}
			case 'error': {
				if (globalActive()) log(0, text);
				break;
			}
			case 'warning': {
				if (globalActive()) log(1, text);
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
		position += line.length + 1;
	}

	return {
		defines,
		text: outputLines.join('\n'),
	};
}
