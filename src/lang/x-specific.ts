// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Specific boilerplate needed when compiling between specific languages.
 * Copyright (c) 2025 James Prevett
 */

/**
 * Boilerplate to make stuff with C work
 *
 * `Ref<T>`
 *
 * Pointer to `T`. Note `__ref__` doesn't actually exist and is only here to keep TS types when passing it around
 *
 *
 * `ConstArray<T, L>`
 *
 * Constant array `T[L]`.
 *
 * `$__ref<T>(value: T): Ref<T>;`
 *
 * Equivalent to C `&value`
 *
 * `$__deref<T>(value: Ref<T>): T;`
 *
 * Equivalent to C `(*value)`
 *
 * `$__deref_set<T>(left: Ref<T>, right: Ref<T> | T): void;`
 *
 * Equivalent to C `(*value) = ...`
 *
 * `$__array<T>(start: Ref<T>, i: bigint): T;`
 *
 * Access an element of an array, but using the pointer type (e.g. accessing `x[0]` where `x` is `char*`)
 *
 * `$__array<T>(start: Ref<T>, i: bigint, value?: T): void;`
 *
 * Set an element of an array, but using the pointer type (e.g. `x[0] = ...` where `x` is `char*`)
 *
 * `$__str(value: string): Ref<int8>;`
 *
 * Converts a JS string literal into a `char*`/`Ref<int8>`
 *
 * `$__allocConstArray<T, L extends number>(length: L, ...init: T[]): ConstArray<T, L>;`
 *
 * Allocates an array of length `L` with elements of type `T`. Takes in optional initializers
 *
 */
export const cToTypescriptHeader = `
import { types as t, struct, union, sizeof, Void, array } from 'memium';
import type { StructConstructor, Type, FieldConfigInit } from 'memium';

type int8 = number;
type uint8 = number;
type int16 = number;
type uint16 = number;
type int32 = number;
type uint32 = number;
type int64 = bigint;
type uint64 = bigint;
type int128 = bigint;
type uint128 = bigint;
type float32 = number;
type float64 = number;
type float128 = number;

type bool = boolean | number;
type Ref<T> = bigint & { __ref__?: T };
type ConstArray<T, L extends number> = Array<T> & { length: L } & Ref<T>;

declare function $ref_t<T extends Type>(t: FieldConfigInit<T>): Type<Ref<T>>;

declare function $__assert(condition: boolean, message?: Ref<int8>): void;
declare function $__ref<T>(value: T): Ref<T>;
declare function $__deref<T>(value: Ref<T>): T;
declare function $__array<T>(start: Ref<T>, i: bigint): T;
declare function $__array<T>(start: Ref<T>, i: bigint, value?: T): void;
declare function $__str(value: string): Ref<int8>;
declare function $__allocConstArray<T, L extends number>(length: L, ...init: T[]): ConstArray<T, L>;

declare let __func__: Ref<int8> | undefined;
`;
