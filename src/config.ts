import type { NodeDefinition } from './parser.js';
import type { TokenDefinition } from './tokens.js';

export interface TokenDefinitionJSON {
	name: string;
	pattern: string;
	flags?: string;
}

export interface Json {
	literals: TokenDefinitionJSON[];
	definitions: NodeDefinition[];
	rootNodes: string[];
	ignoreLiterals: string[];
}

export interface Config {
	literals: TokenDefinition[];
	definitions: NodeDefinition[];
	rootNodes: string[];
	ignoreLiterals: string[];
}

export function parseLiteral(literal: TokenDefinitionJSON): TokenDefinition {
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
export function parseJSON(config: Json): Config {
	return {
		...config,
		literals: config.literals.map(parseLiteral),
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
