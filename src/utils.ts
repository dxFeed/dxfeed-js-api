/** @license
 * Copyright ©2020 Devexperts LLC. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { CometdSeries, EventType, ISubscriptionList } from './interfaces'

export function subMapToSetOfLists<T>(sub: CometdSeries<T>): ISubscriptionList {
  // sub : (type :-> symbol :-> subItem), returns (type :-> [symbol])
  return Object.entries(sub).reduce((acc, value) => {
    acc[value[0] as EventType] = Object.keys(value[1])
    return acc
  }, {} as ISubscriptionList)
}

export const toBooleanCometdSub = <T>(sub: CometdSeries<T>) =>
  Object.keys(sub).reduce((acc, key) => {
    const eventType = key as EventType
    acc[eventType] = Object.keys(sub[eventType]).reduce((innerAcc, innerKey) => {
      innerAcc[innerKey] = Boolean(sub[eventType][innerKey])
      return innerAcc
    }, {} as Record<string, boolean>)
    return acc
  }, {} as CometdSeries<boolean>)

function timeSeriesSubSetToList(obj: Record<string, { fromTime: number }>) {
  return Object.keys(obj).map((key) => ({
    eventSymbol: key,
    fromTime: obj[key].fromTime,
  }))
}

export function timeSeriesSubMapToSetOfLists(sub: CometdSeries<{ fromTime: number }>) {
  return Object.entries(sub).reduce((acc, value) => {
    acc[value[0]] = timeSeriesSubSetToList(value[1])
    return acc
  }, {} as Record<string, { fromTime: number; eventSymbol: string }[]>)
}

export const isEmptySet = (obj: object) => Object.keys(obj).length === 0

export const splitChunks = <Value>(values: Value[], chunkSize: number) => {
  const results: Value[][] = []

  for (let offset = 0; offset < values.length; offset += chunkSize) {
    results.push(values.slice(offset, offset + chunkSize))
  }

  return results
}

type Cleanup = () => void
/**
 * regular promise creator but with the ability to handle code that requires cleanup in a simpler way
 *
 * @example
 * // setup promise that will be rejected after 5 seconds
 * newPromiseWithResource((resolve, reject, useResource) => {
 *   useResource(() => {
 *     const id = setTimeout(() => reject('Timeout'), 5_000)
 *     return () => clearTimeout(id)
 *   })
 *   // additional body steps, like http requests
 * })
 */
export const newPromiseWithResource = <T>(
  executor: (
    resolve: (value: T) => void,
    reject: (reason: unknown) => void,
    useResource: (resourceFn: () => Cleanup) => void
  ) => void
): Promise<T> => {
  const cleanups: Cleanup[] = []

  const cleanupAll = () => {
    cleanups.forEach((cleanup) => cleanup())
  }

  return new Promise((resolve, reject) => {
    const useResource = (resourceFn: () => Cleanup) => {
      const cleanup = resourceFn()
      cleanups.push(cleanup)
    }

    const resolveWithCleanup = (value: T) => {
      cleanupAll()
      resolve(value)
    }
    const rejectWithCleanup = (reason: unknown) => {
      cleanupAll()
      reject(reason)
    }

    executor(resolveWithCleanup, rejectWithCleanup, useResource)
  })
}
