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

  it("should emit downloaded event when all parts downloaded", (done) => {
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

    const track = rangeTracker({
      timestampFunction: () => 1,
      storage,
      onDownloaded: (req, res, next) => {
        assert.deepStrictEqual(req, expected);
        assert.ok(res);
        assert.ok(next);

        done();
      },
      max: 100,
    });

    track(req1, res, next);
    track(req2, res, next);
  });

  it("should emit deadline event when chunk requested slowly", (done) => {
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

        done();
      },
      max: 100,
      maxDelay: 1,
    });

    track(req1, res, next);
    track(req2, res, next);
  });

  it("should not emit deadline event when chunk requested commonly", () => {
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
});
