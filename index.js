const defaultStorage = {};

module.exports = (
  {
    max,
    storage,
    maxDelay,
    onRobotic,
    onDownloaded,
    onSimilarTrait,
    onDeadlineReached,
    timestampFunction,
    bannedTraits = [],
    allowedTraits = [],
  } = {
    storage: defaultStorage,
  }
) =>
  function (req, res, next) {
    if (typeof req.headers.range === "undefined") {
      if (typeof onRobotic === "function") {
        onRobotic(req, "absent");
      }

      return next();
    }

    if (!req.headers.range.length && typeof onRobotic === "function") {
      onRobotic(req, "empty");
    }

    const ranges = req.headers.range
      .replace("bytes=", "")
      .split(",")
      .map((range) => range.split("-"));

    if (!storage) {
      storage = defaultStorage;
    }

    const { ip } = req;

    const timestampFunc = timestampFunction ?? Date.now;

    for (const [from, to] of ranges) {
      const downloadLog = {
        timestamp: timestampFunc(),
        from: Number.parseInt(from),
        to: to ? Number.parseInt(to) : Infinity,
      };

      if (typeof onRobotic === "function") {
        if (!/^bytes=\d+-\d*(,\d+-\d*)*$/g.test(req.headers.range)) {
          onRobotic(req, "malformed");
        }

        if (from > to) {
          onRobotic(req, "digits");
        }
      }

      if (!storage[ip]) {
        storage[ip] = [];
      }

      if (onDeadlineReached) {
        const isDeadlineReached =
          maxDelay &&
          downloadLog.timestamp -
            Object.values(storage).at(-1)?.[0]?.timestamp >
            maxDelay;
        if (isDeadlineReached) {
          onDeadlineReached(req, res, next);
        }
      }

      const previous = storage[ip].at(-1);

      bannedTraits.forEach((traitMatches) => {
        if (!previous) {
          return;
        }

        if (traitMatches(previous, downloadLog)) {
          throw new RangeError("Banned trait match");
        }
      });

      allowedTraits.forEach((traitMatches) => {
        if (!previous) {
          return;
        }

        if (!traitMatches(previous, downloadLog)) {
          throw new RangeError("Allowed trait mismatch");
        }
      });

      storage[ip].push(downloadLog);
    }

    if (typeof onSimilarTrait === "function") {
      const reducer = (acc, { from, to }) => (acc += `${from},${to};`);

      const currentIpHash = storage[ip].reduce(reducer, "");

      const matchingIps = Object.keys(storage).reduce((acc, key) => {
        if (key === ip) {
          return acc;
        }

        const hash = storage[key].reduce(reducer, "");

        if (hash === currentIpHash) {
          acc.push(key);
        }

        return acc;
      }, []);

      if (matchingIps.length) {
        onSimilarTrait(matchingIps);
      }
    }

    req.chunks = storage[ip];

    if (!onDownloaded || !max) {
      return;
    }

    const clonedRanges = req.chunks.map((entry) =>
      JSON.parse(JSON.stringify(entry))
    );

    for (let i = 1; i < clonedRanges.length; i++) {
      if (clonedRanges[i - 1].to !== clonedRanges[i].from - 1) {
        return;
      }
    }

    if (clonedRanges.at(-1)?.to !== max) {
      return;
    }

    onDownloaded(req, res, next);
  };
