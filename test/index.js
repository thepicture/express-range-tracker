const assert = require("node:assert");
const { describe, it } = require("node:test");

const rangeTracker = require("..");

describe("express-range-tracker", () => {
  const res = {};
  const next = () => {};

  it("should track requested chunk", () => {
    const expected = [
      {
        timestamp: 0,
        from: 0,
        to: 50,
      },
      {
        timestamp: 1,
        from: 51,
        to: 100,
      },
    ];
    const req1 = {
      ip: "::1",
      headers: {
        range: "bytes=0-50",
      },
    };
    const req2 = {
      ip: "::1",
      headers: {
        range: "bytes=51-100",
      },
    };

    rangeTracker({
      timestampFunction: () => 0,
    })(req1, res, next);
    rangeTracker({
      timestampFunction: () => 1,
    })(req2, res, next);
    const { chunks: actual } = req1;

    assert.deepEqual(expected, actual);
  });

  it("should handle ranges: 0- correctly", () => {
    const expected = [
      {
        timestamp: 0,
        from: 0,
        to: Infinity,
      },
    ];
    const storage = {};
    const req = {
      ip: "::1",
      headers: {
        range: "bytes=0-",
      },
    };

    rangeTracker({
      timestampFunction: () => 0,
      storage,
    })(req, res, next);
    const { chunks: actual } = req;

    assert.deepEqual(expected, actual);
  });

  it("should allow to use custom storage", () => {
    const expected = {
      "::1": [
        {
          timestamp: 0,
          from: 0,
          to: Infinity,
        },
      ],
    };
    const storage = {};
    const req = {
      ip: "::1",
      headers: {
        range: "bytes=0-",
      },
    };

    rangeTracker({
      timestampFunction: () => 0,
      storage,
    })(req, res, next);
    const actual = storage;

    assert.deepEqual(expected, actual);
  });

  it("should parse multipart ranges", () => {
    const expected = [
      {
        timestamp: 0,
        from: 0,
        to: 50,
      },
      {
        timestamp: 0,
        from: 51,
        to: 100,
      },
    ];
    const storage = {};
    const req = {
      ip: "::1",
      headers: {
        range: "bytes=0-50,51-100",
      },
    };

    rangeTracker({
      timestampFunction: () => 0,
      storage,
    })(req, res, next);
    const { chunks: actual } = req;

    assert.deepEqual(expected, actual);
  });

  it("should ignore space in multipart ranges", () => {
    const expected = [
      {
        timestamp: 0,
        from: 0,
        to: 50,
      },
      {
        timestamp: 0,
        from: 51,
        to: 100,
      },
    ];
    const storage = {};
    const req = {
      ip: "::1",
      headers: {
        range: "bytes=0-50, 51-100",
      },
    };

    rangeTracker({
      timestampFunction: () => 0,
      storage,
    })(req, res, next);
    const { chunks: actual } = req;

    assert.deepEqual(expected, actual);
  });

  it("should emit downloaded event when all parts downloaded", async () => {
    const expected = {
      ip: "::1",
      headers: {
        range: "bytes=51-100",
      },
      chunks: [
        {
          timestamp: 1,
          from: 0,
          to: 50,
        },
        {
          timestamp: 1,
          from: 51,
          to: 100,
        },
      ],
    };
    const storage = {};

    const req1 = {
      ip: "::1",
      headers: {
        range: "bytes=0-50",
      },
    };
    const req2 = {
      ip: "::1",
      headers: {
        range: "bytes=51-100",
      },
    };

    await new Promise((resolve) => {
      const track = rangeTracker({
        timestampFunction: () => 1,
        storage,
        onDownloaded: (req, res, next) => {
          assert.deepStrictEqual(req, expected);
          assert.ok(res);
          assert.ok(next);

          resolve();
        },
        max: 100,
      });

      track(req1, res, next);
      track(req2, res, next);
    });
  });

  it("should emit deadline event when chunk requested slowly", async () => {
    const expected = {
      ip: "::1",
      headers: {
        range: "bytes=51-100",
      },
    };
    const storage = {};

    const req1 = {
      ip: "::1",
      headers: {
        range: "bytes=0-50",
      },
    };
    const req2 = {
      ip: "::1",
      headers: {
        range: "bytes=51-100",
      },
    };
    let timestamp = 0;

    await new Promise((resolve) => {
      const track = rangeTracker({
        timestampFunction: () => {
          const current = timestamp;

          timestamp += 2;

          return current;
        },
        storage,
        onDeadlineReached: (req, res, next) => {
          assert.deepStrictEqual(req, expected);
          assert.ok(res);
          assert.ok(next);

          resolve();
        },
        max: 100,
        maxDelay: 1,
      });

      track(req1, res, next);
      track(req2, res, next);
    });
  });

  it("should not emit deadline event when chunk requested commonly", () => {
    const storage = {};

    const req1 = {
      ip: "::1",
      headers: {
        range: "bytes=0-50",
      },
    };
    const req2 = {
      ip: "::1",
      headers: {
        range: "bytes=51-100",
      },
    };
    let timestamp = 0;

    const track = rangeTracker({
      timestampFunction: () => {
        const current = timestamp;

        timestamp += 1;

        return current;
      },
      storage,
      onDeadlineReached: () => {
        assert.fail();
      },
      max: 100,
      maxDelay: 1,
    });

    track(req1, res, next);
    track(req2, res, next);
  });

  it("should throw on banned trait", () => {
    const storage = {};

    const req1 = {
      ip: "::1",
      headers: {
        range: "bytes=2-50",
      },
    };
    const req2 = {
      ip: "::1",
      headers: {
        range: "bytes=2-100",
      },
    };

    const track = rangeTracker({
      storage,
      bannedTraits: [(previous, current) => current.from - previous.from === 0],
      max: 100,
      maxDelay: 1,
    });

    track(req1, res, next);
    assert.throws(() => track(req2, res, next));
  });

  it("should not throw on conforming to allowed trait", () => {
    const storage = {};

    const req1 = {
      ip: "::1",
      headers: {
        range: "bytes=2-50",
      },
    };
    const req2 = {
      ip: "::1",
      headers: {
        range: "bytes=3-100",
      },
    };

    const track = rangeTracker({
      storage,
      allowedTraits: [
        (previous, current) => current.from - previous.from === 1,
      ],
      max: 100,
      maxDelay: 1,
    });

    track(req1, res, next);
    assert.doesNotThrow(() => track(req2, res, next));
  });

  it("should throw on not conforming to allowed trait", () => {
    const storage = {};

    const req1 = {
      ip: "::1",
      headers: {
        range: "bytes=2-50",
      },
    };
    const req2 = {
      ip: "::1",
      headers: {
        range: "bytes=2-100",
      },
    };

    const track = rangeTracker({
      storage,
      allowedTraits: [
        (previous, current) => current.from - previous.from !== 0,
      ],
      max: 100,
      maxDelay: 1,
    });

    track(req1, res, next);
    assert.throws(() => track(req2, res, next));
  });

  it("should fire similar trait event on similar trait", async () => {
    const storage = {};

    const req1 = {
      ip: "::1",
      headers: {
        range: "bytes=2-50",
      },
    };
    const req2 = {
      ip: "::1",
      headers: {
        range: "bytes=2-100",
      },
    };
    const req3 = {
      ip: "::2",
      headers: {
        range: "bytes=2-50",
      },
    };
    const req4 = {
      ip: "::2",
      headers: {
        range: "bytes=2-100",
      },
    };

    await new Promise((resolve) => {
      const track = rangeTracker({
        storage,
        onSimilarTrait: (ips) => {
          assert.ok(ips.length === 1);
          assert.ok(ips[0] === req1.ip);

          resolve();
        },
      });

      track(req1, res, next);
      track(req2, res, next);
      track(req3, res, next);
      track(req4, res, next);
    });
  });

  it("should not fire similar trait event on not similar trait", async () => {
    const storage = {};

    const req1 = {
      ip: "::1",
      headers: {
        range: "bytes=2-50",
      },
    };
    const req2 = {
      ip: "::1",
      headers: {
        range: "bytes=2-100",
      },
    };
    const req3 = {
      ip: "::2",
      headers: {
        range: "bytes=2-50",
      },
    };
    const req4 = {
      ip: "::2",
      headers: {
        range: "bytes=2-101",
      },
    };

    await new Promise((resolve, reject) => {
      const track = rangeTracker({
        storage,
        onSimilarTrait: () => {
          reject(assert.fail());
        },
      });

      track(req1, res, next);
      track(req2, res, next);
      track(req3, res, next);
      track(req4, res, next);

      resolve();
    });
  });

  it("should fire onrobotic event on malformed range", async () => {
    const expected = "malformed";
    const storage = {};

    const req = {
      ip: "::1",
      headers: {
        range: "btes=2-50",
      },
    };

    await new Promise((resolve) => {
      const track = rangeTracker({
        storage,
        onRobotic: (badReq, reason) => {
          assert.strictEqual(reason, expected);
          assert.deepStrictEqual(badReq, req);

          resolve();
        },
      });

      track(req, res, next);
    });
  });

  it("should fire onrobotic digits event on wrong range from and to numbers", async () => {
    const expected = "digits";
    const storage = {};

    const req = {
      ip: "::1",
      headers: {
        range: "bytes=50-2",
      },
    };

    await new Promise((resolve) => {
      const track = rangeTracker({
        storage,
        onRobotic: (badReq, reason) => {
          assert.strictEqual(reason, expected);
          assert.deepStrictEqual(badReq, req);

          resolve();
        },
      });

      track(req, res, next);
    });
  });

  it("should fire onrobotic empty event on empty range", async () => {
    const expected = "empty";
    const storage = {};

    const req = {
      ip: "::1",
      headers: {
        range: "",
      },
    };

    await new Promise((resolve) => {
      const track = rangeTracker({
        storage,
        onRobotic: (badReq, reason) => {
          assert.strictEqual(reason, expected);
          assert.deepStrictEqual(badReq, req);

          resolve();
        },
      });

      track(req, res, next);
    });
  });

  it("should fire onrobotic absent event on no range", async () => {
    const expected = "absent";
    const storage = {};

    const req = {
      ip: "::1",
      headers: {},
    };

    await new Promise((resolve) => {
      const track = rangeTracker({
        storage,
        onRobotic: (badReq, reason) => {
          assert.strictEqual(reason, expected);
          assert.deepStrictEqual(badReq, req);

          resolve();
        },
      });

      track(req, res, next);
    });
  });

  it("should fire similar timestamp event when requests have similar timestamp windows", async () => {
    const storage = {};

    const req1 = {
      ip: "::1",
      headers: {
        range: "bytes=2-50",
      },
    };
    const req2 = {
      ip: "::1",
      headers: {
        range: "bytes=2-100",
      },
    };
    const req3 = {
      ip: "::2",
      headers: {
        range: "bytes=2-50",
      },
    };
    const req4 = {
      ip: "::2",
      headers: {
        range: "bytes=2-101",
      },
    };
    const timestamps = [1, 4, 5, 8];

    await new Promise((resolve) => {
      const track = rangeTracker({
        storage,
        timestampFunction: () => timestamps.shift(),
        onSimilarTimestamp: (_, [ip]) => {
          assert.strictEqual(ip, req1.ip);

          resolve();
        },
      });

      track(req1, res, next);
      track(req2, res, next);
      track(req3, res, next);
      track(req4, res, next);
    });
  });

  it("should not fire similar timestamp event when requests do not have similar timestamp windows", async () => {
    const storage = {};

    const req1 = {
      ip: "::1",
      headers: {
        range: "bytes=2-50",
      },
    };
    const req2 = {
      ip: "::1",
      headers: {
        range: "bytes=2-100",
      },
    };
    const req3 = {
      ip: "::2",
      headers: {
        range: "bytes=2-50",
      },
    };
    const req4 = {
      ip: "::2",
      headers: {
        range: "bytes=2-101",
      },
    };
    const timestamps = [1, 4, 5, 9];

    await new Promise((resolve) => {
      const track = rangeTracker({
        storage,
        timestampFunction: () => timestamps.shift(),
        onSimilarTimestamp: () => {
          assert.fail();
        },
      });

      track(req1, res, next);
      track(req2, res, next);
      track(req3, res, next);
      track(req4, res, next);

      resolve();
    });
  });
});
