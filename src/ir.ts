// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * A high-level intermediate representation used by XCompile.
 * Copyright (c) 2025 James Prevett
 */
import type { TypeName } from 'memium/primitives';
import { isTypeName as isPrimitive } from 'memium/primitives';

export type BuiltinType = TypeName | 'void' | 'bool';

export function isBuiltin(type: string): type is BuiltinType {
	return isPrimitive(type) || type == 'void' || type == 'bool';
}

export function baseType(type: Type): string {
	switch (type.kind) {
		case 'plain':
			return type.text;
		case 'array':
			return baseType(type.element);
		case 'ref':
			return baseType(type.to);
		case 'function':
			return `((${type.args.map((param, i) => `_${i}: ${baseType(param)}`).join(', ')}) => ${baseType(type.returns)})`;
		case 'qual':
		case 'namespaced':
			return baseType(type.inner);
	}
}

export type TypeQualifier = string;

export type Type =
	| { kind: 'plain'; text: string; raw?: Type }
	| { kind: 'array'; length: number | null; element: Type }
	| { kind: 'ref'; to: Type; restricted?: boolean }
	| { kind: 'function'; returns: Type; args: Type[] }
	| { kind: 'qual'; qualifier: TypeQualifier; inner: Type }
	| { kind: 'namespaced'; namespace: string; inner: Type };

export function typeHasQualifier(type: Type | null, qual: TypeQualifier): boolean {
	if (!type) return false;
	switch (type.kind) {
		case 'function':
			return typeHasQualifier(type.returns, qual);
		case 'plain':
			return false;
		case 'array':
			return typeHasQualifier(type.element, qual);
		case 'ref':
			return typeHasQualifier(type.to, qual);
		case 'namespaced':
			return typeHasQualifier(type.inner, qual);
		case 'qual':
			return type.qualifier == qual;
	}
}

export type RecordInitializer = { field: string; value: Value }[];

export type ValueContents = string | RecordInitializer;

export interface Value {
	kind: 'value';
	type: Type;
	content: ValueContents;
}

export type Postfix =
	| { type: 'bracket_access'; key: Expression[] }
	| { type: 'call'; args: Expression[] }
	| { type: 'access' | 'access_ref'; key: string }
	| { type: 'increment' | 'decrement' };

export interface Postfixed {
	kind: 'postfixed';
	primary: Expression[];
	post: Postfix;
}

export interface Cast {
	kind: 'cast';
	type: Type;
	value: Expression;
}

export interface Unary {
	kind: 'unary';
	operator: '++' | '--' | '~' | '!' | '+' | '-' | '&' | '*';
	expression: Expression[];
}

export interface Binary {
	kind: 'binary';
	operator:
		| '&'
		| '*'
		| '+'
		| '-'
		| '/'
		| '%'
		| '=='
		| '==='
		| '!='
		| '>='
		| '<='
		| '^'
		| '|'
		| '&&'
		| '||'
		| '??'
		| '<<<'
		| '>>>'
		| '<<'
		| '>>'
		| '<'
		| '>'
		| ',';
	left: Expression[];
	right: Expression[];
}

export interface Assignment {
	kind: 'assignment';
	operator: '=' | '*=' | '/=' | '%=' | '+=' | '-=' | '&=' | '^=' | '|=' | '>>=' | '<<=';
	left: Expression[];
	right: Expression[];
}

export interface Ternary {
	kind: 'ternary';
	condition: Expression[];
	true: Expression[];
	false: Expression[];
}

export type Expression = Assignment | Unary | Binary | Ternary | Cast | Postfixed | Value;

export interface Conditional {
	condition: Expression[];
	body: Unit[];
}

export type StorageClass = 'extern' | 'static';

export interface Declaration {
	kind: 'declaration' | 'field' | 'parameter';
	name: string;
	type: Type | null;
	initializer?: Value;
	storage?: StorageClass;
	index?: number;
	exported?: boolean;
}

export interface Function {
	kind: 'function';
	returns: Type;
	parameters: Declaration[];
	body: Unit[];
	name: string;
	storage?: StorageClass;
	exported?: boolean;
}

export interface RecordLike {
	kind: 'struct' | 'class' | 'union' | 'enum';
	name?: string;
	complete?: boolean;
	fields: Declaration[];
	subRecords: RecordLike[];
	exported?: boolean;
}

export type Unit =
	| { kind: 'case'; matches: Expression }
	| { kind: 'default' }
	| { kind: 'comment'; text: string }
	| Declaration
	| { kind: 'enum_field'; name: string; value?: Value; type?: Type }
	| Expression
	| ({ kind: 'for'; init: Expression[]; action: Expression[] } & Conditional)
	| Function
	| ({ kind: 'if'; else?: Unit[] } & Conditional)
	| { kind: 'goto'; target: string }
	| { kind: 'label'; name: string }
	| { kind: 'break' | 'continue'; target?: string }
	| RecordLike
	| { kind: 'return'; value: Expression[] }
	| { kind: 'switch'; expression: Expression[]; body: Unit[] }
	| { kind: 'type_alias'; name: string; value: Type; exported?: boolean }
	| ({ kind: 'while'; isDo: boolean } & Conditional);

// XIR is also a target, which is very useful for debugging:

export const textFormat = 0;

function typeText(type: Type): string {
	switch (type.kind) {
		case 'plain':
			return type.text;
		case 'array':
			return `${typeText(type.element)}[${type.length}]`;
		case 'ref':
			return `ref${type.restricted ? '(restricted)' : ''}<${typeText(type.to)}>`;
		case 'function':
			return `<(${type.args.map(typeText).join(', ')}) => ${typeText(type.returns)}>`;
		case 'qual':
			return `${type.qualifier} ${typeText(type.inner)}`;
		case 'namespaced':
			return `${type.namespace}:${typeText(type.inner)}`;
	}
}

function blockText(block: Unit[], noSemi: boolean = false): string {
	return `{\n${block.map(text).join((noSemi ? '' : ';') + '\n')}\n}`;
}

function listText(expr: Unit[], noParans: boolean = false): string {
	return (noParans ? '' : '(') + expr.map(text).join(', ') + (noParans ? '' : ')');
}

export function text(u: Unit): string {
	switch (u.kind) {
		case 'function':
			return `${u.storage ?? ''} function ${u.name} ${listText(u.parameters)}: ${typeText(u.returns)} ${blockText(u.body)}`;
		case 'return':
			return 'return ' + listText(u.value);
		case 'if':
			return `if ${listText(u.condition)}\n${blockText(u.body)} ${!u.else ? '' : '\nelse ' + (u.else[0].kind == 'if' ? blockText(u.else) : blockText(u.else))}`;
		case 'while':
			return u.isDo
				? `do ${blockText(u.body)} while ${listText(u.condition)}`
				: `while ${listText(u.condition)} ${blockText(u.body)}`;
		case 'for':
			return `for (${listText(u.init, true)}; ${listText(u.condition, true)}; ${listText(u.action, true)}) ${blockText(u.body)}`;
		case 'switch':
			return `switch ${listText(u.expression)} ${blockText(u.body)}`;
		case 'default':
			return 'default:';
		case 'case':
			return `case ${text(u.matches)}:`;
		case 'break':
		case 'continue':
		case 'goto':
			return u.kind + ' ' + (u.target ?? '');
		case 'label':
			return `label ${u.name}: `;
		case 'unary':
			return `${u.operator} ${listText(u.expression)}`;
		case 'assignment':
		case 'binary':
			return `${listText(u.left)} ${u.operator} ${listText(u.right)} `;
		case 'ternary':
			return `${listText(u.condition)} ? ${listText(u.true)} : ${listText(u.false)}`;
		case 'postfixed': {
			const primary = listText(u.primary, u.primary.length <= 1);
			switch (u.post.type) {
				case 'increment':
					return primary + '++';
				case 'decrement':
					return primary + '--';
				case 'access':
					return primary + '.' + u.post.key;
				case 'access_ref':
					return primary + '->' + u.post.key;
				case 'bracket_access':
					return primary + `[${listText(u.post.key)}]`;
				case 'call':
					return primary + listText(u.post.args);
				default:
					return `${(u.post as any).type}<${primary}>`;
			}
		}
		case 'cast':
			return `(cast ${text(u.value)} to ${typeText(u.type)})`;
		case 'struct':
		case 'class':
		case 'union':
			return `\n@${u.name}\n ${u.subRecords.map(text).join('\n')} ${u.kind} ${u.name} ${blockText(u.fields)}\n`;
		case 'enum':
			return `\nenum ${u.name} ${blockText(u.fields, true)}`;
		case 'type_alias':
			return `\ntype ${u.name} := ${typeText(u.value)};`;
		case 'declaration':
			return `\n${u.storage} ${typeHasQualifier(u.type, 'const') ? 'const' : 'let'} ${u.name}${u.type ? ': ' + typeText(u.type) : ''} ${u.initializer === undefined ? '' : ' = ' + text(u.initializer)};`;
		case 'enum_field':
			return `${u.name} = ${u.value ? text(u.value) : '<undefined>'},`;
		case 'field':
		case 'parameter':
			return `${u.type ? typeText(u.type) : '<untyped>'} ${u.name ?? u.index} ${!u.initializer ? '' : ' = ' + text(u.initializer)}`;
		case 'value':
			// eslint-disable-next-line @typescript-eslint/no-base-to-string
			return `${typeof u.content == 'string' ? u.content : u.content.map ? u.content.map(({ field, value }) => field + ': ' + text(value)).join(';\n') : u.content.toString()}`;
		case 'comment':
			return `/* ${u.text} */`;
	}
}
