#include <napi.h>
#include <clang-c/Index.h>
#include <vector>
#include <string>

using namespace Napi;

const char *GetCursorKindStr(CXCursorKind kind)
{
	switch (kind)
	{
	case CXCursor_StructDecl:
		return "RecordDecl";
	case CXCursor_UnionDecl:
		return "RecordDecl";
	case CXCursor_ClassDecl:
		return "RecordDecl";
	case CXCursor_EnumDecl:
		return "EnumDecl";
	case CXCursor_FieldDecl:
		return "FieldDecl";
	case CXCursor_EnumConstantDecl:
		return "EnumConstantDecl";
	case CXCursor_FunctionDecl:
		return "FunctionDecl";
	case CXCursor_VarDecl:
		return "VarDecl";
	case CXCursor_ParmDecl:
		return "ParmVarDecl";
	case CXCursor_TypedefDecl:
		return "TypedefDecl";
	case CXCursor_CXXMethod:
		return "CXXMethod";
	case CXCursor_Namespace:
		return "NamespaceDecl";
	case CXCursor_Constructor:
		return "CXXConstructorDecl";
	case CXCursor_Destructor:
		return "CXXDestructorDecl";
	case CXCursor_ConversionFunction:
		return "CXXConversionDecl";
	case CXCursor_TemplateTypeParameter:
		return "TemplateTypeParameter";
	case CXCursor_NonTypeTemplateParameter:
		return "NonTypeTemplateParameter";
	case CXCursor_TemplateTemplateParameter:
		return "TemplateTemplateParameter";
	case CXCursor_FunctionTemplate:
		return "FunctionTemplate";
	case CXCursor_ClassTemplate:
		return "ClassTemplate";
	case CXCursor_ClassTemplatePartialSpecialization:
		return "ClassTemplatePartialSpecialization";
	case CXCursor_NamespaceAlias:
		return "NamespaceAlias";
	case CXCursor_UsingDirective:
		return "UsingDirective";
	case CXCursor_UsingDeclaration:
		return "UsingDeclaration";
	case CXCursor_TypeAliasDecl:
		return "TypeAliasDecl";
	case CXCursor_CXXAccessSpecifier:
		return "CXXAccessSpecifier";
	case CXCursor_TypeRef:
		return "TypeRef";
	case CXCursor_TemplateRef:
		return "TemplateRef";
	case CXCursor_NamespaceRef:
		return "NamespaceRef";
	case CXCursor_MemberRef:
		return "MemberRef";
	case CXCursor_LabelRef:
		return "LabelRef";
	case CXCursor_OverloadedDeclRef:
		return "OverloadedDeclRef";
	case CXCursor_VariableRef:
		return "VariableRef";
	case CXCursor_DeclRefExpr:
		return "DeclRefExpr";
	case CXCursor_MemberRefExpr:
		return "MemberExpr";
	case CXCursor_CallExpr:
		return "CallExpr";
	case CXCursor_BlockExpr:
		return "BlockExpr";
	case CXCursor_IntegerLiteral:
		return "IntegerLiteral";
	case CXCursor_FloatingLiteral:
		return "FloatingLiteral";
	case CXCursor_ImaginaryLiteral:
		return "ImaginaryLiteral";
	case CXCursor_StringLiteral:
		return "StringLiteral";
	case CXCursor_CharacterLiteral:
		return "CharacterLiteral";
	case CXCursor_ParenExpr:
		return "ParenExpr";
	case CXCursor_UnaryOperator:
		return "UnaryOperator";
	case CXCursor_ArraySubscriptExpr:
		return "ArraySubscriptExpr";
	case CXCursor_BinaryOperator:
		return "BinaryOperator";
	case CXCursor_CompoundAssignOperator:
		return "CompoundAssignOperator";
	case CXCursor_ConditionalOperator:
		return "ConditionalOperator";
	case CXCursor_CStyleCastExpr:
		return "CStyleCastExpr";
	case CXCursor_CompoundLiteralExpr:
		return "CompoundLiteralExpr";
	case CXCursor_InitListExpr:
		return "InitListExpr";
	case CXCursor_AddrLabelExpr:
		return "AddrLabelExpr";
	case CXCursor_StmtExpr:
		return "StmtExpr";
	case CXCursor_GenericSelectionExpr:
		return "GenericSelectionExpr";
	case CXCursor_GNUNullExpr:
		return "GNUNullExpr";
	case CXCursor_CXXStaticCastExpr:
		return "CXXStaticCastExpr";
	case CXCursor_CXXDynamicCastExpr:
		return "CXXDynamicCastExpr";
	case CXCursor_CXXReinterpretCastExpr:
		return "CXXReinterpretCastExpr";
	case CXCursor_CXXConstCastExpr:
		return "CXXConstCastExpr";
	case CXCursor_CXXFunctionalCastExpr:
		return "CXXFunctionalCastExpr";
	case CXCursor_CXXTypeidExpr:
		return "CXXTypeidExpr";
	case CXCursor_CXXBoolLiteralExpr:
		return "CXXBoolLiteralExpr";
	case CXCursor_CXXNullPtrLiteralExpr:
		return "CXXNullPtrLiteralExpr";
	case CXCursor_CXXThisExpr:
		return "CXXThisExpr";
	case CXCursor_CXXThrowExpr:
		return "CXXThrowExpr";
	case CXCursor_CXXNewExpr:
		return "CXXNewExpr";
	case CXCursor_CXXDeleteExpr:
		return "CXXDeleteExpr";
	case CXCursor_UnaryExpr:
		return "UnaryExpr";
	case CXCursor_PackExpansionExpr:
		return "PackExpansionExpr";
	case CXCursor_SizeOfPackExpr:
		return "SizeOfPackExpr";
	case CXCursor_LambdaExpr:
		return "LambdaExpr";
	case CXCursor_LabelStmt:
		return "LabelStmt";
	case CXCursor_CompoundStmt:
		return "CompoundStmt";
	case CXCursor_CaseStmt:
		return "CaseStmt";
	case CXCursor_DefaultStmt:
		return "DefaultStmt";
	case CXCursor_IfStmt:
		return "IfStmt";
	case CXCursor_SwitchStmt:
		return "SwitchStmt";
	case CXCursor_WhileStmt:
		return "WhileStmt";
	case CXCursor_DoStmt:
		return "DoStmt";
	case CXCursor_ForStmt:
		return "ForStmt";
	case CXCursor_GotoStmt:
		return "GotoStmt";
	case CXCursor_IndirectGotoStmt:
		return "IndirectGotoStmt";
	case CXCursor_ContinueStmt:
		return "ContinueStmt";
	case CXCursor_BreakStmt:
		return "BreakStmt";
	case CXCursor_ReturnStmt:
		return "ReturnStmt";
	case CXCursor_AsmStmt:
		return "AsmStmt";
	case CXCursor_CXXCatchStmt:
		return "CXXCatchStmt";
	case CXCursor_CXXTryStmt:
		return "CXXTryStmt";
	case CXCursor_CXXForRangeStmt:
		return "CXXForRangeStmt";
	case CXCursor_NullStmt:
		return "NullStmt";
	case CXCursor_DeclStmt:
		return "DeclStmt";
	case CXCursor_TranslationUnit:
		return "TranslationUnitDecl";
	case CXCursor_UnexposedAttr:
		return "UnexposedAttr";
	case CXCursor_IBActionAttr:
		return "IBActionAttr";
	case CXCursor_IBOutletAttr:
		return "IBOutletAttr";
	case CXCursor_IBOutletCollectionAttr:
		return "IBOutletCollectionAttr";
	case CXCursor_CXXFinalAttr:
		return "CXXFinalAttr";
	case CXCursor_CXXOverrideAttr:
		return "CXXOverrideAttr";
	case CXCursor_AnnotateAttr:
		return "AnnotateAttr";
	case CXCursor_AsmLabelAttr:
		return "AsmLabelAttr";
	case CXCursor_PackedAttr:
		return "PackedAttr";
	case CXCursor_PureAttr:
		return "PureAttr";
	case CXCursor_ConstAttr:
		return "ConstAttr";
	case CXCursor_NoDuplicateAttr:
		return "NoDuplicateAttr";
	case CXCursor_CUDAConstantAttr:
		return "CUDAConstantAttr";
	case CXCursor_CUDADeviceAttr:
		return "CUDADeviceAttr";
	case CXCursor_CUDAGlobalAttr:
		return "CUDAGlobalAttr";
	case CXCursor_CUDAHostAttr:
		return "CUDAHostAttr";
	case CXCursor_CUDASharedAttr:
		return "CUDASharedAttr";
	case CXCursor_VisibilityAttr:
		return "VisibilityAttr";
	case CXCursor_DLLExport:
		return "DLLExport";
	case CXCursor_DLLImport:
		return "DLLImport";
	default:
	{
		CXString ks = clang_getCursorKindSpelling(kind);
		const char *result = clang_getCString(ks);
		clang_disposeString(ks);
		return result;
	}
	}
}

Object CreateLocation(Env env, CXCursor cursor)
{
	CXSourceLocation loc = clang_getCursorLocation(cursor);
	CXFile file;
	unsigned line, column, offset;
	clang_getSpellingLocation(loc, &file, &line, &column, &offset);

	Object locObj = Object::New(env);
	locObj.Set("line", Number::New(env, line));
	locObj.Set("col", Number::New(env, column));
	locObj.Set("offset", Number::New(env, offset));

	CXSourceRange range = clang_getCursorExtent(cursor);
	CXSourceLocation end = clang_getRangeEnd(range);
	unsigned endOffset;
	clang_getSpellingLocation(end, nullptr, nullptr, nullptr, &endOffset);

	long long length = (long long)endOffset - (long long)offset;
	locObj.Set("tokLen", Number::New(env, length > 0 ? length : 0));

	if (file)
	{
		CXString filename = clang_getFileName(file);
		locObj.Set("file", String::New(env, clang_getCString(filename)));
		clang_disposeString(filename);
	}

	return locObj;
}

Object CreateTypeInfo(Env env, CXType type)
{
	Object typeInfo = Object::New(env);
	CXString typeSpelling = clang_getTypeSpelling(type);
	typeInfo.Set("qualType", String::New(env, clang_getCString(typeSpelling)));
	clang_disposeString(typeSpelling);

	CXType canonical = clang_getCanonicalType(type);
	if (!clang_equalTypes(type, canonical))
	{
		CXString canonSpelling = clang_getTypeSpelling(canonical);
		typeInfo.Set("desugaredQualType", String::New(env, clang_getCString(canonSpelling)));
		clang_disposeString(canonSpelling);
	}
	return typeInfo;
}

struct VisitContext
{
	Env env;
	Array container;
};

CXChildVisitResult Visit(CXCursor cursor, CXCursor parent, CXClientData client_data)
{
	VisitContext *ctx = static_cast<VisitContext *>(client_data);
	Env env = ctx->env;

	if (clang_Cursor_isNull(cursor))
		return CXChildVisit_Continue;

	CXCursorKind kind = clang_getCursorKind(cursor);
	if ((kind >= CXCursor_OMPParallelDirective && kind <= CXCursor_OMPStripeDirective && kind != CXCursor_SEHLeaveStmt && kind != CXCursor_BuiltinBitCastExpr) || kind == CXCursor_OMPArrayShapingExpr || kind == CXCursor_OMPIteratorExpr)
		return CXChildVisit_Continue;
	if (kind >= CXCursor_OpenACCComputeConstruct && kind <= CXCursor_OpenACCCacheConstruct)
		return CXChildVisit_Continue;
	if (clang_getCursorLanguage(cursor) == CXLanguage_ObjC)
		return CXChildVisit_Continue;

	Object node = Object::New(env);

	const char *kindName = GetCursorKindStr(kind);
	node.Set("kind", String::New(env, kindName));

	if (kind == CXCursor_StructDecl)
		node.Set("tagUsed", String::New(env, "struct"));
	else if (kind == CXCursor_UnionDecl)
		node.Set("tagUsed", String::New(env, "union"));
	else if (kind == CXCursor_ClassDecl)
		node.Set("tagUsed", String::New(env, "class"));

	CXString usr = clang_getCursorUSR(cursor);
	node.Set("id", String::New(env, clang_getCString(usr)));
	clang_disposeString(usr);

	CXString name = clang_getCursorSpelling(cursor);
	node.Set("name", String::New(env, clang_getCString(name)));
	clang_disposeString(name);

	node.Set("loc", CreateLocation(env, cursor));

	CXType type = clang_getCursorType(cursor);
	if (type.kind != CXType_Invalid)
	{
		node.Set("type", CreateTypeInfo(env, type));
	}

	if (kind == CXCursor_DeclRefExpr || kind == CXCursor_CallExpr)
	{
		CXCursor referenced = clang_getCursorReferenced(cursor);
		if (clang_Cursor_isNull(referenced))
		{
			throw Error::New(env, "Referenced cursor is null");
		}

		Object refNode = Object::New(env);
		CXString refName = clang_getCursorSpelling(referenced);
		refNode.Set("name", String::New(env, clang_getCString(refName)));
		clang_disposeString(refName);

		CXType refType = clang_getCursorType(referenced);
		if (refType.kind != CXType_Invalid)
		{
			refNode.Set("type", CreateTypeInfo(env, refType));
		}

		node.Set("referencedDecl", refNode);
	}

	Array inner = Array::New(env);
	node.Set("inner", inner);

	VisitContext innerCtx = {env, inner};
	clang_visitChildren(cursor, Visit, &innerCtx);

	uint32_t len = ctx->container.Length();
	ctx->container.Set(len, node);

	return CXChildVisit_Continue;
}

Value GetClangAST(const CallbackInfo &args)
{
	Env env = args.Env();

	if (args.Length() < 2 || !args[0].IsString() || !args[1].IsArray())
	{
		throw Error::New(env, "Expected (filename: string, args: string[])");
	}

	std::string filename = args[0].As<String>().Utf8Value();

	Array rawClangArgs = args[1].As<Array>();
	const unsigned int numClangArgs = rawClangArgs.Length();
	std::vector<std::string> clangArgsStorage;
	std::vector<const char *> clangArgs;

	for (unsigned int i = 0; i < numClangArgs; ++i)
	{
		clangArgsStorage.push_back(rawClangArgs.Get(i).As<String>().Utf8Value());
		clangArgs.push_back(clangArgsStorage.back().c_str());
	}

	CXIndex index = clang_createIndex(0, 1);

	CXTranslationUnit unit = clang_parseTranslationUnit(
		index,
		filename.c_str(),
		clangArgs.data(), numClangArgs,
		nullptr, 0,
		CXTranslationUnit_None);

	if (unit == nullptr)
		throw Error::New(env, "Unable to parse translation unit");

	CXCursor cursor = clang_getTranslationUnitCursor(unit);

	Array rootNodes = Array::New(env);
	VisitContext rootCtx = {env, rootNodes};

	clang_visitChildren(cursor, Visit, &rootCtx);

	clang_disposeTranslationUnit(unit);
	clang_disposeIndex(index);

	return rootNodes;
}

Object Init(Env env, Object exports)
{
	exports.Set(String::New(env, "getClangAST"), Function::New(env, GetClangAST));
	return exports;
}

NODE_API_MODULE(xcompile_native, Init)