export const versions = {
	xir: { displayName: 'XIR', major: 0, minor: 0, text: 0 },
	clang: { displayName: 'Clang', major: 0, minor: 0 },
	typescript: { displayName: 'TypeScript', major: 0, minor: 0 },
};

/**
 * @internal
 */
export function versionsText(): string {
	return Object.entries(versions)
		.map(([id, { displayName, major, minor, ...rest }]) => {
			const others = Object.entries(rest);
			const othersText = others.length ? '(' + others.map(([name, v]) => `${name} v${v}`).join(', ') + ')' : '';
			return `${displayName ?? id}: ${major}.${minor} ${othersText}`;
		})
		.join('\n');
}
