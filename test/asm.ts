const genericTokens: GenericToken[] = [
	{ name: 'register', pattern: /^%(\w+)/ },
	{ name: 'immediate', pattern: /^\$((0x)?(\d+))/ },
	{ name: 'address', pattern: /^((0x)?(\d+))/ },
	{ name: 'identifier', pattern: /^(\w+)/ },
	{ name: 'whitespace', pattern: /^(\s+)/ },
	{ name: 'comma', pattern: /^(,)/ },
];
