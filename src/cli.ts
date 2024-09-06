import { inspect, parseArgs } from 'node:util';
import { tokenize } from './tokenizer';
import { readFileSync } from 'node:fs';

const { values, positionals: [input] } = parseArgs({
	options: {

	},
	allowPositionals: true
});

const source = readFileSync(input, 'utf8');

const tokens = tokenize(source);

for(const token of tokens) {
	console.log(inspect(token, { colors: true, compact: true }));
}