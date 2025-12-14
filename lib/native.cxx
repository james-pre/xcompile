#include <napi.h>
#include <clang-c/Index.h>

using namespace Napi;

String GetClangAST(const CallbackInfo &args)
{
	Env env = args.Env();

	std::string filename = args[0].As<String>().Utf8Value();

	Array rawClangArgs = args[1].As<Array>();
	const unsigned int numClangArgs = rawClangArgs.Length();
	std::vector<const char *> clangArgs;
	for (unsigned int i = 0; i < numClangArgs; ++i)
	{
		clangArgs.push_back(rawClangArgs.Get(i).As<String>().Utf8Value().c_str());
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

	// TODO: Traverse AST, return JS object
	clang_visitChildren(
		cursor,
		[](CXCursor current_cursor, CXCursor parent, CXClientData client_data)
		{
		switch (current_cursor.kind)
		{
				case 
			}

			CXString current_display_name = clang_getCursorDisplayName(current_cursor);

			clang_disposeString(current_display_name);
			// Since clang_getCursorDisplayName allocates a new CXString, it must be freed. This applies
			// to all functions returning a CXString

			return CXChildVisit_Recurse;
		},
		nullptr);
}

Object Init(Env env, Object exports)
{
	exports.Set(String::New(env, "getClangAST"), Function::New(env, GetClangAST));
	return exports;
}

NODE_API_MODULE(xcompile_native, Init)