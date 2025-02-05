/** A high-level intermediate representation */

/**
 * @todo Track more information
 */
export type Type = string;

export interface Value {
	kind: 'value';
	type: Type;
	content: string;
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
	left: Unary;
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
	kind: 'declaration';
	name: string;
	type: Type;
	/** Default value */
	value?: Value;
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

export interface FlowControl {
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
	| FlowControl
	| Return
	| TypeAlias
	| Declaration;
