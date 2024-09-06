import type { GenericToken, Token } from './tokenizer';

export interface Node extends Token {
	children: Node[];
}

export function parse(tokens: Iterable<Token>, genericTokens: Iterable<GenericToken>): Node[] {
	// parse into tree
}
