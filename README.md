# @dxfeed/api [![Version](https://img.shields.io/npm/v/@dxfeed/api.svg?style=flat-square)](https://www.npmjs.com/package/@dxfeed/api)
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FdxFeed%2Fdxfeed-js-api.svg?type=shield)](https://app.fossa.com/projects/git%2Bgithub.com%2FdxFeed%2Fdxfeed-js-api?ref=badge_shield)

This package provides access to [dxFeed](https://www.dxfeed.com/) streaming data.

Our package is easy to integrate with any modern framework.

## Install

```sh
yarn add @dxfeed/api
```

## Basic Usage

We have several classes in implementation:
 - Feed ***(public)***
 - Endpoint ***(private)***
 - Subscriptions ***(private)***

The *Feed* is entry point for configuration and creating subscriptions.
*Feed* manages private classes for connecting and subscribing.
The *Endpoint* is responsible for managing the web socket connection.
*Subscriptions* for managing open subscriptions.


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
feed.connect('wss://tools.dxfeed.com/webservice/cometd')
```

## Configure & Create subscription
You should specify event types and symbol names.
```ts
feed.subscribe<{ value: number }>(
    [EventType.Summary, EventType.Trade], /* event types */
    ['AEX.IND:TEI'], /* symbols */
    handleEvent
)
```

For timed subscription you should also provide time to start subscription from.

For Candle event type along with base symbol, you should specify an aggregation period. You can also set price type. More details: https://kb.dxfeed.com/display/DS/REST+API#RESTAPI-Candlesymbols.
```ts
feed.subscribeTimeSeries<{ value: number }>(
    [EventType.Summary, EventType.Trade], /* event types */
    ['AEX.IND:TEI'], /* symbols */
    0, /* fromTime */
    handleEvent
)
```

Last argument its event handler for process incoming events.
```ts
const handleEvent = event => {
    /* process event */
}
```

## Close subscription
All subscribe methods return unsubscribe handler, you need to call this method for unsubscribe.
```ts
const unsubscribe = feed.subscribe(eventTypes, symbols, handleEvent)

onExit(() => unsubscribe())
```

## Close connection
If you need to close the web socket connection
```ts
feed.disconnect()
```


## License
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FdxFeed%2Fdxfeed-js-api.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2FdxFeed%2Fdxfeed-js-api?ref=badge_large)