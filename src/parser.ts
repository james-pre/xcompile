import type { Token } from './tokens';

export interface DefinitionReference {
	kind: string;
	optional?: boolean;
}

export interface NodeDefinition {
	name: string;
	type: 'composite' | 'oneof';
	pattern: (string | DefinitionReference)[];
}

export interface Node extends Token {
	children: Node[];
}

export function parse(tokens: Iterable<Token>, definitions: Iterable<NodeDefinition>): Node[] {
	// parse into tree
}
