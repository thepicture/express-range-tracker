const defaultStorage = {};

module.exports = (
  {
    max,
    storage,
    maxDelay,
    onDownloaded,
    onDeadlineReached,
    timestampFunction,
    bannedTraits = [],
    allowedTraits = [],
  } = {
    storage: defaultStorage,
  }
) =>
  function (req, res, next) {
    if (!req.headers.range) {
      return next();
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

      bannedTraits.forEach((trait) => {
        if (!previous) {
          return;
        }

        if (trait(previous, downloadLog)) {
          throw new RangeError("Banned trait match");
        }
      });

      allowedTraits.forEach((trait) => {
        if (!previous) {
          return;
        }

        if (!trait(previous, downloadLog)) {
          throw new RangeError("Allowed trait mismatch");
        }
      });

      storage[ip].push(downloadLog);
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
