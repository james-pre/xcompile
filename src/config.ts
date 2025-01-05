import type { NodeDefinition, PureNodeDefinition } from './parser.js';
import type { TokenDefinition } from './tokens.js';

export interface TokenDefinitionJSON {
	name: string;
	pattern: string;
	flags?: string;
}

/**
 * Shared between different config formats
 */
export interface Common {
	root_nodes: string[];
	ignored_literals: string[];
}

export interface Json extends Common {
	literals: TokenDefinitionJSON[];
	definitions: NodeDefinition[];
}

export interface Config extends Common {
	literals: TokenDefinition[];
	definitions: NodeDefinition[];
}

export interface PureConfig extends Common {
	literals: TokenDefinition[];
	definitions: PureNodeDefinition[];
}

export function parse_json_literal(literal: TokenDefinitionJSON): TokenDefinition {
	const $ = literal.pattern.endsWith('$');

	if ($) literal.pattern = literal.pattern.slice(0, -1);

	return {
		name: literal.name,
		pattern: new RegExp('^(' + literal.pattern + ')' + ($ ? '$' : ''), literal.flags),
	};
}

/**
 * Parses a JSON configuration into a normal configuration
 */
export function parse_json(config: Json): Config {
	return {
		...config,
		literals: config.literals.map(parse_json_literal),
	};
}

/**
 * Compresses definition patterns by converting `{ kind: x, type: 'required' }` to `x`
 */
export function compress(config: Config): Config {
	return {
		...config,
		definitions: config.definitions.map(def => ({
			...def,
			pattern: def.pattern.map(part => (typeof part === 'string' ? part : part.type == 'required' ? part.kind : part)),
		})),
	};
}
