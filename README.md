# XCompile

XCompile is designed as a robust tokenizer, parser, and compilation library.

The goal is to make implementing your own programming languages as easy as possible.

It is still a work in progress!

## Installing

```sh
npm install xcompile
```

If you're using XCompile, especially for big projects, please consider supporting the project. Your acknowledgment or financial support would go a long way toward improving the project and its community.

### Usage and Example

You can find examples of how to use XCompile below. The examples follow the handling of AT&T assembly, since it is easy to follow along.

## Tokenizing

You can tokenize some text using `tokenize` and providing an iterable (e.g. array) of `TokenDefinition`s to match against:

```ts
import { tokenize } from 'xcompile';

const source = `# This is AT&T assembly
mov	$100, %eax # move 100 into eax
mul $2,	%eax # multiply the value in eax by 2
mov %eax,0x1000 # move eax's value into memory
nop # do nothing
`;

const literals = [
	{ name: 'number', pattern: /^(0x)?\d+/ }, // note the caret is required
	{ name: 'identifier', pattern: /^[a-zA-Z_]\w*/ },
	{ name: 'register', pattern: /^%\w+/ },
	{ name: 'immediate', pattern: /^\$(0x)?\d+/ },
	{ name: 'whitespace', pattern: /^[ \t]+/ },
	{ name: 'line_terminator', pattern: /^[\n;]+/ },
	{ name: 'comment', pattern: /^#.*/ },
	{ name: ',', pattern: /^,/ },
];

const tokens = tokenize(source, literals);

console.log(tokens);
```

## Parsing

Tokenizing can be useful, but parsing these tokens into an AST is event more powerful. With great power comes... great amounts of configuration (unfortunately). You will need to write a set of rules, which you can then pass to `parse`.

You can pass `parse` either:

1. a list of `tokens` and the `literals` array or an array of `literals` name's (i.e. `string`)
2. the source and `literals`, which allows you to skip `tokenize`

In this example, we use the second form:

```ts
import { parse } from 'xcompile';

const ast = parse({
	source: `# This is AT&T assembly
mov	$100, %eax # move 100 into eax
mul $2,	%eax # multiply the value in eax by 2
mov %eax,0x1000 # move eax's value into memory
nop # do nothing
`,
	literals: [
		{ name: 'number', pattern: /^(0x)?\d+/ },
		{ name: 'identifier', pattern: /^[a-zA-Z_]\w*/ },
		{ name: 'register', pattern: /^%\w+/ },
		{ name: 'immediate', pattern: /^\$(0x)?\d+/ },
		{ name: 'whitespace', pattern: /^[ \t]+/ },
		{ name: 'line_terminator', pattern: /^[\n;]+/ },
		{ name: 'comment', pattern: /^#.*/ },
		{ name: ',', pattern: /^,/ },
	],
	ignoreLiterals: ['whitespace', 'comment'],
	definitions: [
		{
			name: 'operand',
			type: 'oneof',
			pattern: ['register', 'immediate', 'number'],
			// Note using a string for a pattern is a shortcut for { kind: <string>, type: 'required' }
		},
		{
			name: 'operand_list_continue',
			type: 'sequence',
			pattern: [
				{ kind: ',', type: 'required' },
				{ kind: 'operand', type: 'required' },
			],
		},
		{
			name: 'operand_list',
			type: 'sequence',
			pattern: [
				{ kind: 'operand', type: 'required' },
				{ kind: 'operand_list_continue', type: 'repeated' },
			],
		},
		{
			name: 'instruction',
			type: 'sequence',
			pattern: [
				{ kind: 'identifier', type: 'required' },
				{ kind: 'operand_list', type: 'optional' },
			],
		},
		{
			name: 'instruction_list_start',
			type: 'oneof',
			pattern: ['instruction', 'comment'],
		},
		{
			name: 'instruction_list_continue',
			type: 'oneof',
			pattern: ['line_terminator', 'instruction', 'comment'],
		},
		{
			name: 'instruction_list',
			type: 'oneof',
			pattern: [
				{ kind: 'instruction_list_start', type: 'required' },
				{ kind: 'instruction_list_continue', type: 'repeated' },
			],
		},
	],
	rootNode: 'instruction_list',
});

console.log(ast);
```

## JSON configuration

You may have noticed that configuration gets quiet long. You can organize your configuration into JSON:

```jsonc
{
	"rootNode": "instruction_list",
	"ignoreLiterals": ["whitespace", "comment"],
	"literals": [
		{ "name": "number", "pattern": "(0x)?\\d+" },
		// ...
	],
	"definitions": [
		// ...
	],
}
```

Notice that the patterns have a couple of small changes:
You do not prefix with a caret (`^`) and you must escape the string.

Using JSON you can simplify the code a lot:

```ts
import { readFileSync } from 'node:fs';
import { parse, config } from 'xcompile';

const json = JSON.parse(readFileSync('asm.json', 'utf-8'));

const ast = parse({
	...config.parseJSON(json),
	source: `# This is AT&T assembly
mov	$100, %eax # move 100 into eax
mul $2,	%eax # multiply the value in eax by 2
mov %eax,0x1000 # move eax's value into memory
nop # do nothing
`,
});

console.log(ast);
```

## `xcompile-dump-ast`

Using JSON configuration files, you can dump the AST of a file using the `xcompile-dump-ast` command. Assuming you've used `npm install --global`, you can remove the `npx` prefix:

```log
$ xcompile-dump-ast example.S -c asm.json
line_terminator "\n" 1:23
instruction 2:0
    identifier "mov" 2:0
    operand_list 2:4
        immediate "$100" 2:4
        operand_list#0 2:8
            , "," 2:8
            register "%eax" 2:10
line_terminator "\n" 2:34
instruction 3:0
    identifier "mul" 3:0
    operand_list 3:4
        immediate "$2" 3:4
        operand_list#0 3:6
            , "," 3:6
            register "%eax" 3:8
line_terminator "\n" 3:45
instruction 4:0
    identifier "mov" 4:0
    operand_list 4:4
        register "%eax" 4:4
        operand_list#0 4:8
            , "," 4:8
            number "0x1000" 4:9
line_terminator "\n" 4:46
instruction 5:0
    identifier "nop" 5:0
```

## EBNF files and `xcompile-bnf`

Writing configuration can be very tedious, which is why you can generate JSON configuration files from [Extended Backus–Naur form](https://en.wikipedia.org/wiki/Extended_Backus-Naur_form) files. For example:

asm.bnf:

```bnf
# AT & T assembly
# Oh, yeah, these are comments

# define a rule using <name> = <value>.
# In this case, we define "literals", which are for raw tokens and don't have any structure
number			= "(0x)?\d+";
identifier		= "[a-zA-Z_]\w*";
register		= "%\w+";
immediate		= "\$(0x)?\d+";
whitespace		= "[ \t]+";
line_terminator	= "[\n;]+";
comment			= "#.*";

# A double "#" indicates a directive. `ignore` is used to define which tokens will be ignored
##ignore whitespace line_terminator comment

# pipes are used for unions, so `A | B` can be though of as "A or B"
operand = register | immediate | number;

# commas are used for items in sequence. Braces indicate repetition
operand_list = operand, {",", operand};

# brackets are optional items
instruction	= identifier, [operand_list];

# parenthesis are used for normal groups
instruction_list = (instruction | comment), {line_terminator, instruction | comment};

# the `root` directive tells xcompile what the root element of the AST is
##root instruction_list

```

You can then generate a JSON configuration file using `xcompile-bnf`:

```sh
xcompile-bnf asm.bnf --format json --output asm.json
```

See `xcompile-bnf --help` for more info.
