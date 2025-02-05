/** A high-level intermediate representation */

const _numerics = [
	'int8',
	'uint8',
	'int16',
	'uint16',
	'int32',
	'uint32',
	'int64',
	'uint64',
	'float32',
	'float64',
] as const;

export type BuiltinNumeric = (typeof _numerics)[number];

export type BuiltinType = BuiltinNumeric | 'void' | 'bool';

export function isNumeric(builtin: string): builtin is BuiltinNumeric {
	return _numerics.includes(builtin as any);
}

export function isBuiltin(type: string): type is BuiltinType {
	return isNumeric(type) || type == 'void' || type == 'bool';
}

export function baseType(type: Type): string {
	switch (type.kind) {
		case 'plain':
			return type.text;
		case 'const_array':
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
	| { kind: 'const_array'; length: number; element: Type }
	| { kind: 'ref'; to: Type; restricted?: boolean }
	| { kind: 'function'; returns: Type; args: Type[] }
	| { kind: 'qual'; qualifiers: TypeQualifier; inner: Type }
	| { kind: 'namespaced'; namespace: string; inner: Type };

export function typeHasQualifier(type: Type | null, qual: TypeQualifier): boolean {
	if (!type) return false;
	switch (type.kind) {
		case 'function':
			return typeHasQualifier(type.returns, qual);
		case 'plain':
			return false;
		case 'const_array':
			return typeHasQualifier(type.element, qual);
		case 'ref':
			return typeHasQualifier(type.to, qual);
		case 'namespaced':
			return typeHasQualifier(type.inner, qual);
		case 'qual':
			return type.qualifiers == qual;
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
}

export interface Function {
	kind: 'function';
	returns: Type;
	parameters: Declaration[];
	body: Unit[];
	name: string;
	storage?: StorageClass;
}

export interface RecordLike {
	kind: 'struct' | 'class' | 'union' | 'enum';
	name?: string;
	fields: Declaration[];
	subRecords: RecordLike[];
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
	| { kind: 'type_alias'; name: string; value: Type }
	| ({ kind: 'while'; isDo: boolean } & Conditional);
