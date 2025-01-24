import rawConfig from './bnf.json' with { type: 'json' };
import type { Config, Json, PureConfig } from './config.js';
import { parseJSON } from './config.js';
import type { Issue, IssueLevel } from './issue.js';
import type { AST, DefinitionPart, LogFn, Logger, Node } from './parser.js';
import { logger, parse } from './parser.js';
import type { Token } from './tokens.js';
import { locationText, tokenize } from './tokens.js';

const bnfConfig = parseJSON(rawConfig as Json);

export { bnfConfig as config };

/**
 * Shortcut for tokenize(source, bnf.literals);
 */
function tokenizeBnf(source: string, unit?: string): Token[] {
	return tokenize(source, bnfConfig.literals, unit);
}

export { tokenizeBnf as tokenize };

export function parseSource(source: string, log?: LogFn, unit?: string): AST {
	return parse({ ...bnfConfig, log, source, id: unit });
}

function parseBnf(tokens: Token[], log?: LogFn): AST {
	return parse({ ...bnfConfig, log, tokens });
}

export { parseBnf as parse };

const typeForGroup = {
	left_bracket: 'optional',
	left_brace: 'repeated',
	left_paren: 'required',
} as const;

export interface CreateConfigOptions {
	log?: LogFn;
	include?: (name: string) => Node[];
	id?: string;
}

interface CreateConfigContext extends CreateConfigOptions {
	/**
	 * The current depth
	 */
	depth: number;

	/**
	 * The config being created
	 */
	config: PureConfig;

	/**
	 * Get a logger for a node
	 */
	logger(node: Node): [Logger, (level: IssueLevel, message: string) => Issue];
}

/**
 * Creates a copy of a context for use with children.
 * Right now this just increments the depth
 */
function childContext(context: CreateConfigContext): CreateConfigContext {
	return {
		...context,
		depth: context.depth + 1,
	};
}

function configProcessDirective($: CreateConfigContext, node: Node) {
	const [log, logIssue] = $.logger(node);

	const [, directive, contents] = node.text.match(/##(\w+) (.*)/i)!;

	switch (directive) {
		// ##ignore <rules...>
		case 'root':
			$.config.root_nodes.push(...contents.split(/[ ,;]/));
			break;
		// ##ignore <rules...>
		case 'ignore':
			$.config.ignored_literals.push(...contents.split(/[ ,;]/));
			break;
		// ##include <file.bnf>
		case 'include':
			if (!$.include) {
				logIssue(1, 'Missing include()');
				break;
			}
			log(1, 'Including: ' + contents);
			for (const node of $.include(contents)) {
				configProcessNode(childContext($), node);
			}
			break;
		// ##flags <rule> <flags>
		case 'flags': {
			const [, name, flags] = contents.match(/(\w+)\s+(\w+)/) || [];
			const literal = $.config.literals.find(({ name: n }) => n == name);
			if (!literal) {
				logIssue(1, '##flags references missing literal: ' + name);
				break;
			}

			literal.pattern = new RegExp(literal.pattern.source, flags);

			break;
		}
		// ##groups <rule> <names...>
		case 'groups': {
			const [, name, rawGroupNames] = contents.match(/(\w+)\s+(.+)/) || [];
			const groupNames = rawGroupNames.split(/[\s,]+/);
			const rule = $.config.definitions.find(d => d.name == name);
			if (!rule) {
				logIssue(1, '##groups: missing rule ' + JSON.stringify(name));
				break;
			}
			for (let i = 0; i < groupNames.length; i++) {
				const group = $.config.definitions.find(d => d.name == name + '#' + i);

				if (!group) {
					logIssue(1, '##groups: missing group ' + i);
					break;
				}

				const newGroupName = groupNames[i].replaceAll('%', name);

				for (const part of $.config.definitions.flatMap(d => d.pattern)) {
					if (part.kind == group.name) {
						part.kind = newGroupName;
					}
				}

				log(1, `Renaming group: ${group.name} -> ${newGroupName}`);
				group.name = newGroupName;
			}
			break;
		}
		default:
			logIssue(2, 'unsupported directive: ' + directive);
	}
}

/**
 * Info about a rule that is used when parsing an expression
 */
interface RuleInfo {
	/**
	 * The name of the rule being parsed.
	 * Used for group names.
	 */
	name?: string;

	/**
	 * The number of groups in the rule.
	 * Used for group names.
	 */
	groups: number;
}

/**
 * An expression parsed by `configProcessExpression`.
 * This might be change to an object later.
 */
type ParsedExpression = [pattern: DefinitionPart[], isAlternation: boolean];

function configProcessExpression($: CreateConfigContext, expression: Node, rule: RuleInfo): ParsedExpression {
	const $sub = childContext($);

	let isAlternation = false;

	const [_log, logIssue] = $.logger(expression);

	const pattern: DefinitionPart[] = [];

	for (const child of expression.children || []) {
		if (child.kind == 'pipe') {
			isAlternation = true;
			_log(2, 'Found pipe in expression');
			continue;
		}

		if (child.kind == 'expression_continue' || child.kind == 'expression#0') {
			_log(2, 'Found expression_continue');
			let next;
			[next, isAlternation] = configProcessExpression($sub, child, rule);
			pattern.push(...next);
			continue;
		}

		if (child.kind != 'sequence' && child.kind != 'sequence_continue' && child.kind != 'sequence#0') {
			_log(2, 'Invalid expression child: ' + child.kind);
			continue;
		}

		_log(2, `Parsing sequence at ${child.line}:${child.column}`);
		if (!child.children.length) {
			_log(2, 'Sequence has no children');
			continue;
		}

		for (const grandchild of child.children) {
			const node = grandchild.children[0] ?? grandchild;

			_log(2, `Parsing ${node.kind} "${node.text}" at ${node.line}:${node.column}`);
			switch (node.kind) {
				case 'string': {
					const quote = node.text.charAt(0); // either ' or "

					// Remove the surrounding quotes
					const text = node.text.slice(1, -1).replaceAll('\\' + quote, quote);

					try {
						const regex = new RegExp('^' + text);

						if (!$.config.literals.some(l => l.name == text)) {
							$.config.literals.push({ name: text, pattern: regex });
						}
					} catch (e: any) {
						throw logIssue(0, `invalid literal: ${text} (${e.message})`);
					}

					pattern.push({ kind: text, type: 'required' });
					break;
				}
				case 'identifier': {
					const modifer = grandchild.children[1]?.kind;
					pattern.push({
						kind: node.text,
						type: modifer == '\\?' ? 'optional' : modifer == '\\*' ? 'repeated' : 'required',
					});
					break;
				}
				case 'left_bracket':
				case 'left_brace':
				case 'left_paren': {
					const inner = grandchild.children.find(({ kind }) => kind == 'expression');
					if (!inner) {
						_log(1, 'Missing inner expression (empty?)');
						break;
					}

					const type = typeForGroup[node.kind];

					const [subPattern, isAlternation] = configProcessExpression($sub, inner, rule);

					// Check if subPattern contains another rule name, if so, no need to create a new group
					const existing = subPattern.length == 1 && subPattern[0].kind !== 'string' ? subPattern[0].kind : null;
					if (existing) {
						pattern.push({ kind: existing, type });
						break;
					}

					const subName = `${rule.name}#${rule.groups++}`;

					$.config.definitions.push({
						name: subName,
						type: isAlternation ? 'alternation' : 'sequence',
						pattern: subPattern,
					});

					// Append the new rule name to the pattern, marked as optional or repeated
					pattern.push({ kind: subName, type });

					break;
				}
				default:
					_log(1, `Unexpected kind "${node.kind}" of expression grandchild`);
					break;
			}
		}
	}

	return [pattern, isAlternation];
}

export interface RuleAttributes {
	root?: boolean;
	ignore?: boolean;
	[k: string]: string | number | boolean | undefined;
}

function configProcessRule($: CreateConfigContext, rule: Node): void {
	const [log, logIssue] = $.logger(rule);

	if (!rule.children) {
		logIssue(0, 'Invalid rule (missing contents)');
		return;
	}

	// Extract the rule name (identifier) and its expression
	const name = rule.children.find(child => child.kind === 'identifier')?.text;

	const expression = rule.children.find(child => child.kind === 'expression');

	log(2, `Found rule "${name}" at ${rule.line}:${rule.column}`);
	if (!name || !expression) {
		// A rule missing a name should *never* happen

		logIssue(+!!name, name ? `Rule "${name}" is missing a value` : 'Rule is missing name (unreachable!)');
		return;
	}

	const attributes: RuleAttributes = {};
	const attributeNodes = rule.children.filter(child => child.kind == 'attribute');

	for (const node of attributeNodes) {
		const [, idNode, valueNode = null] = node.children;

		let value = true;
		if (valueNode) {
			const [, { kind, text }] = valueNode.children;

			if (kind == 'identifier') {
				$.logger(valueNode)[1](1, 'Using identifiers for attribute values is not supported yet (value set to null)');
			}

			value = kind == 'string' ? JSON.parse(text) : kind == 'number' ? parseFloat(text) : null;
		}

		attributes[idNode.text] = value;
	}

	const [pattern, isAlternation] = configProcessExpression(childContext($), expression, { name, groups: 0 });

	if (attributes.root) $.config.root_nodes.push(name);

	/*
		Inline single-use literals
		For example:
		`ws = "[ \t]+";`
		Gets converted to
			"[ \\t]+": /[ \t]+/ (a literal)
			ws: [ { kind: "[ \\t]+", required: true } ] (a definition)
		This collapses it, so we have
			ws: /[ \t]+/ (a literal)
	*/

	const maybeLiteral = pattern[0].kind;

	const index = $.config.literals.findIndex(l => l.name == maybeLiteral);
	if (index != -1 && pattern.length == 1 && pattern[0].type == 'required' && $.config.literals[index].pattern.source.slice(1) == pattern[0].kind) {
		try {
			const pattern = new RegExp('^' + maybeLiteral);
			$.config.literals.splice(index, 1, { name, pattern });
			if (attributes.ignore) $.config.ignored_literals.push(name);
			return;
		} catch (e: any) {
			throw logIssue(0, `invalid literal: ${name} (${e.message})`);
		}
	}

	// Add the NodeDefinition for this rule
	$.config.definitions.push({
		name,
		type: isAlternation ? 'alternation' : 'sequence',
		pattern: pattern.map(part => (typeof part === 'string' ? { kind: part, type: 'required' } : part)),
	});
}

function configProcessNode($: CreateConfigContext, node: Node): void {
	const [log] = $.logger(node);

	log(3, `Processing ${node.kind} (${locationText(node)})`);

	switch (node.kind) {
		case 'directive':
			configProcessDirective($, node);
			return;
		case 'rule':
			configProcessRule($, node);
			return;
		default:
			// Recursively process child nodes
			for (const child of node.children || []) {
				configProcessNode(childContext($), child);
			}
			return;
	}
}

export function createConfig(ast: AST, options: CreateConfigOptions): Config {
	const config: PureConfig = {
		definitions: [],
		literals: [],
		root_nodes: [],
		ignored_literals: [],
	};

	const context = {
		...options,
		depth: 0,
		config,
		groups: 0,
		logger(node?: Node): [Logger, (level: IssueLevel, message: string) => Issue] {
			const _log = logger(this.log, { depth: this.depth, kind: node?.kind || 'node' });

			const sharedIssueInfo: Omit<Issue, 'level' | 'message' | 'stack'> = {
				location: node,
				source: ast.source,
			};

			function _logIssue(level: IssueLevel, message: string): Issue {
				const { stack } = new Error();
				const issue = { ...sharedIssueInfo, level, message, stack };
				_log(issue);
				return issue;
			}

			return [_log, _logIssue];
		},
	};

	// Start processing from the root node
	for (const node of ast.nodes) {
		configProcessNode(context, node);
	}

	if (!config.root_nodes?.length) {
		context.logger()[1](1, 'No root nodes are defined! You will need to add root node(s) manually.');
	}

	return config;
}
