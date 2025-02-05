/* eslint-disable @typescript-eslint/no-empty-object-type */

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
	inner?: GenericNode[];
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
	inner: GenericNode[];
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

export type Node =
	| Value
	| ElaboratedType
	| QualType
	| Cast
	| Declaration
	| Attribute
	| DeprecatedAttr
	| FunctionProtoType
	| MiscType
	| Statement;
