cmake_minimum_required(VERSION 3.15)
project(xcompile-native)

add_compile_definitions(NAPI_VERSION=10)

add_definitions(-DNODE_ADDON_API_CPP_EXCEPTIONS)
add_definitions(-DNODE_ADDON_API_CPP_EXCEPTIONS_ALL)

find_path(CLANG_INCLUDE_DIR NAMES clang-c/Index.h PATH_SUFFIXES include llvm-21/include llvm-20/include)
find_library(CLANG_LIB NAMES clang libclang PATH_SUFFIXES lib llvm-21/lib llvm-20/lib)

if(NOT CLANG_INCLUDE_DIR)
	message(FATAL_ERROR "Could not find clang-c/Index.h. Install libclang development headers.")
endif()

if(NOT CLANG_LIB)
	message(FATAL_ERROR "Could not find libclang. Install libclang development library.")
endif()

file(GLOB SRC "src/native/*")

add_library(${PROJECT_NAME} SHARED ${SRC} ${CMAKE_JS_SRC})
set_target_properties(${PROJECT_NAME} PROPERTIES
	PREFIX ""
	SUFFIX ".node"
	LIBRARY_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/lib"
	RUNTIME_OUTPUT_DIRECTORY "${CMAKE_SOURCE_DIR}/lib"
)
target_include_directories(${PROJECT_NAME} PRIVATE ${CMAKE_JS_INC})
target_include_directories(${PROJECT_NAME} PRIVATE ${CLANG_INCLUDE_DIR})
target_link_libraries(${PROJECT_NAME} PRIVATE ${CMAKE_JS_LIB} ${CLANG_LIB})
target_compile_features(${PROJECT_NAME} PRIVATE cxx_std_17)
