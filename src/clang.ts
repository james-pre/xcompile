/* eslint-disable @typescript-eslint/no-empty-object-type */

import type * as xir from './xir.js';

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
		| 'GotoStmt'
		| 'IfStmt'
		| 'LabelStmt'
		| 'NullStmt'
		| 'ReturnStmt'
		| 'SwitchStmt'
		| 'WhileStmt';
	inner: Node[];
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

/**
 * @todo Finish
 */
function parseType(node: Node): xir.Type {
	switch (node.kind) {
		case 'BuiltinType':
		case 'ParenType':
		case 'QualType':
		case 'EnumType':
		case 'RecordType':
		case 'TypedefType':
		case 'ElaboratedType':
			return { kind: 'plain', text: node.type.qualType };
		case 'PointerType':
			return { kind: 'ref', to: parseType(node.inner![0]) };
		case 'ConstantArrayType':
			return { kind: 'const_array', length: node.size, element: parseType(node.inner![0]) };
		case 'FunctionProtoType':
			return { kind: 'plain', text: node.type.qualType };
		default:
			throw 'Unsupported node kind: ' + node.kind;
	}
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

export interface Operator extends GenericNode {
	kind: 'BinaryOperator' | 'CompoundAssignOperator' | 'UnaryOperator';
	opcode:
		| '!'
		| '!='
		| '%'
		| '&'
		| '&&'
		| '*'
		| '+'
		| '++'
		| '+='
		| ','
		| '-'
		| '--'
		| '-='
		| '/'
		| '<'
		| '<<'
		| '<='
		| '='
		| '=='
		| '>'
		| '>>'
		| '^'
		| '__extension__'
		| '|'
		| '||';
}

export interface Value extends GenericNode {
	kind:
		| 'ArraySubscriptExpr'
		| 'BinaryOperator'
		| 'CStyleCastExpr'
		| 'CallExpr'
		| 'CharacterLiteral'
		| 'CompoundAssignOperator'
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
		| 'UnaryExprOrTypeTraitExpr'
		| 'UnaryOperator';
	valueCategory: ValueCategory;
	value?: string;
}

export interface Member extends GenericNode {
	kind: 'MemberExpr';
	valueCategory: ValueCategory;
	name: string;
	isArrow: boolean;
	referencedMemberDecl: string;
}

export interface DeclRefExpr extends GenericNode {
	kind: 'DeclRefExpr';
	valueCategory: ValueCategory;
	referencedDecl: Declaration;
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

export type Node = Value | Type | Cast | Declaration | Attribute | DeprecatedAttr | Statement;

export function* parse(node: Node): IterableIterator<xir.Unit> {
	switch (node.kind) {
		case 'AlignedAttr':
		case 'AllocAlignAttr':
		case 'AllocSizeAttr':
		case 'ArraySubscriptExpr':
		case 'AsmLabelAttr':
		case 'AttributedStmt':
		case 'BinaryOperator':
		case 'BreakStmt':
		case 'BuiltinAttr':
		case 'BuiltinType':
		case 'C11NoReturnAttr':
		case 'CallExpr':
		case 'CaseStmt':
		case 'CharacterLiteral':
		case 'ColdAttr':
		case 'CompoundAssignOperator':
		case 'CompoundLiteralExpr':
		case 'CompoundStmt':
		case 'ConditionalOperator':
		case 'ConstantExpr':
		case 'ConstAttr':
		case 'CStyleCastExpr':
		case 'DeclStmt':
		case 'DefaultStmt':
		case 'DeprecatedAttr':
		case 'DoStmt':
		case 'ElaboratedType':
		case 'EnumConstantDecl':
		case 'EnumDecl':
		case 'FallThroughAttr':
		case 'FieldDecl':
		case 'FloatingLiteral':
		case 'FormatArgAttr':
		case 'FormatAttr':
		case 'ForStmt':
		case 'FunctionDecl':
		case 'FunctionProtoType':
		case 'GotoStmt':
		case 'IfStmt':
		case 'ImplicitCastExpr':
		case 'ImplicitValueInitExpr':
		case 'IndirectFieldDecl':
		case 'InitListExpr':
		case 'IntegerLiteral':
		case 'LabelStmt':
		case 'NonNullAttr':
		case 'NoThrowAttr':
		case 'NullStmt':
		case 'ParenExpr':
		case 'ParenType':
		case 'ParmVarDecl':
		case 'PointerType':
		case 'PredefinedExpr':
		case 'PureAttr':
		case 'QualType':
		case 'RecordDecl':
		case 'RestrictAttr':
		case 'ReturnsNonNullAttr':
		case 'ReturnStmt':
		case 'ReturnsTwiceAttr':
		case 'SentinelAttr':
		case 'StaticAssertDecl':
		case 'StmtExpr':
		case 'StringLiteral':
		case 'SwitchStmt':
		case 'TranslationUnitDecl':
			for (const inner of node.inner!) {
				yield* parse(inner);
			}
			return;
		case 'TypedefDecl':
			yield { kind: 'type_alias', name: node.name, value: parseTypedef(node) };
			return;
		case 'UnaryExprOrTypeTraitExpr':
		case 'UnaryOperator':
		case 'VarDecl':
		case 'WarnUnusedResultAttr':
		case 'WhileStmt':
	}
}
