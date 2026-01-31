// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Specific boilerplate needed when compiling between specific languages.
 * Copyright (c) 2025 James Prevett
 */

/**
 * Boilerplate to make stuff with C work
 */
export const cToTypescriptHeader = `
// auto-included compatibility types
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
type $typeof<T> = {};

declare function $ref_t<T extends Type>(t: FieldConfigInit<T>): Type<Ref<T>>;

declare function $__typeof<T>(value: T): $typeof<T>;
declare function $__assert(condition: any, message?: string | Ref<int8>): void;
declare function $__ref<T>(value: T): Ref<T>;
declare function $__deref<T>(value: Ref<T>): T;
declare function $__array<T>(start: Ref<T>, i: bigint): T;
declare function $__array<T>(start: Ref<T>, i: bigint, value?: T): void;
declare function $__str(value: string): Ref<int8>;
declare function $__allocConstArray<T, L extends number>(length: L, ...init: T[]): ConstArray<T, L>;

declare let __func__: Ref<int8> | undefined;
// end of auto-included compatibility types
`;
