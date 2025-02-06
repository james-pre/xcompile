/* eslint-disable @typescript-eslint/no-empty-object-type */

import * as xir from './xir.js';

interface _Location {
	offset: number;
	line: number;
	col: number;
	tokLen: number;
	file?: string;
	includedFrom?: {
		file: string;
	};
	isMacroArgExpansion?: boolean;
}

export type Location = {} | _Location | { spellingLoc: _Location; expansionLoc: _Location };

export type ValueCategory = 'prvalue' | 'lvalue' | 'rvalue';

export interface GenericNode {
	/** Hexadecimal ID for the node,	e.g. "0x..." */
	id: string;
	/** The kind of the node */
	kind: string;

	range?: {
		begin: Location;
		end: Location;
	};
	type: {
		desugaredQualType?: string;
		qualType: string;
		typeAliasDeclId?: string;
	};
	inner?: Node[];
	name?: string;
}

export interface Statement extends GenericNode {
	kind:
		| 'AttributedStmt'
		| 'BreakStmt'
		| 'CaseStmt'
		| 'CompoundStmt'
		| 'DeclStmt'
		| 'DefaultStmt'
		| 'DoStmt'
		| 'ForStmt'
		| 'NullStmt'
		| 'ReturnStmt'
		| 'SwitchStmt'
		| 'WhileStmt';
	inner: Node[];
}

export interface IfStmt extends GenericNode {
	kind: 'IfStmt';
	hasElse?: boolean;
}

export interface Label extends GenericNode {
	kind: 'LabelStmt';
	declId: string;
	name: string;
}

export interface Goto extends GenericNode {
	kind: 'GotoStmt';
	targetLabelDeclId: string;
	inner: never;
}

export interface MiscType extends GenericNode {
	kind: 'BuiltinType' | 'ParenType' | 'PointerType';
}

export interface QualType extends GenericNode {
	kind: 'QualType';
	qualifiers: 'const' | 'volatile';
}

interface SubDecl {
	id: string;
	kind: string;
	name: string;
}

export interface DeclType<T extends 'Enum' | 'Record' | 'Typedef' = 'Enum' | 'Record' | 'Typedef'> extends GenericNode {
	kind: `${T}Type`;
	decl: SubDecl & { kind: `${T}Decl` };
}

export interface ElaboratedType extends GenericNode {
	kind: 'ElaboratedType';
	ownedTagDecl?: SubDecl;
}

export interface ConstantArrayType extends GenericNode {
	kind: 'ConstantArrayType';
	size: number;
}

export interface FunctionProtoType extends GenericNode {
	kind: 'FunctionProtoType';
	cc?: 'cdecl';
	loc: never;
}

export type Type = MiscType | QualType | DeclType | ElaboratedType | ConstantArrayType | FunctionProtoType;

function parseType(node: Node): xir.Type {
	switch (node.kind) {
		case 'BuiltinType':
		case 'EnumType':
		case 'RecordType':
		case 'TypedefType':
			return { kind: 'plain', text: node.type.qualType };
		case 'ParenType':
			return parseType(node.inner![0]);
		case 'QualType':
			return { kind: 'qual', qualifiers: node.qualifiers, inner: parseType(node.inner![0]) };
		case 'ElaboratedType':
			return parseType(node.inner![0]);
		case 'PointerType':
			return { kind: 'ref', to: parseType(node.inner![0]) };
		case 'ConstantArrayType':
			return { kind: 'const_array', length: node.size, element: parseType(node.inner![0]) };
		case 'FunctionProtoType':
			return { kind: 'function', returns: parseType(node.inner![0]), args: node.inner!.slice(1).map(parseType) };
		default:
			throw 'Unsupported node kind: ' + node.kind;
	}
}

const _typeMappings = {
	char: 'int8',
	'unsigned char': 'uint8',
	short: 'int16',
	'unsigned short': 'uint16',
	int: 'int32',
	unsigned: 'uint32',
	'unsigned int': 'uint32',
	long: 'int64',
	'unsigned long': 'uint64',
	'long int': 'int64',
	'unsigned long int': 'uint64',
	'long long': 'int64',
	'unsigned long long': 'uint64',
	'long long int': 'int64',
	'unsigned long long int': 'uint64',
	float: 'float32',
	double: 'float64',
};

// Convert strings into XIR types
function parseXIRBaseType(type: string): string {
	if (xir.isBuiltin(type)) return type;
	if (type in _typeMappings) return _typeMappings[type as keyof typeof _typeMappings];
	return type;
}

function parseXIRType(type: string): xir.Type {
	if (type.at(-1) != ']') return { kind: 'plain', text: parseXIRBaseType(type) };

	const [base, ...lengths] = type.replaceAll(']', '').split('[');

	let current: xir.Type = { kind: 'plain', text: parseXIRBaseType(base) };

	for (const length of lengths.map(Number)) {
		current = { kind: 'const_array', length, element: current };
	}

	return current;
}

function parseTypedef(node: Declaration): xir.Type {
	if (!node.inner) return { kind: 'plain', text: node.type.qualType };
	return parseType(node.inner[0]);
}

export type StorageClass = 'extern' | 'static';

export interface Declaration extends GenericNode {
	kind:
		| 'EnumConstantDecl'
		| 'EnumDecl'
		| 'FieldDecl'
		| 'FunctionDecl'
		| 'IndirectFieldDecl'
		| 'ParmVarDecl'
		| 'StaticAssertDecl'
		| 'RecordDecl'
		| 'TranslationUnitDecl'
		| 'TypedefDecl'
		| 'VarDecl';
	isImplicit?: boolean;
	init?: 'c';
	/** Only on fields */
	isBitfield?: boolean;
	storageClass?: StorageClass;
	isUsed?: boolean;
	isReferenced?: boolean;
	/** Only on functions */
	variadic?: boolean;
	loc: Location;
	name: string;
	mangledName?: string;

	// Only on records
	tagUsed?: 'struct' | 'union';
	parentDeclContextId?: string;
	completeDefinition?: boolean;
}

export interface BinaryOperator extends GenericNode {
	kind: 'BinaryOperator';
	opcode:
		| '!='
		| '%'
		| '&'
		| '&&'
		| '*'
		| '+'
		| ','
		| '-'
		| '/'
		| '<'
		| '<<'
		| '<='
		| '=='
		| '>'
		| '>>'
		| '^'
		| '__extension__'
		| '|'
		| '||';
	isPostfix?: boolean;
	canOverflow?: boolean;
	inner: Node[];
}

export interface CompoundAssignOperator extends GenericNode {
	kind: 'CompoundAssignOperator';
	opcode: '=' | '*=' | '/=' | '%=' | '+=' | '-=' | '&=' | '^=' | '|=' | '>>=' | '<<=';
	inner: Node[];
}

export interface UnaryOperator extends GenericNode {
	kind: 'UnaryOperator';
	opcode: '!' | '&' | '*' | '+' | '++' | '-' | '--';
	isPostfix?: boolean;
	inner: Node[];
}

export interface Value extends GenericNode {
	kind:
		| 'ArraySubscriptExpr'
		| 'CStyleCastExpr'
		| 'CallExpr'
		| 'CharacterLiteral'
		| 'CompoundLiteralExpr'
		| 'ConditionalOperator'
		| 'ConstantExpr'
		| 'FloatingLiteral'
		| 'ImplicitCastExpr'
		| 'ImplicitValueInitExpr'
		| 'InitListExpr'
		| 'IntegerLiteral'
		| 'ParenExpr'
		| 'PredefinedExpr'
		| 'StmtExpr'
		| 'StringLiteral'
		| 'UnaryExprOrTypeTraitExpr';
	valueCategory: ValueCategory;
	value?: string;
}

export interface Member extends GenericNode {
	kind: 'MemberExpr';
	valueCategory: ValueCategory;
	name: string;
	isArrow: boolean;
	referencedMemberDecl: string;
	inner: Node[];
}

export interface DeclRefExpr extends GenericNode {
	kind: 'DeclRefExpr';
	valueCategory: ValueCategory;
	referencedDecl: Declaration;
	inner: Node[];
}

export interface Cast extends GenericNode {
	kind: 'CStyleCastExpr' | 'ImplicitCastExpr';
	castKind:
		| 'IntegralCast'
		| 'LValueToRValue'
		| 'FunctionToPointerDecay'
		| 'IntegralToBoolean'
		| 'IntegralToFloating'
		| 'NoOp'
		| 'ArrayToPointerDecay'
		| 'BitCast'
		| 'NullToPointer'
		| 'PointerToIntegral'
		| 'BuiltinFnToFnPtr'
		| 'ToVoid';
	inner: Node[];
}

export interface Attribute extends GenericNode {
	kind:
		| 'AlignedAttr'
		| 'AllocAlignAttr'
		| 'AllocSizeAttr'
		| 'AsmLabelAttr'
		| 'BuiltinAttr'
		| 'C11NoReturnAttr'
		| 'ColdAttr'
		| 'ConstAttr'
		| 'FallThroughAttr'
		| 'FormatArgAttr'
		| 'FormatAttr'
		| 'NoThrowAttr'
		| 'NonNullAttr'
		| 'PureAttr'
		| 'RestrictAttr'
		| 'ReturnsNonNullAttr'
		| 'ReturnsTwiceAttr'
		| 'SentinelAttr'
		| 'WarnUnusedResultAttr';
	implicit?: boolean;
	inherited?: boolean;
}

export interface DeprecatedAttr extends GenericNode {
	kind: 'DeprecatedAttr';
	message: string;
}

export type Node =
	| Attribute
	| BinaryOperator
	| Cast
	| CompoundAssignOperator
	| Declaration
	| DeclRefExpr
	| DeprecatedAttr
	| Goto
	| IfStmt
	| Label
	| Member
	| Statement
	| Type
	| UnaryOperator
	| Value;

export function* parse(node: Node): IterableIterator<xir.Unit> {
	switch (node.kind) {
		case 'BuiltinType':
		case 'ConstantArrayType':
		case 'ElaboratedType':
		case 'EnumType':
		case 'FunctionProtoType':
		case 'ParenType':
		case 'PointerType':
		case 'QualType':
		case 'RecordType':
		case 'TypedefType':
			// _warn('Encountered misplaced Type node');
			return;
		case 'AlignedAttr':
		case 'AllocAlignAttr':
		case 'AllocSizeAttr':
		case 'AsmLabelAttr':
		case 'C11NoReturnAttr':
		case 'ColdAttr':
		case 'ConstAttr':
		case 'FallThroughAttr':
		case 'FormatArgAttr':
		case 'FormatAttr':
		case 'RestrictAttr':
		case 'ReturnsNonNullAttr':
		case 'ReturnsTwiceAttr':
		case 'SentinelAttr':
		case 'NonNullAttr':
		case 'NoThrowAttr':
			yield { kind: 'comment', text: 'attr:' + node.kind.slice(0, -4) };
			// _warn('Unsupported attribute');
			return;
		case 'ArraySubscriptExpr': {
			const [name, index] = node.inner!;
			yield {
				kind: 'postfixed',
				primary: [...parse(name)] as xir.Expression[],
				post: { type: 'bracket_access', key: [...parse(index)] as xir.Expression[] },
			};
			return;
		}
		case 'AttributedStmt': {
			const [, stmt] = node.inner;
			yield* parse(stmt);
			return;
		}
		case 'BinaryOperator':
		case 'CompoundAssignOperator': {
			const [left, right] = node.inner;
			if (node.opcode == ',') {
				yield* parse(left);
				yield* parse(right);
				return;
			}
			if (node.opcode == '__extension__') {
				// _warn('__extension__ is not supported');
				return;
			}
			yield {
				kind: node.kind == 'BinaryOperator' ? 'binary' : 'assignment',
				operator: node.opcode,
				left: [...parse(left)] as xir.Expression[],
				right: [...parse(right)] as xir.Expression[],
			} as xir.Assignment | xir.Binary;
			return;
		}
		case 'BreakStmt':
			yield { kind: 'break' };
			return;
		case 'BuiltinAttr':
			// _note('Needs builtin');
			return;
		case 'CallExpr': {
			const [ident, ...args] = node.inner!;
			yield {
				kind: 'postfixed',
				primary: [...parse(ident)] as xir.Expression[],
				post: { type: 'call', args: args.flatMap(node => [...parse(node)]) as xir.Expression[] },
			};
			return;
		}
		case 'CaseStmt': {
			yield { kind: 'case', matches: [...parse(node.inner[0])][0] as xir.Expression };
			for (const child of node.inner.slice(1)) {
				yield* parse(child);
			}
			return;
		}
		case 'ConstantExpr':
			if (node.value) {
				yield { kind: 'value', type: parseXIRType(node.type.qualType), content: node.value };
				return;
			}
		// fallthrough
		case 'CompoundStmt':
		case 'CompoundLiteralExpr':
		case 'ImplicitCastExpr':
		case 'InitListExpr':
		case 'TranslationUnitDecl':
		case 'StmtExpr':
			for (const inner of node.inner ?? []) {
				yield* parse(inner);
			}
			return;
		case 'ConditionalOperator': {
			const [condition, _true, _false] = node.inner!;
			yield {
				kind: 'ternary',
				condition: [...parse(condition)] as xir.Expression[],
				true: [...parse(_true)] as xir.Expression[],
				false: [...parse(_false)] as xir.Expression[],
			};
			return;
		}
		case 'CStyleCastExpr':
			yield {
				kind: 'cast',
				type: { kind: 'plain', text: node.type.qualType },
				value: [...parse(node.inner![0])][0] as xir.Expression,
			};
			return;
		case 'DeclStmt':
			/**
			 * @todo Implement
			 */
			return;
		case 'DefaultStmt':
			yield { kind: 'default' };
			return;
		case 'DeprecatedAttr':
			// _warn('Deprecated')
			return;
		case 'DoStmt': {
			const [_body, _cond] = node.inner;
			yield {
				kind: 'while',
				isDo: true,
				condition: [...parse(_cond)] as xir.Expression[],
				body: [...parse(_body)],
			};
			return;
		}
		case 'EnumConstantDecl':
		case 'EnumDecl':
		case 'FieldDecl':
			/**
			 * @todo Implement
			 */
			return;
		case 'CharacterLiteral':
		case 'FloatingLiteral':
		case 'IntegerLiteral':
		case 'StringLiteral':
			yield { kind: 'value', type: parseXIRType(node.type.qualType), content: node.value! };
			return;
		case 'ForStmt': {
			const [_init, , _cond, _action, ..._body] = node.inner;
			yield {
				kind: 'for',
				init: [...parse(_init)] as xir.Expression[],
				condition: [...parse(_cond)] as xir.Expression[],
				action: [...parse(_action)] as xir.Expression[],
				body: _body.flatMap(node => [...parse(node)]),
			};
			return;
		}
		case 'FunctionDecl':
			/**
			 * @todo Implement
			 */
			return;
		case 'GotoStmt':
			yield { kind: 'goto', target: '_' + node.targetLabelDeclId };
			return;
		case 'IfStmt': {
			const [condition, body, _else] = node.inner!;
			yield {
				kind: 'if',
				condition: [...parse(condition)] as xir.Expression[],
				body: [...parse(body)],
				else: node.hasElse ? [...parse(_else)] : undefined,
			};
			return;
		}
		case 'ImplicitValueInitExpr':
		case 'IndirectFieldDecl':
			/**
			 * @todo Implement
			 */
			return;
		case 'LabelStmt':
			yield { kind: 'comment', text: 'label: ' + node.name };
			yield { kind: 'label', name: '_' + node.declId };
			return;
		case 'DeclRefExpr':
			yield* parse(node.referencedDecl);
			return;
		case 'MemberExpr':
			yield {
				kind: 'postfixed',
				primary: [...parse(node.inner[0])] as xir.Expression[],
				post: { type: 'access', key: node.name },
			};
			return;
		case 'NullStmt':
			// WTF is a null statement?
			return;
		case 'ParenExpr':
		case 'ParmVarDecl':
		case 'PredefinedExpr':
			/**
			 * @todo Implement
			 */
			return;
		case 'PureAttr':
			yield { kind: 'comment', text: node.kind.slice(0, -4) };
			return;
		case 'RecordDecl':
			/**
			 * @todo Implement
			 */
			return;
		case 'ReturnStmt':
			yield { kind: 'return', value: [...parse(node.inner[0])] as xir.Expression[] };
			return;
		case 'StaticAssertDecl':
			/**
			 * @todo Implement
			 */
			return;
		case 'SwitchStmt': {
			const [_expr, _body] = node.inner;
			yield {
				kind: 'switch',
				expression: [...parse(_expr)] as xir.Expression[],
				body: [...parse(_body)],
			};
			return;
		}
		case 'TypedefDecl':
			yield { kind: 'type_alias', name: node.name, value: parseTypedef(node) };
			return;
		case 'UnaryExprOrTypeTraitExpr':
			/**
			 * @todo Implement
			 */
			return;
		case 'UnaryOperator':
			/**
			 * @todo Implement
			 */
			return;
		case 'VarDecl':
			yield { kind: 'value', content: node.name, type: { kind: 'plain', text: node.type.qualType } };
			return;
		case 'WarnUnusedResultAttr':
			// _warn('Unused result');
			return;
		case 'WhileStmt': {
			const [_cond, _body] = node.inner;
			yield {
				kind: 'while',
				isDo: true,
				condition: [...parse(_cond)] as xir.Expression[],
				body: [...parse(_body)],
			};
			return;
		}
	}
}
