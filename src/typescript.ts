import * as xir from './xir.js';

function _baseType(typename: string): string {
	return typename.replaceAll(' ', '_');
}

function emitType(type: xir.Type): string {
	switch (type.kind) {
		case 'plain':
			return _baseType(type.text);
		case 'const_array':
			return `Tuple<${emitType(type.element)}, ${type.length}>`;
		case 'ref':
			return `${type.restricted ? '/* restricted */' : ''} Ref<${emitType(type.to)}>`;
		case 'function':
			return `((${type.args.map((param, i) => `_${i}: ${emitType(param)}`).join(', ')}) => ${emitType(type.returns)})`;
		case 'qual':
			return type.qualifiers == 'const'
				? `Readonly<${emitType(type.inner)}>`
				: `__Qual<${emitType(type.inner)}, '${type.qualifiers}'>`;
		case 'namespaced':
			return emitType(type.inner);
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
		if (param.type && xir.baseType(param.type) != 'struct __va_list_tag') emitted.push(emit(param));
		else emitted[emitted.length - 1] = '...' + emitted.at(-1) + '[]';
	}
	return emitted.join(', ');
}

/** Utilium type decorator for class member */
function emitDecorator(type: xir.Type | null, length?: number): string {
	if (!type) return '';
	if (type.kind == 'plain' && type.raw) type = type.raw;
	switch (type.kind) {
		case 'plain':
			return xir.isBuiltin(type.text)
				? (xir.isNumeric(type.text) ? '@t.' + type.text : '@t.uint8') +
						(length !== undefined ? `(${length})` : '')
				: `@member(${type.text}${length !== undefined ? ', ' + length : ''})`;
		case 'const_array':
			if (type.element.kind == 'const_array') return '/* nested array */';
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

export const header = `
import { Tuple, types as t, struct, member } from 'utilium';

type int8 = number;
type uint8 = number;
type int16 = number;
type uint16 = number;
type int32 = number;
type uint32 = number;
type int64 = bigint;
type uint64 = bigint;
type float32 = number;
type float64 = number;
type float128 = number;

type Ref<T> = T;
`;

export function emit(u: xir.Unit): string {
	switch (u.kind) {
		case 'function':
			return `${u.storage == 'extern' ? 'declare' : ''} function ${u.name} (${emitParameters(u.parameters)}): ${emitType(u.returns)}\n${u.storage == 'extern' ? '' : emitBlock(u.body)}`;
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
					return primary + `${emitList(u.post.args)}`;
				default:
					throw 'Unknown postfix: ' + (u.post as any).type;
			}
		}
		case 'cast':
			return `(${emit(u.value)} as ${emitType(u.type)})`;
		case 'struct':
		case 'class':
		case 'union': {
			return `${u.subRecords.map(emit).join('\n')}@struct(${
				u.kind == 'union' ? '{ isUnion: true }' : ''
			}) \nclass ${u.name} {${u.fields
				.map(field => emitDecorator(field.type) + ' ' + emit(field))
				.join(';\n')}}\n`;
		}
		case 'enum':
			return `enum ${u.name} ${emitBlock(u.fields, true)}`;
		case 'type_alias':
			return `type ${u.name} = ${emitType(u.value)};\n`;
		case 'declaration':
			return `\n${u.storage == 'extern' ? 'declare' : ''} ${xir.typeHasQualifier(u.type, 'const') ? 'const' : 'let'} ${u.name}${u.type ? ': ' + emitType(u.type) : ''} ${u.initializer === undefined ? '' : ' = ' + emit(u.initializer)};`;
		case 'enum_field':
			return `${u.name} ${u.value === undefined ? '' : ' = ' + emit(u.value)},\n`;
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

export function emitAll(units: xir.Unit[]): string {
	let content = '';
	for (const unit of units) {
		content += emit(unit);
	}
	return content;
}
