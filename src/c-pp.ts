import type { Issue, IssueLevel } from './issue.js';

const directive_regex = /^\s*#\s*([a-zA-Z]\w*)(?:\s+(.*))?$/;
const define_regex = /^(\w+)(?:\(([^)]*)\))?\s+(.*)$/;
const char_constant = /\b(u8|u|U|L)?'((?:[^'\\\n]|\\['"\\?abfnrtv]|\\[0-7]{1,3}|\\x[\dA-Fa-f]+|\\u[\dA-Fa-f]{4}|\\U[\dA-Fa-f]{8})*)'/gi;

type DefineValue = string | number | boolean | undefined;

export type Define = DefineValue | ((...args: string[]) => DefineValue);

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
	file?(name: string, startRelative: boolean, isNext: boolean, isInclude: boolean, unit: string): FileInfo;
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

// Built-in macro functions and constants available to the evaluated expression.
const builtins = {
	__X_UNDEFINED: () => undefined,

	// standard macros
	__DATE__: new Date()
		.toLocaleDateString('default', { month: 'short', day: '2-digit', year: 'numeric' })
		.replace(',', '')
		.replace(/\b0(\d)/, ' $1'),
	__TIME__: new Date().toLocaleTimeString('default', { hourCycle: 'h23' }),
	__STDC__: 1,
	__STDC_VERSION__: 202311,

	// kernel
	__x86_64__: 1,
	__LITTLE_ENDIAN_BITFIELD: 1,
	__BYTE_ORDER: 1234,

	// GCC stuff
	__GNUC__: undefined,
	__GNUC_PREREQ: (maj: number, min: number) => 0,
	__GNUC_MINOR__: undefined,
	__GNUC_PATCHLEVEL__: undefined,
	__need_size_t: true,

	// GCC built-ins
	__SCHAR_MAX__: 0x7f,
	__WCHAR_MAX__: 0x7fffffff,
	__SHRT_MAX__: 0x7fff,
	__INT_MAX__: 0x7fffffff,
	__LONG_MAX__: 0x7fffffffffffffffn,
	__LONG_LONG_MAX__: 0x7fffffffffffffffn,
	__WINT_MAX__: 0x7fffffff,
	__SIZE_MAX__: 0xffffffffffffffffn,
	__PTRDIFF_MAX__: 0x7fffffffffffffffn,
	__INTMAX_MAX__: 0x7fffffffffffffffn,
	__UINTMAX_MAX__: 0xffffffffffffffffn,
	__SIG_ATOMIC_MAX__: 0x7fffffff,
	__INT8_MAX__: 0x7f,
	__INT16_MAX__: 0x7fff,
	__INT32_MAX__: 0x7fffffff,
	__INT64_MAX__: 0x7fffffffffffffffn,
	__UINT8_MAX__: 0xff,
	__UINT16_MAX__: 0xffff,
	__UINT32_MAX__: 0xffffffff,
	__UINT64_MAX__: 0xffffffffffffffffn,
	__INT_LEAST8_MAX__: 0x7f,
	__INT_LEAST16_MAX__: 0x7fff,
	__INT_LEAST32_MAX__: 0x7fffffff,
	__INT_LEAST64_MAX__: 0x7fffffffffffffffn,
	__UINT_LEAST8_MAX__: 0xff,
	__UINT_LEAST16_MAX__: 0xffff,
	__UINT_LEAST32_MAX__: 0xffffffff,
	__UINT_LEAST64_MAX__: 0xffffffffffffffffn,
	__INT_FAST8_MAX__: 0x7f,
	__INT_FAST16_MAX__: 0x7fff,
	__INT_FAST32_MAX__: 0x7fffffff,
	__INT_FAST64_MAX__: 0x7fffffffffffffffn,
	__UINT_FAST8_MAX__: 0xff,
	__UINT_FAST16_MAX__: 0xffff,
	__UINT_FAST32_MAX__: 0xffffffff,
	__UINT_FAST64_MAX__: 0xffffffffffffffffn,
	__INTPTR_MAX__: 0x7fffffffffffffffn,
	__UINTPTR_MAX__: 0xffffffffffffffffn,
	__WCHAR_MIN__: -0x80000000,
	__WINT_MIN__: 0,
	__SIG_ATOMIC_MIN__: -0x80000000,
	__SCHAR_WIDTH__: 8,
	__SHRT_WIDTH__: 16,
	__INT_WIDTH__: 32,
	__LONG_WIDTH__: 64,
	__LONG_LONG_WIDTH__: 64,
	__PTRDIFF_WIDTH__: 64,
	__SIG_ATOMIC_WIDTH__: 32,
	__SIZE_WIDTH__: 64,
	__WCHAR_WIDTH__: 32,
	__WINT_WIDTH__: 32,
	__INT_LEAST8_WIDTH__: 8,
	__INT_LEAST16_WIDTH__: 16,
	__INT_LEAST32_WIDTH__: 32,
	__INT_LEAST64_WIDTH__: 64,
	__INT_FAST8_WIDTH__: 8,
	__INT_FAST16_WIDTH__: 16,
	__INT_FAST32_WIDTH__: 32,
	__INT_FAST64_WIDTH__: 64,
	__INTPTR_WIDTH__: 64,
	__INTMAX_WIDTH__: 64,
	__CHAR_BIT__: 8,

	// clang
	__clang_major__: undefined,
	__clang_minor__: undefined,

	// idk
	__has_c_attribute: () => 0,
	__has_include_next: () => 0,
	__BEGIN_DECLS: ' ',
	__END_DECLS: ' ',

	// coreutils / GNU lib
	HAVE_WINSOCK2_H: undefined,
	MAJOR_IN_MKDEV: undefined,
	ENABLE_RELOCATABLE: undefined,
	HAVE_MINMAX_IN_LIMITS_H: undefined,
	C_CTYPE_ASCII: true,
	GNULIB_STATAT: undefined,
};

/**
 * Parses a C character constant (the content inside the quotes) and returns its numeric value along with its type.
 * For multi‐character constants, only the first character is used.
 */
function parseCharConstant(content: string, max: 8 | 16 | 32): number {
	if (!content.length) return 0;
	if (content[0] != '\\') return content.charCodeAt(0);
	if (content.startsWith("\\'")) return "'".charCodeAt(0);
	if (content.startsWith('\\?')) return '?'.charCodeAt(0);

	if (/\\([abfnrtv"\\])/.test(content)) return JSON.parse(`"${content}"`).charCodeAt(0);

	const escaped_octal = content.match(/^\\([0-7]{1,3})/);
	if (escaped_octal) return parseInt(escaped_octal[1], 8);

	const escaped_hex = content.match(/^\\x([\dA-Fa-f]+)/);
	if (escaped_hex) return parseInt(escaped_hex[1], 16);

	if (max < 16) return content.charCodeAt(1);

	const escaped_utf16 = content.match(/^\\u([\dA-Fa-f]{4})/);
	if (escaped_utf16) return parseInt(escaped_utf16[1], 16);

	if (max < 32) return content.charCodeAt(1);

	const escaped_utf32 = content.match(/^\\U([\dA-Fa-f]{8})/);
	if (escaped_utf32) return parseInt(escaped_utf32[1], 16);

	return content.charCodeAt(1);
}

/**
 * This function evaluates a expression in conditional directives.
 * It performs various replacements (numeric suffix removal, defined(...) substitution,
 * identifier replacement) and then evaluates the resulting JavaScript expression.
 *
 * @param expression The original expression.
 * @param log A function used to log errors encountered during evaluation.
 * @param defines The current macro definitions.
 * @returns The evaluated result (typically a number whose truthiness is used for #if conditions).
 *
 */
function evaluateExpression(expression: string, log: (level: IssueLevel, message: string) => void, defines: Map<string, Define>): any {
	expression = expression
		// 'e' -> 101
		.replaceAll(char_constant, (match, prefix, content) => parseCharConstant(content, prefix == 'U' || prefix == 'L' ? 32 : prefix == 'u' ? 16 : 8).toString())
		// 123u -> 123
		.replaceAll(/\b(0x[\da-fA-F]+|\d+)([uUlL]+)\b/g, '$1')
		// defined x -> defined(x)
		.replaceAll(/\bdefined\s+(\w+)/g, (_, name) => `defined(${name})`)
		// EXAMPLE(X) -> EXAMPLE(`X`)
		.replaceAll(/\b(\w+)\s*\(\s*(\w+(?:\s*,\s*\w+)*)\s*\)/g, (_, name, args) => {
			const argList = args
				.split(/\s*,\s*/)
				.map((arg: string) => '`' + arg.replaceAll('`', '\\`') + '`')
				.join(', ');
			return `${name}(${argList})`;
		});

	const args: Record<string, any> = {
		...builtins,
		...Object.fromEntries(defines),
		defined(macro: string) {
			return macro in args;
		},
	};

	try {
		// The built-in functions are passed as parameters.
		// eslint-disable-next-line @typescript-eslint/no-implied-eval
		const eval_expression = new Function(...Object.keys(args), `return (${expression});`);
		return eval_expression(...Object.values(args));
	} catch (e: any) {
		log(0, 'Failed to evaluate condition: ' + e);
		return undefined;
	}
}

function sameWhitespace(match: string) {
	return match
		.split('\n')
		.map(l => ' '.repeat(l.length))
		.join('\n');
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
		source = source.replace(/\/\*[\s\S]*?\*\//g, sameWhitespace);
		// Remove line comments.
		source = source.replace(/\/\/.*$/gm, sameWhitespace);
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

		opt.defines.set('__FILE__', opt.unit);
		opt.defines.set('__LINE__', i + 1);

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
				const conditionValue = active && evaluateExpression(text, log, opt.defines);
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
					const conditionValue = evaluateExpression(text, log, opt.defines);
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
			case 'embed':
			case 'include_next':
			case 'embed_next': {
				const isNext = directive.endsWith('_next');
				const isInclude = (isNext ? directive.slice(0, -5) : directive) === 'include';
				if (!opt.file) {
					log(0, 'Cannot import a file');
					break;
				}

				const trimmedText = text.trim();
				let startRelative: boolean;
				let name: string;
				let m: RegExpMatchArray | null;
				if ((m = trimmedText.match(/^<([^>]+)>/))) {
					name = m[1].trim();
					startRelative = false;
				} else if ((m = trimmedText.match(/^"([^"]+)"/))) {
					name = m[1].trim();
					startRelative = true;
				} else {
					log(1, 'Malformed directive: ' + line);
					break;
				}

				let { contents: included, unit = name } = opt.file(name, startRelative, isNext, isInclude, opt.unit);
				// For #include, recursively preprocess the included file.
				if (isInclude) {
					if (!startRelative && opt._files.has(name)) break;
					if (!startRelative) opt._files.add(name);

					const preprocessed = preprocess(included, { ...opt, unit });
					included = preprocessed.text;
				}
				outputLines.push(included);

				break;
			}
			case 'define': {
				const defMatch = text.match(define_regex);
				if (!defMatch) break;
				const [, name, rawParams, rawBody] = defMatch;

				// Replace `defined X`
				const body = rawBody.replaceAll(/\bdefined\s+(\w+)/g, (_, name) => `defined("${name}")`);

				if (!rawParams) {
					opt.defines.set(name, body);
					break;
				}

				const params = rawParams
					.split(',')
					.map(param => param.trim())
					.filter(param => param.length > 0);

				opt.defines.set(name, (...args: string[]): string => {
					let result = body;
					for (let i = 0; i < params.length; i++) {
						result = result.replace(new RegExp(`\\b${params[i]}\\b`, 'g'), args[i] ?? '');
					}

					return body
						.split('##')
						.map(part => {
							let token = part.trim();
							for (let i = 0; i < params.length; i++) {
								const param = params[i];
								const arg = args[i] || '';
								token = token.split(param).join(arg);
							}
							return token;
						})
						.join('');
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

export const maxMacroDepth = 25;

function inlineMacrosString(text: string, defines: Map<string, Define>, opt?: PreprocessOptions, depth: number = 0): string {
	if (depth >= maxMacroDepth) return text;

	for (const [name, define] of defines) {
		if (typeof define == 'function') continue;
		const regex = new RegExp(`\\b${name}\\b`, 'g');
		text = text.replaceAll(regex, define?.toString() ?? '');
	}

	for (const [name, define] of defines) {
		if (typeof define != 'function') continue;
		const regex = new RegExp(`\\b${name}\\s*\\(([^)]*)\\)`, 'g');
		text = text.replaceAll(regex, (_, rawArgs) => {
			const args = rawArgs.split(',').map((arg: string) => arg.trim());
			// Expand the macro call.
			let expansion = define(...args)?.toString() ?? '';
			// Recursively inline macros in the returned expansion.
			expansion = inlineMacrosString(expansion, defines, opt, depth + 1);
			return expansion;
		});
	}
	return text;
}

export function inlineMacros(pre: Preprocessed, opt?: PreprocessOptions): void {
	pre.text = inlineMacrosString(pre.text, pre.defines, opt, 0);
}
