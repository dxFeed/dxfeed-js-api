import { parseEventFlags } from './event-flags'
import { ITimeSeriesEvent } from './interfaces'

// AggregationEvent
type AggregationEvent<TEvent extends ITimeSeriesEvent> = TEvent & {
  time: number
  /**
   * unique event identifier
   */
  index: number
  eventFlags: number
}

const isAggregationEvent = <TEvent extends ITimeSeriesEvent>(
  event: TEvent
): event is AggregationEvent<TEvent> =>
  typeof event.time === 'number' &&
  typeof event.index === 'number' &&
  typeof event.eventFlags === 'number'

// TimeSeriesAggregationResult
export interface ContinueTimeSeriesAggregationResult {
  kind: 'Continue'
}

export interface FinishedTimeSeriesAggregationResult<TEvent extends ITimeSeriesEvent> {
  kind: 'Finished'
  events: TEvent[]
}

export type TimeSeriesAggregationResult<TEvent extends ITimeSeriesEvent> =
  | ContinueTimeSeriesAggregationResult
  | FinishedTimeSeriesAggregationResult<TEvent>

export const isFinishedTimeSeriesAggregationResult = <TEvent extends ITimeSeriesEvent>(
  result: TimeSeriesAggregationResult<TEvent>
): result is FinishedTimeSeriesAggregationResult<TEvent> => result.kind === 'Finished'

// TimeSeriesAggregator
export interface TimeSeriesAggregator<TEvent extends ITimeSeriesEvent> {
  newEvent: (event: TEvent) => TimeSeriesAggregationResult<TEvent>
}

export const newTimeSeriesAggregator = <TEvent extends ITimeSeriesEvent>(
  fromTime: number,
  toTime: number
) => {
  let complete = false
  let txPending = false
  const events: Record<number, AggregationEvent<TEvent>> = {}

  const isDone = () => complete && !txPending

  const updateEvents = (event: AggregationEvent<TEvent>, remove: boolean) => {
    if (remove) {
      delete events[event.index]
    } else {
      events[event.index] = event
    }
  }

  const processEvent = (event: TEvent) => {
    if (!isAggregationEvent(event)) {
      return
    }

    const time = event.time
    const flags = parseEventFlags(event.eventFlags)
    txPending = flags.txPending

    if (time >= fromTime && time <= toTime) {
      const remove = flags.shouldBeRemoved
      event.eventFlags = 0
      updateEvents(event, remove)
    }
    if (time <= fromTime || flags.snapshotSnip) complete = true
  }

  const newEvent = (event: TEvent): TimeSeriesAggregationResult<TEvent> => {
    processEvent(event)
    return isDone()
      ? { kind: 'Finished', events: Object.values(events).sort((a, b) => a.index - b.index) }
      : { kind: 'Continue' }
  }

  return {
    newEvent,
  }
}
