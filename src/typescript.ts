import * as xir from './xir.js';

function _baseType(typename: string): string {
	if (!xir.isBuiltin(typename)) return typename.replaceAll(' ', '_');

	switch (typename) {
		case 'int8':
		case 'uint8':
		case 'int16':
		case 'uint16':
		case 'int32':
		case 'uint32':
		case 'int64':
		case 'uint64':
		case 'float32':
		case 'float64':
			return 'number';
		case 'void':
			return 'void';
		case 'bool':
			return 'boolean';
	}
}

function emitType(type: xir.Type): string {
	switch (type.kind) {
		case 'plain':
			return _baseType(type.text);
		case 'const_array':
			return `Tuple<${emitType(type.element)}, ${type.length}>`;
		case 'ref':
			return `Ref<${emitType(type.to)}>`;
		case 'function':
			return `((${type.args.map(emitType).join(', ')}) => ${emitType(type.returns)})`;
		case 'qual':
			return type.qualifiers == 'const'
				? `Readonly<${emitType(type.inner)}>`
				: `__Qual<${emitType(type.inner)}, '${type.qualifiers}'>`;
	}
}

function emitBlock(block: xir.Unit[]): string {
	return `{${block.map(emit).join(';')}}`;
}

function emitList(expr: xir.Unit[]): string {
	return `(${expr.map(emit).join(', ')})`;
}

function _baseDecorator(typename: string): string {
	return xir.isBuiltin(typename) ? (xir.isNumeric(typename) ? '@t.' + typename : '@t.uint8') : `@member(${typename})`;
}

/** Utilium type decorator for class member */
function emitDecorator(type: xir.Type): string {
	switch (type.kind) {
		case 'plain':
			return _baseDecorator(type.text);
		case 'const_array':
			if (type.element.kind != 'plain') throw 'Nested arrays in structs not supported.';
			return _baseDecorator(type.element.text);
		case 'ref':
			return '/* ref */ ' + emitDecorator(type.to);
		case 'qual':
			return emitDecorator(type.inner);
		case 'function':
			throw 'Functions can not be struct members';
	}
}

export function emit(u: xir.Unit): string {
	switch (u.kind) {
		case 'function':
			return `function ${u.name} ${emitList(u.parameters)}: ${emitType(u.returns)}\n${emitBlock(u.body)}`;
		case 'return':
			return 'return ' + emitList(u.value);
		case 'if':
			return `if ${emitList(u.condition)}\n${emitBlock(u.body)} ${!u.else ? '' : '\nelse ' + (u.else[0].kind == 'if' ? emitBlock(u.else) : emitBlock(u.else))}`;
		case 'while':
			return u.isDo
				? `do ${emitBlock(u.body)} while ${emitList(u.condition)}`
				: `while ${emitList(u.condition)} ${emitBlock(u.body)}`;
		case 'for':
			return `for (${emitList(u.init)}; ${emitList(u.condition)}; ${emitList(u.action)}) ${emitBlock(u.body)}`;
		case 'switch':
			return `switch ${emitList(u.expression)} ${emitBlock(u.body)}`;
		case 'default':
			return 'default';
		case 'case':
			return `case ${emit(u.matches)}:`;
		case 'break':
		case 'continue':
		case 'goto':
			return u.target ? u.kind + ' ' + u.target : u.kind;
		case 'label':
			return u.name + ':';
		case 'unary':
			if (u.operator == '*') return `$__deref(${emitList(u.expression)})`;
			if (u.operator == '&') return `$__ref(${emitList(u.expression)})`;
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
					return primary + `(${emitList(u.post.args)})`;
				default:
					throw 'Unknown postfix: ' + (u.post as any).type;
			}
		}
		case 'cast':
			return `(${emit(u.value)} as ${emitType(u.type)})`;
		case 'struct':
		case 'class':
			return `@struct() \n class struct_${u.name} {${u.fields.map(field => emitDecorator(field.type) + ' ' + emit(field)).join(';\n')}}`;
		case 'enum':
			return `enum ${u.name} ${emitBlock(u.fields)}`;
		case 'type_alias':
			return `type ${u.name} = ${emitType(u.value)};`;
		case 'declaration':
			return `${xir.typeHasQualifier(u.type, 'const') ? 'const' : 'let'} ${u.name}: ${emitType(u.type)} ${u.initializer === undefined ? '' : ' = ' + emit(u.initializer)};`;
		case 'field':
		case 'parameter':
			return `${u.name}: ${emitType(u.type)} ${!u.initializer ? '' : ' = ' + emit(u.initializer)}`;
		case 'value':
			return `${typeof u.content == 'string' ? u.content : u.content.map(({ field, value }) => field + ': ' + emit(value)).join(';\n')}`;
		case 'union':
			return `/* UNSUPPORTED: union ${u.name} */`;
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
