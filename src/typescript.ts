import type { Unit, Type } from './ir.js';

function emitType(t: Type): string {
	return t.replaceAll(' ', '_');
}

function emitBlock(block: Unit[]): string {
	return `{${block.map(emit).join(';')}}`;
}

function emitList(expr: Unit[]): string {
	return `(${expr.map(emit).join(', ')})`;
}

export function emit(u: Unit): string {
	switch (u.kind) {
		case 'function':
			return `function ${u.name} ${emitList(u.parameters)}: ${emitType(u.returns)} ${emitBlock(u.body)}`;
		case 'if':
			return `if ${emitList(u.condition)}
				${emitBlock(u.body)} ${u.elseif.map(elseif => `else if ${emitList(u.condition)} ${emitBlock(elseif.body)}`).join('\n')}
				${!u.else ? '' : 'else ' + emitBlock(u.else)}`;
		case 'while':
			return u.isDo
				? `do ${emitBlock(u.body)} while ${emitList(u.condition)}`
				: `while ${emitList(u.condition)} ${emitBlock(u.body)}`;
		case 'for':
			return `for (${emitList(u.init)}; ${emitList(u.condition)}; ${emitList(u.action)}) ${emitBlock(u.body)}`;
		case 'switch':
			return `switch ${emitList(u.expression)} ${emitBlock(u.body)}`;
		case 'unary':
			return `${u.operator} ${emit(u.expression)}`;
		case 'binary':
			return `${emit(u.left)} ${u.operator} ${emit(u.right)}`;
		case 'ternary':
			return `${emitList(u.condition)} ? ${emitList(u.true)} : ${emitList(u.false)}`;
		case 'postfixed': {
			const primary = emit(u.primary) + ' ';
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
		case 'assignment':
		case 'declaration':
		case 'cast':
		case 'case':
		case 'value':
		case 'struct':
		case 'class':
		case 'union':
		case 'break':
		case 'continue':
		case 'label':
		case 'goto':
		case 'return':
		case 'type_alias':
			return '';
	}
}
