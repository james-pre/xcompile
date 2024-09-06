import type { Token } from './tokenizer';

export interface Node extends Token {
	children: Node[];
}

export function parse(tokens: Iterable<Token>): Node[] {
	return [];
}
