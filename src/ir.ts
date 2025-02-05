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

export interface Type {
	constant?: boolean;
	name: string;
	reference?: number;
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
	| { type: 'increment' }
	| { type: 'decrement' };

export interface Postfixed {
	kind: 'postfixed';
	primary: Expression;
	post: Postfix;
}

export interface Cast {
	kind: 'cast';
	type: Type;
	value: Expression;
}

export interface Unary {
	kind: 'unary';
	operator: '++' | '--' | '~' | '!' | '+' | '-';
	expression: Expression;
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
		| '>';
	left: Expression;
	right: Expression;
}

export interface Ternary {
	kind: 'ternary';
	condition: Expression[];
	true: Expression[];
	false: Expression[];
}

export interface Assignment {
	kind: 'assignment';
	operator: '=' | '*=' | '/=' | '%=' | '+=' | '-=' | '&=' | '^=' | '|=' | '>>=' | '<<=';
	left: Expression;
	right: Expression;
}

export type Expression = Assignment | Unary | Binary | Ternary | Cast | Postfixed | Value;

export type ConstantExpr = Exclude<Expression, Assignment>;

export interface Case {
	kind: 'case';
	matches: ConstantExpr | 'default';
	body: Unit[];
}

export interface Switch {
	kind: 'switch';
	expression: Expression[];
	body: Case[];
}

export interface For {
	kind: 'for';
	init: Expression[];
	condition: Expression[];
	action: Expression[];
	body: Unit[];
}

export interface While {
	kind: 'while';
	isDo: boolean;
	condition: Expression[];
	body: Unit[];
}

export interface If {
	kind: 'if';
	condition: Expression[];
	elseif: { condition: Expression[]; body: Unit[] }[];
	else?: Unit[];
	body: Unit[];
}

export interface Declaration {
	kind: 'declaration' | 'field' | 'parameter';
	name: string;
	type: Type;
	initializer?: Value;
}

export interface Function {
	kind: 'function';
	returns: Type;
	parameters: Declaration[];
	body: Unit[];
	name: string;
}

export interface Record {
	kind: 'struct' | 'class' | 'union';
	name?: string;
	fields: Declaration[];
}

export interface Labeled {
	kind: 'break' | 'continue' | 'label' | 'goto';
	name: string;
}

export interface Return {
	kind: 'return';
	value: Expression;
}

export interface TypeAlias {
	kind: 'type_alias';
	name: string;
	value: Type;
}

export type Unit =
	| Function
	| If
	| While
	| For
	| Case
	| Switch
	| Expression
	| Record
	| Labeled
	| Return
	| TypeAlias
	| Declaration;
