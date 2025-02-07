export const versions = {
	xir: { displayName: 'XIR', main: 0.1, text: 0.1 },
	clang: { displayName: 'Clang', main: 0.1 },
	typescript: { displayName: 'TypeScript', main: 0.1 },
};

/**
 * @internal
 */
export function versionsText(): string {
	return Object.entries(versions)
		.map(([id, { displayName, main, ...rest }]) => {
			const others = Object.entries(rest);
			const othersText = others.length ? '(' + others.map(([name, v]) => `${name} v${v}`).join(', ') + ')' : '';
			return `${displayName ?? id}: ${main} ${othersText}`;
		})
		.join('\n');
}
