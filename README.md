# express-range-tracker

Detects semantically correct usage of the `range` header by firing the `onDownloaded` event when all chunks related to the current ip are downloaded

# Usage

```js
const express = require("express");
const rangeTracker = require("express-range-tracker");

express()
  .use(
    rangeTracker({
      timestampFunction: Date.now,
      onDownloaded: (req, res, next) => {
        /* ... */
      },
    })
  )
  .listen(3000);
```

`timestampFunction` - Calculates datetime of range chunk request

`storage` - an `Object` that supports indexing, associative array. `{}` by default

`onDownloaded` - event that behaves as middleware

`onDeadlineReached` - event that fires when `maxDelay` exceeds timestamp window between the last and the new timestamps

`allowedTraits` - array of functions that determine whitelist of range header behavior. `true` if match, `false` otherwise

```js
interface Trait {
  from: number;
  to: number;
  timestamp: number;
}
```

```js
(previous: Trait, current: Trait) => boolean;
```

`bannedTraits` - array of functions that determine blacklist of range header behavior. `true` if match, `false` otherwise

```js
(previous: Trait, current: Trait) => boolean;
```

`onSimilarTrait` - fires when another ips had the same range behavior as the current ip. The current ip will not be in the list

```js
const track = rangeTracker({
  storage,
  onSimilarTrait: (ips) => {
    console.log(ips.length);
  },
});
```

`onRobotic` - fires when range is malformed in some way:

- `malformed` - does not conform to range spec
- `digits` - `from` is bigger than `to` in range segment
- `empty` - range header is present but length of string is 0
- `absent` - request of content that should have range header but does not exist

```js
onRobotic(req, reason);
```

`onSimilarTimestamp` - function that fires on clients with same range request timestamp windows

```js
onSimilarTimestamp(req, ips);
```

`onRangeOverflow` - fires with either `parts` or `overflow` reason when segment count is larger than `maxParts` or `max` value is smaller than the biggest part of any segment, respectively

```js
const track = rangeTracker({
  storage,
  maxParts: 3,
  max: 50
  onRangeOverflow: (req, reason) => {
    console.log(reason);
  },
});
```

# Test

```bash
npm test
```
