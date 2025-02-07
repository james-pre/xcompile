import { isType as isPrimitive } from 'utilium/internal/primitives.js';
import * as xir from './xir.js';

function _baseType(typename: string): string {
	return typename.replaceAll(' ', '_');
}

function emitType(type: xir.Type, namespace?: string): string {
	switch (type.kind) {
		case 'plain':
			return _baseType(type.text);
		case 'array':
			return type.length === null
				? emitType(type.element, namespace) + '[]'
				: `ConstArray<${emitType(type.element, namespace)}, ${type.length}>`;
		case 'ref':
			return `${type.restricted ? '/* restricted */' : ''} Ref<${emitType(type.to, namespace)}>`;
		case 'function':
			return `((${type.args.map((param, i) => `_${i}: ${emitType(param)}`).join(', ')}) => ${emitType(type.returns)})`;
		case 'qual':
			return type.qualifier == 'const'
				? `Readonly<${emitType(type.inner, namespace)}>`
				: `/* ${type.qualifier} */ ${emitType(type.inner, namespace)}`;
		case 'namespaced':
			return emitType(type.inner, namespace);
	}
}

function emitBlock(block: xir.Unit[], noSemi: boolean = false): string {
	return `{\n${block.map(emit).join((noSemi ? '' : ';') + '\n')}\n}`;
}

function emitList(expr: xir.Unit[], noParans: boolean = false): string {
	return (noParans ? '' : '(') + expr.map(emit).join(', ') + (noParans ? '' : ')');
}

function emitParameters(params: xir.Declaration[]): string {
	const emitted: string[] = [];
	for (let i = 0; i < params.length; i++) {
		const param = params[i];
		if (param.type && xir.baseType(param.type) != '__va_list_tag') emitted.push(emit(param));
		else emitted[emitted.length - 1] = '...' + emitted.at(-1) + '[]';
	}
	return emitted.join(', ');
}

/** Utilium type decorator for class member */
function emitDecorator(type: xir.Type | null, lenOrNs?: number | null): string {
	if (!type) return '';
	if (type.kind == 'plain' && type.raw) type = type.raw;
	switch (type.kind) {
		case 'plain':
			return xir.isBuiltin(type.text)
				? (isPrimitive(type.text) ? '@t.' + type.text : '@t.uint8') +
						(lenOrNs !== undefined ? `(${lenOrNs ?? ''})` : '')
				: `@member(${type.text}${lenOrNs !== undefined ? ', ' + (lenOrNs ?? '') : ''})`;
		case 'array':
			if (type.element.kind == 'array') return '/* nested array */';
			return emitDecorator(type.element, type.length);
		case 'ref':
			return emitDecorator(type.to);
		case 'namespaced':
		case 'qual':
			return emitDecorator(type.inner);
		case 'function':
			return '';
	}
}

/**
 * Boilerplate to make stuff with C work
 *
 * `Ref<T>`
 *
 * Pointer to `T`. Note `__ref__` doesn't actually exist and is only here to keep TS types when passing it around
 *
 *
 * `ConstArray<T, L>`
 *
 * Constant array `T[L]`.
 *
 * `$__ref<T>(value: T): Ref<T>;`
 *
 * Equivalent to C `&value`
 *
 * `$__deref<T>(value: Ref<T>): T;`
 *
 * Equivalent to C `(*value)`
 *
 * `$__deref_set<T>(left: Ref<T>, right: Ref<T> | T): void;`
 *
 * Equivalent to C `(*value) = ...`
 *
 * `$__array<T>(start: Ref<T>, i: bigint): T;`
 *
 * Access an element of an array, but using the pointer type (e.g. accessing `x[0]` where `x` is `char*`)
 *
 * `$__array<T>(start: Ref<T>, i: bigint, value?: T): void;`
 *
 * Set an element of an array, but using the pointer type (e.g. `x[0] = ...` where `x` is `char*`)
 *
 * `$__str(value: string): Ref<int8>;`
 *
 * Converts a JS string literal into a `char*`/`Ref<int8>`
 *
 * `$__allocConstArray<T, L extends number>(length: L, ...init: T[]): ConstArray<T, L>;`
 *
 * Allocates an array of length `L` with elements of type `T`. Takes in optional initializers
 *
 */
export const cHeader = `
import { types as t, struct, member, sizeof } from 'utilium';

type int8 = number;
type uint8 = number;
type int16 = number;
type uint16 = number;
type int32 = number;
type uint32 = number;
type int64 = bigint;
type uint64 = bigint;
type int128 = bigint;
type uint128 = bigint;
type float32 = number;
type float64 = number;
type float128 = number;

type bool = boolean | number;
type Ref<T> = bigint & { __ref__?: T };
type ConstArray<T, L extends number> = Array<T> & { length: L } & Ref<T>;

declare function $__assert(condition: boolean, message?: Ref<int8>): void;
declare function $__ref<T>(value: T): Ref<T>;
declare function $__deref<T>(value: Ref<T>): T;
declare function $__array<T>(start: Ref<T>, i: bigint): T | undefined;
declare function $__array<T>(start: Ref<T>, i: bigint, value?: T): void;
declare function $__str(value: string): Ref<int8>;
declare function $__allocConstArray<T, L extends number>(length: L, ...init: T[]): ConstArray<T, L>;

declare let __func__: string | undefined;
`;

export function emit(u: xir.Unit): string {
	switch (u.kind) {
		case 'function': {
			const signature = `function ${u.name} (${emitParameters(u.parameters)}): ${emitType(u.returns)}`;
			return u.storage == 'extern' || !u.body.length
				? `declare ${signature};`
				: signature + '\n' + emitBlock(u.body);
		}
		case 'return':
			return 'return ' + emitList(u.value);
		case 'if':
			return `if ${emitList(u.condition)}\n${emitBlock(u.body)} ${!u.else ? '' : '\nelse ' + (u.else[0].kind == 'if' ? emitBlock(u.else) : emitBlock(u.else))}`;
		case 'while':
			return u.isDo
				? `do ${emitBlock(u.body)} while ${emitList(u.condition)}`
				: `while ${emitList(u.condition)} ${emitBlock(u.body)}`;
		case 'for':
			return `for (${emitList(u.init, true)}; ${emitList(u.condition, true)}; ${emitList(u.action, true)}) ${emitBlock(u.body)}`;
		case 'switch':
			return `switch ${emitList(u.expression)} ${emitBlock(u.body)}`;
		case 'default':
			return 'default:';
		case 'case':
			return `case ${emit(u.matches)}:`;
		case 'break':
		case 'continue':
			return u.kind + ' ' + (u.target ?? '');
		case 'goto':
			return `/* goto */ break ${u.target ?? ''}`;
		case 'label':
			return u.name + ':';
		case 'unary':
			if (u.operator == '*') return `$__deref${emitList(u.expression)}`;
			if (u.operator == '&') return `$__ref${emitList(u.expression)}`;
			if (u.operator == ('__extension__' as any))
				return `/* __extension__ */ (() => { ${u.expression.slice(0, -1).map(emit).join(';')}; return ${emit(u.expression.at(-1)!)} })()`;
			return `${u.operator} ${emitList(u.expression)}`;
		case 'assignment':
		case 'binary':
			return `${emitList(u.left)} ${u.operator} ${emitList(u.right)} `;
		case 'ternary':
			return `${emitList(u.condition)} ? ${emitList(u.true)} : ${emitList(u.false)}`;
		case 'postfixed': {
			const primary = emitList(u.primary);
			switch (u.post.type) {
				case 'increment':
					return primary + '++';
				case 'decrement':
					return primary + '--';
				case 'access':
					return primary + '.' + u.post.key;
				case 'access_ref':
					return primary + '._ref.' + u.post.key;
				case 'bracket_access':
					return primary + `[${emitList(u.post.key)}]`;
				case 'call':
					return primary + emitList(u.post.args);
				default:
					throw 'Unknown postfix: ' + (u.post as any).type;
			}
		}
		case 'cast':
			return `(${emit(u.value)} as ${emitType(u.type)})`;
		case 'struct':
		case 'class':
		case 'union': {
			// If name conflicts, add this: ${u.kind == 'struct' || u.kind == 'union' ? '$' + u.kind : ''}

			if (!u.complete) return `declare class ${u.name} {}`;

			return `${u.subRecords.map(emit).join('\n')}@struct(${
				u.kind == 'union' ? '{ isUnion: true }' : ''
			}) \nclass ${u.name} {${u.fields
				.map(field => emitDecorator(field.type) + ' ' + emit(field))
				.join(';\n')}}\n`;
		}
		case 'enum':
			return `enum ${u.name} ${emitBlock(u.fields, true)}`;
		case 'type_alias':
			if (u.name == emitType(u.value)) return '';
			return `type ${u.name} = ${emitType(u.value)};\n`;
		case 'declaration':
			return `\n${u.storage == 'extern' ? 'declare' : ''} ${xir.typeHasQualifier(u.type, 'const') ? 'const' : 'let'} ${u.name}${u.type ? ': ' + emitType(u.type) : ''} ${u.initializer === undefined ? '' : ' = ' + emit(u.initializer)};`;
		case 'enum_field':
			return `${u.name} ${u.value === undefined ? '' : ' = ' + emit(u.value)},`;
		case 'field':
		case 'parameter':
			return `${u.name ?? 'undefined_' + u.index}${u.type ? ': ' + emitType(u.type) : ''} ${!u.initializer ? '' : ' = ' + emit(u.initializer)}`;
		case 'value':
			// eslint-disable-next-line @typescript-eslint/no-base-to-string
			return `${typeof u.content == 'string' ? u.content : u.content.map ? u.content.map(({ field, value }) => field + ': ' + emit(value)).join(';\n') : u.content.toString()}`;
		case 'comment':
			return `/* ${u.text} */`;
	}
}
