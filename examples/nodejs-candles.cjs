/**
 * This example demonstrates how to subscribe to a snapshot of time series in Node.js.
 */
const { Feed, EventType } = require('@dxfeed/api')

// We are using `cometd` library to connect to the feed, so we need to adapt it to work in Node.js.
require('cometd-nodejs-client').adapt()

const feed = new Feed()
// Connect to the demo dxFeed feed
// Demo feed is a limited version of dxFeed Feed API, which provides delayed market data
feed.connect('wss://demo.dxfeed.com/webservice/cometd')

// Subscribe to a snapshot Candles
feed.subscribeTimeSeriesSnapshot(
  'EUR/USD:AFX{=d,mm=CFH2,price=mark}', // subscription symbol
  EventType.Candle, // subscription event type
  new Date('2023-07-25T14:00:00').getTime(), // subscription fromTime
  (snapshot) => {
    console.log('Candles', snapshot)
    // process snapshot, for example chart.setCandles(snapshot)
  }
)
