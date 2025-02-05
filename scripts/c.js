#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { _findAllKinds, _kinds } from '../dist/c.js';

const {
	values: { property: properties, value: values, ...opt },
	positionals: [input],
} = parseArgs({
	options: {
		property: { short: 'p', type: 'string', multiple: true, default: [] },
		value: { short: 'v', type: 'string', multiple: true, default: [] },
		help: { short: 'h', type: 'boolean', default: false },
		less: { short: 'N', type: 'boolean' },
		union: { short: 'U', type: 'boolean' },
	},
	allowPositionals: true,
});

if (opt.help || !input) {
	console.log(`Usage: xcompile-dump [options] <file>
Options:
    -h, --help            Display this help message`);
	process.exit(1);
}

const data = readFileSync(input, 'utf8');
const jsonData = JSON.parse(data);

const kv_max = Math.max(properties.length, values.length);

// Use sets to de-duplicate results
const kind = new Set();
const propValues = [];
const missing = [];
const different = [];

for (let i = 0; i < kv_max; i++) {
	propValues[i] = new Set();
	missing[i] = new Set();
	different[i] = new Set();
}

// Recursive function to find nodes with castKind
function findNodes(node) {
	if (typeof node != 'object') return;

	if (node.inner)
		for (const child of node.inner) {
			findNodes(child);
		}

	let shouldAdd = true;

	for (let i = 0; i < kv_max; i++) {
		const p = properties[i];
		const v = values[i];

		if (!node[p]) {
			shouldAdd = false;
			missing[i].add(node.kind);
			continue;
		}

		if (!v) {
			propValues[i].add(node[p]);
			continue;
		}

		if (node[p] == v) continue;

		shouldAdd = false;
		if (kind.has(node.kind)) {
			different[i].add(node.kind);
		}
	}

	if (!shouldAdd) return;

	kind.add(node.kind);
}

findNodes(jsonData);

function list(items) {
	const sorted = [...items].sort();
	return opt.union ? sorted.map(c => `'${c}'`).join('| ') : sorted.join(', ');
}

console.log('Correct kinds:', list(kind));

for (let i = 0; i < kv_max; i++) {
	const p = properties[i];
	const v = values[i];

	console.log(`\nMissing ${p}:`, list(missing[i].difference(kind)));
	console.log(`\nOptional ${p}:`, list(missing[i].intersection(kind)));

	if (!v) {
		!opt.less && console.log(`\nValues for ${p}:`, list(propValues[i]));
	} else {
		console.log(`\nDifferent ${p}:`, list(different[i]));
	}
}
