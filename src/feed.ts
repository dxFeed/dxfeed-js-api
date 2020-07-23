import { Endpoint } from './endpoint'
import { EventType, IEvent, ITimeSeriesEvent } from './interfaces'
import { Subscriptions } from './subscriptions'

class Feed {
  endpoint: Endpoint
  subscriptions: Subscriptions

  constructor() {
    this.endpoint = new Endpoint()
    this.subscriptions = new Subscriptions(this.endpoint)
  }

  setAuthToken = (token: string) => {
    this.endpoint.setAuthToken(token)
  }

  connect = (url: string) => {
    this.endpoint.connect({ url })
  }

  disconnect = () => {
    this.endpoint.disconnect()
  }

  subscribe = <TEvent extends IEvent>(
    eventTypes: EventType[],
    eventSymbols: string[],
    onChange: (event: TEvent) => void
  ) => this.subscriptions.subscribe(eventTypes, eventSymbols, onChange)

  subscribeTimeSeries = <TEvent extends ITimeSeriesEvent>(
    eventTypes: EventType[],
    eventSymbols: string[],
    fromTime: number,
    onChange: (event: TEvent) => void
  ) => this.subscriptions.subscribeTimeSeries(eventTypes, eventSymbols, fromTime, onChange)
}

export default Feed
