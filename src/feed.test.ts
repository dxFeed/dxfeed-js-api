/** @license
 * Copyright ©2020 Devexperts LLC. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

jest.mock('./endpoint')

import { REMOVE_EVENT_FLAG, SNAPSHOT_SNIP_FLAG, TX_PENDING_FLAG } from './event-flags'
import Feed from './feed'
import { EventType, IncomingData } from './interfaces'
import { AbortedError, TimeoutError } from './feed'

describe('Feed', () => {
  let instance: Feed

  beforeEach(() => {
    jest.useFakeTimers()
    instance = new Feed()
  })

  it('mock should work', () => {
    expect((instance.endpoint as any).mock).toBeTruthy()
  })

  it('should trigger series sub event on data', () => {
    const eventType = EventType.Summary
    const eventSymbol = 'AEX.IND:TEI'

    let dataResults
    const handleEvent = jest.fn((data) => {
      dataResults = data
    })

    instance.subscribe([eventType], [eventSymbol], handleEvent)

    instance.endpoint.handlers?.onData?.(
      [
        [eventType, ['eventSymbol', 'eventTime']],
        [eventSymbol, 0],
      ],
      false
    )

    jest.runAllTimers()

    expect(handleEvent).toBeCalled()

    expect(dataResults).toEqual({
      eventSymbol,
      eventTime: 0,
      eventType,
    })
  })

  it('should trigger time series sub event on data', () => {
    const eventType = EventType.Candle
    const eventSymbol = 'AEX.IND:TEI{=15m}'

    let dataResults
    const handleEvent = jest.fn((data) => {
      dataResults = data
    })

    instance.subscribeTimeSeries([eventType], [eventSymbol], 0, handleEvent)

    instance.endpoint.handlers?.onData?.(
      [
        [eventType, ['eventSymbol', 'eventTime', 'eventFlags', 'index', 'time']],
        [
          ...[eventSymbol, 0, 0, 6829250544717005000, 1590058800000],
          ...[eventSymbol, 0, 0, 6829246679246438000, 1590057900000],
        ],
      ],
      true
    )

    jest.runAllTimers()

    expect(handleEvent).toBeCalled()
    expect(dataResults).toBeDefined()

    expect(dataResults).toHaveProperty('eventType', eventType)
    expect(dataResults).toHaveProperty('eventSymbol', eventSymbol)
  })

  // TODO: Нужен тест проверяющий разные типы обработки Data, когда уже есть структура в памяти для какого-то эвента
})

describe('Feed - subscriptions', () => {
  let instance: Feed

  const eventType = EventType.Summary
  const symbolsSet1 = ['1', '2', '3', '4']
  const symbolsSet2 = ['2', '3']

  const createSubscription = (symbols: string[]) =>
    instance.subscribe([eventType], symbols, () => 0)

  const createMultipleSubscriptions = (symbols: string[]) =>
    symbols.map((symbol) => instance.subscribe([eventType], [symbol], () => 0))

  beforeEach(() => {
    jest.useFakeTimers()
    instance = new Feed()
  })

  it('should unsubscribe crossing subscriptions correctly', () => {
    const publishFirstTime = jest.fn()
    instance.endpoint.updateSubscriptions = publishFirstTime

    const unsubscribe1 = createSubscription(symbolsSet1)

    const unsubscribe2 = createSubscription(symbolsSet2)

    jest.runAllTimers()

    const publishSecondTime = jest.fn()
    instance.endpoint.updateSubscriptions = publishSecondTime

    unsubscribe2()

    jest.runAllTimers()

    const publishThirdTime = jest.fn()
    instance.endpoint.updateSubscriptions = publishThirdTime

    unsubscribe1()

    jest.runAllTimers()

    expect(publishFirstTime).toBeCalledTimes(1)
    expect(publishFirstTime).toBeCalledWith({ add: { [eventType]: symbolsSet1 } })

    expect(publishSecondTime).toBeCalledTimes(0)

    expect(publishThirdTime).toBeCalledTimes(1)
    expect(publishThirdTime).toBeCalledWith({
      remove: { [eventType]: symbolsSet1 },
    })
  })

  it('should remove and add correctly in 1 tick', () => {
    const publishFirstTime = jest.fn()
    instance.endpoint.updateSubscriptions = publishFirstTime

    const unsubscribeSet1 = createMultipleSubscriptions(symbolsSet1)

    jest.runAllTimers()

    const publishSecondTime = jest.fn()
    instance.endpoint.updateSubscriptions = publishSecondTime

    unsubscribeSet1.forEach((unsubscribe) => {
      unsubscribe()
    })

    createMultipleSubscriptions(symbolsSet2)

    jest.runAllTimers()

    expect(publishFirstTime).toBeCalledTimes(1)
    expect(publishFirstTime).toBeCalledWith({ add: { [eventType]: symbolsSet1 } })

    expect(publishSecondTime).toBeCalledTimes(1)
    expect(publishSecondTime).toBeCalledWith({
      add: { [eventType]: symbolsSet2 },
      remove: { [eventType]: ['1', '4'] },
    })
  })

  it('should remove and add correctly in different ticks', () => {
    const publishFirstTime = jest.fn()
    instance.endpoint.updateSubscriptions = publishFirstTime

    const unsubscribeSet1 = createMultipleSubscriptions(symbolsSet1)

    jest.runAllTimers()

    const publishSecondTime = jest.fn()
    instance.endpoint.updateSubscriptions = publishSecondTime

    unsubscribeSet1.forEach((unsubscribe) => {
      unsubscribe()
    })

    jest.runAllTimers()

    const publishThirdTime = jest.fn()
    instance.endpoint.updateSubscriptions = publishThirdTime

    createMultipleSubscriptions(symbolsSet2)

    jest.runAllTimers()

    expect(publishFirstTime).toBeCalledTimes(1)
    expect(publishFirstTime).toBeCalledWith({ add: { [eventType]: symbolsSet1 } })

    expect(publishSecondTime).toBeCalledTimes(1)
    expect(publishSecondTime).toBeCalledWith({
      remove: { [eventType]: symbolsSet1 },
    })

    expect(publishThirdTime).toBeCalledTimes(1)
    expect(publishThirdTime).toBeCalledWith({
      add: { [eventType]: symbolsSet2 },
    })
  })
})

describe('Feed - subscriptions time series', () => {
  let instance: Feed

  const eventType = EventType.Candle
  const symbolsSet1 = ['1', '2', '3', '4']
  const symbolsSet2 = ['2', '3']

  const createSubscriptionTimeSeries = (symbols: string[], fromTime: number) =>
    instance.subscribeTimeSeries([eventType], symbols, fromTime, () => 0)

  beforeEach(() => {
    jest.useFakeTimers()
    instance = new Feed()
  })

  it('should unsubscribe crossing subscriptions correctly', () => {
    const publishFirstTime = jest.fn()
    instance.endpoint.updateSubscriptions = publishFirstTime

    const fromTime1 = 1000
    const fromTime2 = 10

    const unsubscribe1 = createSubscriptionTimeSeries(symbolsSet1, fromTime1)

    const unsubscribe2 = createSubscriptionTimeSeries(symbolsSet2, fromTime2)

    jest.runAllTimers()

    const publishSecondTime = jest.fn()
    instance.endpoint.updateSubscriptions = publishSecondTime

    unsubscribe2()

    jest.runAllTimers()

    const publishThirdTime = jest.fn()
    instance.endpoint.updateSubscriptions = publishThirdTime

    unsubscribe1()

    jest.runAllTimers()

    expect(publishFirstTime).toBeCalledTimes(1)
    expect(publishFirstTime).toBeCalledWith({
      addTimeSeries: {
        [eventType]: [
          { eventSymbol: '1', fromTime: fromTime1 },
          { eventSymbol: '2', fromTime: fromTime2 },
          { eventSymbol: '3', fromTime: fromTime2 },
          { eventSymbol: '4', fromTime: fromTime1 },
        ],
      },
    })

    expect(publishSecondTime).toBeCalledTimes(1)
    expect(publishSecondTime).toBeCalledWith({
      addTimeSeries: {
        [eventType]: [
          { eventSymbol: '2', fromTime: fromTime1 },
          { eventSymbol: '3', fromTime: fromTime1 },
        ],
      },
    })

    expect(publishThirdTime).toBeCalledTimes(1)
    expect(publishThirdTime).toBeCalledWith({
      removeTimeSeries: { [eventType]: symbolsSet1 },
    })
  })
})

describe('Feed - promises time series', () => {
  let instance: Feed

  beforeEach(() => {
    jest.useFakeTimers()
    instance = new Feed()
  })

  const newMockDataHead = (eventType: EventType): [EventType, string[]] => {
    return [eventType, ['eventSymbol', 'eventTime', 'eventFlags', 'index', 'time']]
  }
  const newMockDataBody = (
    eventSymbol: string,
    time: number,
    eventFlags: number,
    index: number
  ): (string | number)[] => {
    return [eventSymbol, 0, eventFlags, index, time]
  }

  describe('aggregation logic', () => {
    const ONE_DAY = 1000 * 60 * 60 * 24
    const TO_TIME = new Date().getTime()
    const FROM_TIME = TO_TIME - 7 * ONE_DAY

    const SYMBOL = 'AAPL'
    const EVENT_TYPE = EventType.Candle

    const pushData = (data: IncomingData) => {
      instance.endpoint.handlers?.onData?.(data, true)
    }

    test('should finish aggergation on snip flag', async () => {
      const promise = instance.getTimeSeries(SYMBOL, EVENT_TYPE, FROM_TIME, TO_TIME)

      pushData([
        newMockDataHead(EVENT_TYPE),
        [
          ...newMockDataBody(SYMBOL, TO_TIME - ONE_DAY, 0, 0),
          ...newMockDataBody(SYMBOL, TO_TIME - ONE_DAY * 2, SNAPSHOT_SNIP_FLAG, 1),
        ],
      ])

      const events = await promise
      expect(events).toStrictEqual([
        expect.objectContaining({ time: TO_TIME - ONE_DAY, index: 0 }),
        expect.objectContaining({ time: TO_TIME - ONE_DAY * 2, index: 1 }),
      ])
    })

    test('should finish aggergation after getting message with time === from', async () => {
      const promise = instance.getTimeSeries(SYMBOL, EVENT_TYPE, FROM_TIME, TO_TIME)

      pushData([
        newMockDataHead(EVENT_TYPE),
        [
          ...newMockDataBody(SYMBOL, TO_TIME - ONE_DAY, 0, 0),
          ...newMockDataBody(SYMBOL, FROM_TIME, 0, 1),
        ],
      ])

      const events = await promise
      expect(events).toStrictEqual([
        expect.objectContaining({ time: TO_TIME - ONE_DAY, index: 0 }),
        expect.objectContaining({ time: FROM_TIME, index: 1 }),
      ])
    })

    test('should return data sorted by index', async () => {
      const promise = instance.getTimeSeries(SYMBOL, EVENT_TYPE, FROM_TIME, TO_TIME)

      pushData([
        newMockDataHead(EVENT_TYPE),
        [
          ...newMockDataBody(SYMBOL, TO_TIME - ONE_DAY, 0, 2),
          ...newMockDataBody(SYMBOL, TO_TIME - ONE_DAY, 0, 1),
          ...newMockDataBody(SYMBOL, TO_TIME - 1, 0, 50),
          ...newMockDataBody(SYMBOL, TO_TIME - 2, 0, 10),
          ...newMockDataBody(SYMBOL, TO_TIME - 3, SNAPSHOT_SNIP_FLAG, 100),
        ],
      ])

      const events = await promise
      expect(events).toStrictEqual([
        expect.objectContaining({ time: TO_TIME - ONE_DAY, index: 1 }),
        expect.objectContaining({ time: TO_TIME - ONE_DAY, index: 2 }),
        expect.objectContaining({ time: TO_TIME - 2, index: 10 }),
        expect.objectContaining({ time: TO_TIME - 1, index: 50 }),
        expect.objectContaining({ time: TO_TIME - 3, index: 100 }),
      ])
    })

    test('aggregation should work until pending flag is false', async () => {
      const promise = instance.getTimeSeries(SYMBOL, EVENT_TYPE, FROM_TIME, TO_TIME)

      pushData([
        newMockDataHead(EVENT_TYPE),
        [
          ...newMockDataBody(SYMBOL, TO_TIME - ONE_DAY, 0, 0),
          ...newMockDataBody(SYMBOL, FROM_TIME, TX_PENDING_FLAG, 1),
          ...newMockDataBody(SYMBOL, TO_TIME - 1, TX_PENDING_FLAG, 2),
          ...newMockDataBody(SYMBOL, FROM_TIME, 0, 3),
        ],
      ])

      const events = await promise
      expect(events).toStrictEqual([
        expect.objectContaining({ time: TO_TIME - ONE_DAY, index: 0 }),
        expect.objectContaining({ time: FROM_TIME, index: 1 }),
        expect.objectContaining({ time: TO_TIME - 1, index: 2 }),
        expect.objectContaining({ time: FROM_TIME, index: 3 }),
      ])
    })

    test('events with delete flag should be removed from event list', async () => {
      const promise = instance.getTimeSeries(SYMBOL, EVENT_TYPE, FROM_TIME, TO_TIME)

      pushData([
        newMockDataHead(EVENT_TYPE),
        [
          ...newMockDataBody(SYMBOL, TO_TIME - ONE_DAY, 0, 0),
          ...newMockDataBody(SYMBOL, TO_TIME - ONE_DAY, REMOVE_EVENT_FLAG, 0),
          ...newMockDataBody(SYMBOL, TO_TIME - 2 * ONE_DAY, SNAPSHOT_SNIP_FLAG, 1),
        ],
      ])

      const events = await promise
      expect(events).toStrictEqual([
        expect.objectContaining({ time: TO_TIME - 2 * ONE_DAY, index: 1 }),
      ])
    })

    test('messages out of time range should be ignored', async () => {
      const promise = instance.getTimeSeries(SYMBOL, EVENT_TYPE, FROM_TIME, TO_TIME)

      pushData([
        newMockDataHead(EVENT_TYPE),
        [
          ...newMockDataBody(SYMBOL, TO_TIME - ONE_DAY, 0, 0),
          ...newMockDataBody(SYMBOL, FROM_TIME - 1, 0, 1),
          ...newMockDataBody(SYMBOL, FROM_TIME - 2, 0, 2),
          ...newMockDataBody(SYMBOL, TO_TIME - ONE_DAY - 1, 0, 3),
          ...newMockDataBody(SYMBOL, TO_TIME - ONE_DAY - 2, SNAPSHOT_SNIP_FLAG, 4),
        ],
      ])

      const events = await promise
      expect(events).toStrictEqual([
        expect.objectContaining({ time: TO_TIME - ONE_DAY, index: 0 }),
        expect.objectContaining({ time: TO_TIME - ONE_DAY - 1, index: 3 }),
        expect.objectContaining({ time: TO_TIME - ONE_DAY - 2, index: 4 }),
      ])
    })
  })

  describe('cleanup', () => {
    const setupExpectCleanup = () => {
      instance.endpoint.updateSubscriptions = jest.fn()

      return () => {
        expect(instance.endpoint.updateSubscriptions).toHaveBeenCalledWith(
          expect.objectContaining({
            removeTimeSeries: {
              [EventType.Candle]: ['AAPL'],
            },
          })
        )
      }
    }

    test('cleanup on abort should work', () => {
      const expectCleanup = setupExpectCleanup()

      const abortController = new AbortController()
      expect(
        instance.getTimeSeries(
          'AAPL',
          EventType.Candle,
          new Date().getTime(),
          new Date().getTime(),
          {
            signal: abortController.signal,
          }
        )
      ).rejects.toThrowError(AbortedError)

      abortController.abort()
      // let time to send unsub message
      jest.advanceTimersByTime(100)

      expectCleanup()
    })

    test('cleanup on timeout should work', () => {
      const expectCleanup = setupExpectCleanup()

      expect(
        instance.getTimeSeries('AAPL', EventType.Candle, new Date().getTime(), new Date().getTime())
      ).rejects.toThrowError(TimeoutError)

      jest.advanceTimersByTime(16_000)

      expectCleanup()
    })

    test('cleanup on aggergation finish should work', () => {
      const expectCleanup = setupExpectCleanup()

      expect(
        instance.getTimeSeries('AAPL', EventType.Candle, new Date().getTime(), new Date().getTime())
      ).resolves.not.toThrow()
      instance.endpoint.handlers?.onData?.(
        [
          newMockDataHead(EventType.Candle),
          newMockDataBody('AAPL', new Date().getTime(), SNAPSHOT_SNIP_FLAG, 0),
        ],
        true
      )

      // let aggregation finish
      jest.advanceTimersByTime(1000)

      expectCleanup()
    })
  })
})
