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
			return parseXIRType(node, undefined, node.id);
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
			return {
				kind: 'function',
				returns: node.inner ? parseType(node.inner[0]) : { kind: 'plain', text: 'unknown' },
				args: node.inner?.slice(1).map(parseType) ?? [],
			};
		default:
			throw 'Unsupported node kind: ' + node.kind;
	}
}

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
};

// Convert strings into XIR types
function parseXIRBaseType(type: string): string {
	type = type.trim();
	if (xir.isBuiltin(type)) return type;
	if (type in _typeMappings) return _typeMappings[type as keyof typeof _typeMappings];
	return type;
}

const _type_anonymous = /(?:unnamed(?: \w+)?|anonymous) at /i;
const _type_namespace = /^(struct|union|enum) (.*)/;
const _type_function = /([^(]+)\s+\(\)\s*\((.*)\)/i;

function parseXIRType(type: string | Node, raw?: string, alt?: string, _isRaw: boolean = false): xir.Type {
	if (!type) return { kind: 'plain', text: 'unknown' };

	if (typeof type != 'string') {
		const _ = type.type ?? {};
		const _raw = type.kind.endsWith('Type') ? type.name || '_' + type.id : _.qualType;
		return parseXIRType(_.qualType, _.desugaredQualType ?? _raw, _raw);
	}

	type = type.trim();
	raw ??= type;

	const match = type.match(_type_anonymous);

	if (match) type = alt ?? '';

	const [, fn_returns, fn_args] = type.match(_type_function) ?? [];

	if (fn_returns)
		return {
			kind: 'function',
			returns: parseXIRType(fn_returns),
			args: fn_args.split(',').map(v => parseXIRType(v.trim())),
		};

	const [, namespace, inner] = type.match(_type_namespace) ?? [];

	if (namespace) return { kind: 'namespaced', namespace, inner: parseXIRType(inner) };

	type = type.trim();
	if (type.startsWith('const ')) {
		return { kind: 'qual', qualifiers: 'const', inner: parseXIRType(type.slice(6)) };
	}

	if (type.includes('*')) {
		return {
			kind: 'ref',
			restricted: type.includes('*restrict'),
			to: parseXIRType(type.replace(/\s*\*(restrict)?\s*/, '')),
		};
	}

	const _raw = _isRaw ? undefined : parseXIRType(raw, raw, alt, true);

	if (type.at(-1) != ']') return { kind: 'plain', text: parseXIRBaseType(type), raw: _raw };

	const [base, ...lengths] = type.replaceAll(']', '').split('[');

	let current: xir.Type = { kind: 'plain', text: parseXIRBaseType(base), raw: _raw };

	for (const length of lengths.map(Number)) {
		current = { kind: 'const_array', length, element: current };
	}

	return current;
}

function parseTypedef(node: Node): xir.Type {
	if (node.kind == 'ElaboratedType' && node.ownedTagDecl && !node.ownedTagDecl.name) {
		return { kind: 'plain', text: '_' + node.ownedTagDecl.id };
	}
	if (!node.inner) return parseXIRType(node);
	return parseTypedef(node.inner[0]);
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

function _parseFirst<T extends xir.Unit>(node: Node): T {
	return [...parse(node.inner![0])][0] as T;
}

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
				yield { kind: 'value', type: parseXIRType(node), content: node.value };
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
			yield { kind: 'cast', type: parseXIRType(node), value: _parseFirst(node) };
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
			yield {
				kind: 'declaration',
				name: node.name,
				type: parseXIRType(node),
				initializer: node.inner?.length ? _parseFirst<xir.Value>(node) : undefined,
			};
			return;
		case 'EnumDecl':
		case 'RecordDecl': {
			if (node.kind == 'RecordDecl' && !node.completeDefinition) {
				// _note('Skipping incomplete definition')
				return;
			}

			const subRecords: xir.RecordLike[] = [];
			let lastSubRecord: number | undefined;

			yield {
				kind: node.kind == 'EnumDecl' ? 'enum' : node.tagUsed!,
				name: node.name ?? '_' + node.id,
				subRecords,
				fields: node
					.inner!.flatMap((node, i) => {
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
				type: parseXIRType(node),
				value: node.inner?.length ? _parseFirst<xir.Value>(node) : undefined,
			};
			return;
		case 'FieldDecl':
		case 'IndirectFieldDecl':
		case 'ParmVarDecl':
			yield {
				kind: node.kind == 'ParmVarDecl' ? 'parameter' : 'field',
				name: node.name,
				type: parseXIRType(node),
				storage: node.storageClass,
			};
			return;
		case 'CharacterLiteral':
		case 'FloatingLiteral':
		case 'IntegerLiteral':
		case 'StringLiteral':
			yield { kind: 'value', type: parseXIRType(node), content: node.value! };
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
			const [return_t] = node.type.qualType.replace(')', '').split('(');
			const body = node.inner?.find(param => param.kind == 'CompoundStmt');

			yield {
				kind: 'function',
				name: node.name,
				returns: parseXIRType(return_t),
				parameters:
					node.inner
						?.filter(param => param.kind == 'ParmVarDecl')
						.map((param, i) => ({
							kind: 'parameter',
							name: param.name ?? '__' + i,
							type: parseXIRType(param),
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
			yield {
				kind: 'if',
				condition: [...parse(condition)] as xir.Expression[],
				body: [...parse(body)],
				else: node.hasElse ? [...parse(_else)] : undefined,
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
				type: parseXIRType(node.referencedDecl),
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
			yield { kind: 'return', value: [...parse(node.inner[0])] as xir.Expression[] };
			return;
		case 'StaticAssertDecl':
			yield {
				kind: 'postfixed',
				primary: [
					{
						kind: 'value',
						type: {
							kind: 'function',
							returns: parseXIRType('void'),
							args: [parseXIRType('bool'), parseXIRType('string')],
						},
						content: '$__assert',
					},
				],
				post: {
					type: 'call',
					args: node.inner?.flatMap(node => [...parse(node)]) as xir.Expression[],
				},
			};
			return;
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
			yield { kind: 'type_alias', name: node.name, value: parseTypedef(node) };
			return;
		case 'UnaryExprOrTypeTraitExpr': {
			// In C this is always `sizeof x`
			yield {
				kind: 'postfixed',
				primary: [
					{
						kind: 'value',
						type: { kind: 'function', returns: parseXIRType('uint64'), args: [parseXIRType('any')] },
						content: node.name!,
					},
				],
				post: { type: 'call', args: node.inner?.flatMap(node => [...parse(node)]) as xir.Expression[] },
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
