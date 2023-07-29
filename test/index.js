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
});
