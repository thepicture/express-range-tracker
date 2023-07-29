const assert = require("node:assert");
const { describe, it, beforeEach } = require("node:test");

const rangeTracker = require("../index");
const express = require("express");
const request = require("supertest");

describe("express-range-tracker", () => {
  let app;

  beforeEach(() => {
    app = express();
  });

  it("should track requested chunk", (done) => {
    const app = express();

    app.use(function (req, res) {
      res.on("pipe", console.log);
      res.json(req.range(120));
    });

    request(app)
      .get("/")
      .set("Range", "bytes=0-50,51-100")
      .expect(
        200,
        [
          { start: 0, end: 50 },
          { start: 51, end: 100 },
        ],
        done
      );
  });
});
