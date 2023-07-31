# @dxfeed/api [![Version](https://img.shields.io/npm/v/@dxfeed/api.svg?style=flat-square)](https://www.npmjs.com/package/@dxfeed/api)

This package provides access to [dxFeed](https://www.dxfeed.com/) streaming data.

Our package is easy to integrate with any modern framework.

## Install

```sh
npm install @dxfeed/api
```

## NodeJS usage

Install `cometd-nodejs-client` package

```sh
npm install cometd-nodejs-client
```

and use it in your code

```js
require('cometd-nodejs-client').adapt()
// or
import * as CometdNodejsClient from 'cometd-nodejs-client'
CometdNodejsClient.adapt()
```

## Basic Usage

We have several classes in implementation:

- Feed **_(public)_**
- Endpoint **_(private)_**
- Subscriptions **_(private)_**

The _Feed_ is entry point for configuration and creating subscriptions.
_Feed_ manages private classes for connecting and subscribing.
The _Endpoint_ is responsible for managing the web socket connection.
_Subscriptions_ for managing open subscriptions.

## Import package

```ts
import Feed from '@dxfeed/api'
```

## Configure & Create connection

Create instance of Feed.

```ts
const feed = new Feed()
```

Provide auth token if needed.

```ts
feed.setAuthToken('authToken')
```

Set web socket address and open connection.

```ts
feed.connect('wss://demo.dxfeed.com/webservice/cometd')
```

## Configure & Create subscription

You should specify event types and symbol names.

```ts
feed.subscribe<{ value: number }>(
  [EventType.Summary, EventType.Trade] /* event types */,
  ['AEX.IND:TEI'] /* symbols */,
  handleEvent
)
```

For timed subscription you should also provide time to start subscription from.

For Candle event type along with base symbol, you should specify an aggregation period. You can also set price type. More details: [https://kb.dxfeed.com/en/data-access/rest-api.html#candle-symbols](https://kb.dxfeed.com/en/data-access/rest-api.html#candle-symbols)

```ts
feed.subscribeTimeSeries<{ value: number }>(
  [EventType.Summary, EventType.Trade] /* event types */,
  ['AEX.IND:TEI'] /* symbols */,
  0 /* fromTime */,
  handleEvent
)
```

Last argument its event handler for process incoming events.

```ts
const handleEvent = (event) => {
  /* process event */
}
```

## Close subscription

All subscribe methods return unsubscribe handler, you need to call this method for unsubscribe.

```ts
const unsubscribe = feed.subscribe(eventTypes, symbols, handleEvent)

onExit(() => unsubscribe())
```

## Aggregated API

### Get TimeSeries

If you want to get TimeSeries events for a given time period, refer to example below.

```ts
// inside async function
const events = await feed.getTimeSeries(
  'AAPL{=15m}',
  EventType.Candle,
  fromDate.getTime(),
  toDate.getTime()
)
```

### Subscribe TimeSeries snapshot

If you want to subscribe to TimeSeries events, refer to example below.

```ts
const unsubscribe = feed.subscribeTimeSeriesSnapshot('AAPL{=15m}', EventType.Candle, (candles) => {
  // process candles
  chart.setCandles(candles)
})
```

## Close connection

If you need to close the web socket connection

```ts
feed.disconnect()
```
