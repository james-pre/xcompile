import type { NodeDefinition } from './parser.js';
import type { TokenDefinition } from './tokens.js';

export interface Json {
	literals: { name: string; pattern: string }[];
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

/**
 * Parses a JSON configuration into a normal configuration
 */
export function parseJSON(config: Json): Config {
	return {
		...config,
		literals: config.literals.map(literal => ({ name: literal.name, pattern: new RegExp('^(' + literal.pattern + ')') })),
	};
}
