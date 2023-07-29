const defaultStorage = {};

module.exports =
  ({ storage, timestampFunction } = { storage: defaultStorage }) =>
  (req, _, next) => {
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

    for (const [from, to] of ranges) {
      const downloadLog = {
        timestamp: timestampFunction?.() ?? Date.now(),
        from: Number.parseInt(from),
        to: to ? Number.parseInt(to) : Infinity,
      };

      if (!storage[ip]) {
        storage[ip] = [];
      }

      storage[ip].push(downloadLog);
    }

    req.chunks = storage[ip];
  };
