cmake_minimum_required(VERSION 3.15)
project(xcompile-native)

add_compile_definitions(NAPI_VERSION=10)

add_definitions(-DNODE_ADDON_API_CPP_EXCEPTIONS)
add_definitions(-DNODE_ADDON_API_CPP_EXCEPTIONS_ALL)

find_library(CLANG_LIB NAMES clang clang-21 libclang.so.21.1)
if (NOT CLANG_LIB)
    message(FATAL_ERROR "libclang not found in /usr/lib64 or default paths")
endif()

file(GLOB SRC "lib/*")

add_library(${PROJECT_NAME} SHARED ${SRC} ${CMAKE_JS_SRC})
set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")
target_include_directories(${PROJECT_NAME} PRIVATE ${CMAKE_JS_INC})
target_link_libraries(${PROJECT_NAME} PRIVATE ${CMAKE_JS_LIB} ${CLANG_LIB})
target_compile_features(${PROJECT_NAME} PRIVATE cxx_std_17)
