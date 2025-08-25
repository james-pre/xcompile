// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (c) 2025 James Prevett
import { omit } from 'utilium';
import * as xir from '../ir.js';
import { __entry, createIssueHelpers, getSource } from '../issue.js';

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

export type Location = _Location | { spellingLoc: _Location; expansionLoc: _Location };

function _parseLocation(loc: Location | undefined): _Location | undefined {
	if (!loc) return;
	if ('expansionLoc' in loc) {
		if (typeof loc.expansionLoc.line == 'number') loc = loc.expansionLoc;
		else loc = { ...loc.expansionLoc };
	}
	if (!('offset' in loc)) return;
	return loc;
}

const { error, warning, note, debug } = createIssueHelpers<Node>(function __nodeToIssueInit(node) {
	let rawLoc = _parseLocation('loc' in node ? node.loc : node.range?.begin);
	if (!rawLoc) return {};

	let alt = _parseLocation(node.range?.end);

	return {
		location: {
			line: rawLoc.line ?? alt?.line,
			column: rawLoc.col ?? alt?.col,
			position: rawLoc.offset,
			unit: rawLoc.file ?? rawLoc.includedFrom?.file ?? __entry ?? '<unknown>',
			length: rawLoc.tokLen,
		},
		source: getSource(rawLoc.file ?? rawLoc.includedFrom?.file ?? __entry, rawLoc.offset),
	};
});

export type ValueCategory = 'prvalue' | 'lvalue' | 'rvalue';

export interface TypeInfo {
	desugaredQualType?: string;
	qualType: string;
	typeAliasDeclId?: string;
}

export interface GenericNode {
	/** Hexadecimal ID for the node,	e.g. "0x..." */
	id: string;
	/** The kind of the node */
	kind: string;

	range?: {
		begin: Location;
		end: Location;
	};
	type: TypeInfo;
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

const _typeMappings = {
	char: 'int8',
	'signed char': 'int8',
	'unsigned char': 'uint8',
	short: 'int16',
	'signed short': 'int16',
	'unsigned short': 'uint16',
	int: 'int32',
	signed: 'int32',
	unsigned: 'uint32',
	'signed int': 'int32',
	'unsigned int': 'uint32',
	long: 'int64',
	'signed long': 'int64',
	'unsigned long': 'uint64',
	'long int': 'int64',
	'signed long int': 'int64',
	'unsigned long int': 'uint64',
	'long long': 'int64',
	'signed long long': 'int64',
	'unsigned long long': 'uint64',
	'long long int': 'int64',
	'signed long long int': 'int64',
	'unsigned long long int': 'uint64',
	float: 'float32',
	double: 'float64',
	'long double': 'float128',
	__int128: 'int128',
	'unsigned __int128': 'uint128',
};

// Convert strings into XIR string types
function parseBaseType(type: string): string {
	type = type.trim();
	if (xir.isBuiltin(type)) return type;
	if (type in _typeMappings) return _typeMappings[type as keyof typeof _typeMappings];
	return type;
}

const _type_anonymous = /(?:unnamed(?: \w+)?|anonymous) at /;
const _type_namespace = /^(struct|union|enum) (.*)/;
const _type_function = /^([^(]+)\s+\((.*)\)/;
const _type_function_pointer = /([^(]+)\s+\(\*\)\s*\((.*)\)/;
const _type_array = /(.*)\[(\d*)\]$/;
const _type_pointer = /(.*)\s*\*(?:restrict)?$/;
const _type_qualified = /^(const|volatile)(\W+.*)|(.*\W+)(const|volatile)$/;
const _type_typeof = /^typeof\s*\((.*)\)$/;

function parseType(type: string | Node, raw?: string, alt?: string, _isRaw: boolean = false): xir.Type {
	if (!type) return { kind: 'plain', text: 'unknown' };

	if (typeof type != 'string') {
		const _ = type.type ?? {};

		if (type.kind == 'ElaboratedType' && type.ownedTagDecl && !type.ownedTagDecl.name) {
			return { kind: 'plain', text: '_' + type.ownedTagDecl.id, raw: parseType(type.type.qualType) };
		}

		return parseType(_.qualType, _.desugaredQualType, _.qualType);
	}

	type = type.trim();
	raw ??= type;

	const match = type.match(_type_anonymous);
	if (match) type = alt ?? '';

	type = type.trim();

	const [isPtr, to] = type.match(_type_pointer) ?? [];
	if (isPtr) return { kind: 'ref', restricted: type.includes('*restrict'), to: parseType(to) };

	const [isFnPtr, fn_ptr_returns, fn_ptr_args] = type.match(_type_function_pointer) ?? [];
	if (isFnPtr) {
		const args = fn_ptr_args.split(',').map(v => parseType(v.trim()));
		return { kind: 'function', returns: parseType(fn_ptr_returns), args };
	}

	const [isFn, fn_returns, fn_args] = type.match(_type_function) ?? [];
	if (isFn) {
		const args = fn_args.split(',').map(v => parseType(v.trim()));
		return { kind: 'function', returns: parseType(fn_returns), args };
	}

	const [isTypeOf, typeofTarget] = type.match(_type_typeof) ?? [];
	if (isTypeOf) return { kind: 'typeof', target: parseType(typeofTarget.trim()) };

	const [isNs, namespace, inner] = type.match(_type_namespace) ?? [];
	if (isNs) return { kind: 'namespaced', namespace, inner: parseType(inner.trim()) };

	const [isQualified, leftQualifier, leftInner, rightInner, rightQualifier] = type.match(_type_qualified) ?? [];
	if (isQualified) {
		const [qualifier, inner] = leftQualifier ? [leftQualifier, leftInner] : [rightQualifier, rightInner];
		return { kind: 'qual', qualifier, inner: parseType(inner.trim()) };
	}

	const [isArray, element, length] = type.match(_type_array) ?? [];
	if (isArray) return { kind: 'array', length: length ? +length : null, element: parseType(element) };

	return { kind: 'plain', text: parseBaseType(type), raw: _isRaw ? undefined : parseType(raw, raw, alt, true) };
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

export interface RecoveryExpr extends GenericNode {
	kind: 'RecoveryExpr';
	inner: Node[];
	valueCategory: ValueCategory;
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
		| 'StringLiteral';
	valueCategory: ValueCategory;
	value?: string;
}

export interface UnaryExprOrTypeTraitExpr extends GenericNode {
	kind: 'UnaryExprOrTypeTraitExpr';
	valueCategory: ValueCategory;
	value?: string;
	argType?: TypeInfo;
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
		| 'ArrayToPointerDecay'
		| 'BitCast'
		| 'BuiltinFnToFnPtr'
		| 'Dependent'
		| 'FunctionToPointerDecay'
		| 'IntegralCast'
		| 'IntegralToBoolean'
		| 'IntegralToFloating'
		| 'LValueToRValue'
		| 'NoOp'
		| 'NullToPointer'
		| 'PointerToIntegral'
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
	| RecoveryExpr
	| Statement
	| Type
	| UnaryOperator
	| UnaryExprOrTypeTraitExpr
	| Value;

function _parseFirst<T extends xir.Unit>(node: Node): T {
	return [...parse(node.inner![0])][0] as T;
}

export function* parse(node: Node): Generator<xir.Unit> {
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
			yield { kind: 'case', matches: _parseFirst(node) };
			for (const child of node.inner.slice(1)) {
				yield* parse(child);
			}
			return;
		}
		case 'ConstantExpr':
			if (node.value) {
				yield { kind: 'value', type: parseType(node), content: node.value };
				return;
			}
		// fallthrough
		case 'CompoundStmt':
		case 'CompoundLiteralExpr':
		case 'DeclStmt':
		case 'ImplicitCastExpr':
		case 'InitListExpr':
		case 'ParenExpr':
		case 'TranslationUnitDecl':
		case 'StmtExpr':
			for (const inner of node.inner ?? []) {
				yield* parse(inner);
			}
			return;
		case 'RecoveryExpr':
			// @todo bail
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
			yield { kind: 'cast', type: parseType(node), value: _parseFirst(node) };
			return;
		case 'DefaultStmt':
			yield { kind: 'default' };
			for (const child of node.inner) {
				yield* parse(child);
			}
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
		case 'PredefinedExpr':
			yield {
				kind: 'assignment',
				operator: '=',
				left: [{ kind: 'value', type: { kind: 'plain', text: 'any' }, content: node.name! }],
				right: [...parse(node.inner![0])] as xir.Expression[],
			};
			return;
		case 'VarDecl':
			if (!node.isUsed) return;
			yield {
				kind: 'declaration',
				name: node.name,
				type: parseType(node),
				storage: node.storageClass,
				initializer: node.inner?.length ? _parseFirst<xir.Value>(node) : undefined,
			};
			return;
		case 'EnumDecl':
		case 'RecordDecl': {
			const subRecords: xir.RecordLike[] = [];
			let lastSubRecord: number | undefined;

			yield {
				kind: node.kind == 'EnumDecl' ? 'enum' : node.tagUsed!,
				name: node.name ?? '_' + node.id,
				subRecords,
				complete: node.completeDefinition,
				fields: (node.inner ?? [])
					.flatMap((node, i) => {
						if (node.kind != 'RecordDecl') {
							if (i - 1 === lastSubRecord) {
								node.type.qualType = subRecords.at(-1)?.name ?? node.type.qualType;
							}
							return [...parse(node)];
						}
						subRecords.push(...(parse(node) as IterableIterator<xir.RecordLike>));
						lastSubRecord = i;
						return [];
					})
					.map((u, index) => ({ ...u, index })) as xir.Declaration[],
			};
			return;
		}
		case 'EnumConstantDecl':
			yield {
				kind: 'enum_field',
				name: node.name,
				type: parseType(node),
				value: node.inner?.length ? _parseFirst<xir.Value>(node) : undefined,
			};
			return;
		case 'FieldDecl':
		case 'IndirectFieldDecl':
		case 'ParmVarDecl':
			yield {
				kind: node.kind == 'ParmVarDecl' ? 'parameter' : 'field',
				name: node.name,
				type: parseType(node),
				storage: node.storageClass,
			};
			return;
		case 'CharacterLiteral':
		case 'FloatingLiteral':
		case 'IntegerLiteral':
		case 'StringLiteral':
			yield { kind: 'value', type: parseType(node), content: node.value! };
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
		case 'FunctionDecl': {
			if (!node.isUsed && node.name != 'main') return;
			const [return_t] = node.type.qualType.replace(')', '').split('(');
			const body = node.inner?.find(param => param.kind == 'CompoundStmt');

			yield {
				kind: 'function',
				name: node.name,
				returns: parseType(return_t),
				exported: node.name == 'main',
				parameters:
					node.inner
						?.filter(param => param.kind == 'ParmVarDecl')
						.map((param, i) => ({
							kind: 'parameter',
							name: param.name ?? '__' + i,
							type: parseType(param),
						})) ?? [],
				body: body ? [...parse(body)] : [],
				storage: node.storageClass,
			};
			return;
		}
		case 'GotoStmt':
			yield { kind: 'goto', target: '_' + node.targetLabelDeclId };
			return;
		case 'IfStmt': {
			const [condition, body, _else] = node.inner!;
			const elseUnits = node.hasElse ? [...parse(_else)] : undefined;
			if (elseUnits && !elseUnits.length)
				warning("Else block is missing body. This could be a bug with Clang's AST.", node);

			yield {
				kind: 'if',
				condition: [...parse(condition)] as xir.Expression[],
				body: [...parse(body)],
				else: elseUnits,
			};
			return;
		}
		case 'ImplicitValueInitExpr':
			/**
			 * Does nothing in TS.
			 * @todo Implement for other languages
			 */
			return;
		case 'LabelStmt':
			yield { kind: 'comment', text: 'label: ' + node.name };
			yield { kind: 'label', name: '_' + node.declId };
			return;
		case 'DeclRefExpr':
			yield {
				kind: 'value',
				content: node.referencedDecl.name,
				type: parseType(node.referencedDecl),
			};
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
		case 'PureAttr':
			yield { kind: 'comment', text: node.kind.slice(0, -4) };
			return;
		case 'ReturnStmt':
			yield { kind: 'return', value: !node.inner ? [] : ([...parse(node.inner[0])] as xir.Expression[]) };
			return;
		case 'StaticAssertDecl': {
			const [condition, message] = node.inner ?? [];

			yield {
				kind: 'postfixed',
				primary: [
					{
						kind: 'value',
						type: {
							kind: 'function',
							returns: parseType('void'),
							args: [parseType(condition), parseType('type' in message ? message : 'string')],
						},
						content: '$__assert',
					},
				],
				post: {
					type: 'call',
					args:
						node.inner?.flatMap(node => [...parse(node)] as xir.Expression[]) ??
						(warning('Static assert is empty', node), []),
				},
			};
			return;
		}
		case 'SwitchStmt': {
			const [_expr, ..._body] = node.inner;
			yield {
				kind: 'switch',
				expression: [...parse(_expr)] as xir.Expression[],
				body: _body.flatMap(child => [...parse(child)]),
			};
			return;
		}
		case 'TypedefDecl':
			if (!node.isReferenced) return;
			if (!['__builtin_ms_va_list', '__builtin_va_list', '__NSConstantString'].includes(node.name)) {
				yield { kind: 'type_alias', name: node.name, value: parseType(node.inner![0]) };
			}
			return;
		case 'UnaryExprOrTypeTraitExpr': {
			// `sizeof(x)` or a macro

			yield {
				kind: 'postfixed',
				primary: [
					{
						kind: 'value',
						type: {
							kind: 'function',
							returns: parseType(node),
							args: node.argType
								? [parseType(node.argType.qualType)]
								: (warning(
										`Missing argument type ${JSON.stringify(omit(node, 'inner', 'id', 'range'))}`,
										node
									),
									[]),
						},
						content: node.name!,
					},
				],
				post: {
					type: 'call',
					args:
						node.name == 'sizeof'
							? [
									{
										kind: 'value',
										type: { kind: 'plain', text: 'string' },
										content: JSON.stringify(parseBaseType(node.argType?.qualType ?? 'bool')),
									},
								]
							: (node.inner?.flatMap(node => [...parse(node)] as xir.Expression[]) ??
								(warning('Empty unary or type trait expression', node), [])),
				},
			};
			return;
		}
		case 'UnaryOperator':
			yield {
				kind: 'unary',
				operator: node.opcode,
				expression: [...parse(node.inner[0])] as xir.Expression[],
			};
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
