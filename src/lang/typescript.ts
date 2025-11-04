// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2025 James Prevett
import * as xir from '../ir.js';
import { isTypeName } from 'memium/primitives';

/**
 * @todo Don't use global state
 */
let _emitCasts = true;

export function _disableCasts() {
	_emitCasts = false;
}

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
		case 'typeof':
			return `$typeof<${emitType(type.target, namespace)}>`;
	}
}

function emitBlock(block: xir.Unit[], noSemi: boolean = false): string {
	return `{\n${block.map(u => '\t' + emit(u)).join((noSemi ? '' : ';') + '\n')}\n}\n`;
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

/** Emit runtime Memium field type */
function emitFieldType(type: xir.Type | null): string {
	if (!type) return 'Void /* missing type */';
	if (type.kind == 'plain' && type.raw) type = type.raw;
	switch (type.kind) {
		case 'plain':
			if (isTypeName(type.text)) return 't.' + type.text;
			if (type.text == 'void') return 'Void';
			if (type.text == 'bool') return 't.uint8';
			return type.text;
		case 'array':
			return `array(${emitFieldType(type.element)}, ${type.length})`;
		case 'ref':
			return `$ref_t(${emitFieldType(type.to)})`;
		case 'namespaced':
		case 'qual':
			return emitFieldType(type.inner);
		case 'function':
			return 'Void /* function */';
		case 'typeof':
			return `$__typeof(${emitFieldType(type.target)})`;
	}
}

const reserved = ['class', 'new'];

function emitValue(value: xir.Value): string {
	if (typeof value.content == 'object' && 'map' in value.content)
		return value.content.map(({ field, value }) => field + ': ' + emit(value)).join(';\n');

	if (typeof value.content != 'string') return (value.content as any).toString();

	// if (value.content.startsWith('"') && value.content.endsWith('"')) return `$__str(${value.content})`;

	return reserved.includes(value.content) ? '_' + value.content : value.content;
}

function emitName(node: { name: string }): string {
	if (reserved.includes(node.name)) return '_' + node.name;
	return node.name;
}

export function emit(u: xir.Unit): string {
	switch (u.kind) {
		case 'function': {
			const signature = `function ${emitName(u)} (${emitParameters(u.parameters)}): ${emitType(u.returns)}`;
			return (
				(u.exported ? 'export ' : '') +
				(u.storage == 'extern' || !u.body.length
					? `declare ${signature};\n`
					: signature + '\n' + emitBlock(u.body))
			);
		}
		case 'return':
			return 'return ' + emitList(u.value, u.value.length <= 1);
		case 'if':
			return `if ${emitList(u.condition)}\n${emitBlock(u.body)} ${!u.else ? '' : '\nelse ' + (!u.else[0] ? '{\n\t// !!! Missing\n}' : u.else[0].kind == 'if' ? emitBlock(u.else) : emitBlock(u.else))}`;
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
			return `${emitList(u.left, u.left.length == 1)} ${u.operator} ${emitList(u.right, u.right.length == 1)} `;
		case 'ternary':
			return `${emitList(u.condition)} ? ${emitList(u.true, u.true.length <= 1)} : ${emitList(u.false, u.false.length <= 1)}`;
		case 'postfixed': {
			const primary = emitList(u.primary, u.primary.length <= 1);
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
					return primary + `[${emitList(u.post.key, true)}]`;
				case 'call':
					return primary + emitList(u.post.args);
				default:
					throw 'Unknown postfix: ' + (u.post as any).type;
			}
		}
		case 'cast':
			return !_emitCasts
				? ''
				: u.value
					? `(${emit(u.value)} as ${emitType(u.type)})`
					: `/* <missing value> as ${emitType(u.type)} */`;
		case 'struct':
		case 'class':
		case 'union': {
			// If name conflicts, add this: ${u.kind == 'struct' || u.kind == 'union' ? '$' + u.kind : ''}

			const _export = u.exported ? 'export ' : '';

			if (!u.complete) return _export + `declare const ${emitName(u)}: StructConstructor<unknown>;`;

			return `${_export} const ${emitName(u)} = ${u.kind == 'struct' ? 'struct' : 'union'}("${u.name}", {\n${u.fields.map(f => `\t${f.name}: ${emitFieldType(f.type)}`).join(',\n')}\n});\n${_export}interface ${emitName(u)} extends InstanceType<typeof ${emitName(u)}> {};\n`;
		}
		case 'enum':
			return `\n${u.exported ? 'export ' : ''}enum ${emitName(u)} ${emitBlock(u.fields, true)}`;
		case 'type_alias':
			if (emitName(u) == emitType(u.value)) return '';
			return `type ${emitName(u)} = ${emitType(u.value)};\n`;
		case 'declaration':
			return `\n${u.exported ? 'export ' : ''}${u.storage == 'extern' ? 'declare ' : ''}let ${emitName(u)}${u.type ? ': ' + emitType(u.type) : ''} ${u.initializer === undefined ? '' : ' = ' + emit(u.initializer)};`;
		case 'enum_field':
			return `${emitName(u)} ${u.value === undefined ? '' : ' = ' + emit(u.value)},`;
		case 'field':
		case 'parameter':
			return `${u.name ? emitName(u) : 'undefined_' + u.index}${u.type ? ': ' + emitType(u.type) : ''} ${!u.initializer ? '' : ' = ' + emit(u.initializer)}`;
		case 'value':
			return emitValue(u);
		case 'comment':
			return `/* ${u.text} */`;
	}
}
