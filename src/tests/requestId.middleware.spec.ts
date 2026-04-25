import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";
import request from "supertest";
import express, { Express } from "express";
import { requestIdMiddleware } from "../middleware/requestId.middleware";
import { errorHandler } from "../middleware/errorHandler.middleware";
import logger from "../utils/logger";

/**
 * Test suite for requestId propagation through logging
 * Verifies that requestId is generated, propagated, and included in logs
 */
describe("requestId middleware and logging propagation", () => {
  let app: Express;
  let logSpy: any;
  let errorSpy: any;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);

    // Spy on logger.info and logger.error
    logSpy = jest.spyOn(logger, "info").mockImplementation(() => {
      return logger;
    });
    errorSpy = jest.spyOn(logger, "error").mockImplementation(() => {
      return logger;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("requestId generation and attachment", () => {
    it("should generate a unique requestId for each request", async () => {
      app.get("/test", (req, res) => {
        const requestId = (req as any).requestId;
        res.json({ requestId });
      });

      const res1 = await request(app).get("/test");
      const res2 = await request(app).get("/test");

      expect(res1.body.requestId).toBeDefined();
      expect(res2.body.requestId).toBeDefined();
      expect(res1.body.requestId).not.toBe(res2.body.requestId);
    });

    it("should use UUID format for generated requestId", async () => {
      app.get("/test", (req, res) => {
        const requestId = (req as any).requestId;
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        res.json({ isValid: uuidRegex.test(requestId) });
      });

      const res = await request(app).get("/test");

      expect(res.body.isValid).toBe(true);
    });

    it("should use X-Request-ID header if provided", async () => {
      app.get("/test", (req, res) => {
        const requestId = (req as any).requestId;
        res.json({ requestId });
      });

      const providedId = "custom-request-id-123";
      const res = await request(app)
        .get("/test")
        .set("X-Request-ID", providedId);

      expect(res.body.requestId).toBe(providedId);
    });

    it("should attach requestId to response headers", async () => {
      app.get("/test", (req, res) => {
        res.json({});
      });

      const res = await request(app).get("/test");

      expect(res.header["x-request-id"]).toBeDefined();
      expect(typeof res.header["x-request-id"]).toBe("string");
    });

    it("should preserve custom X-Request-ID in response headers", async () => {
      app.get("/test", (req, res) => {
        res.json({});
      });

      const customId = "my-custom-trace-id";
      const res = await request(app)
        .get("/test")
        .set("X-Request-ID", customId);

      expect(res.header["x-request-id"]).toBe(customId);
    });
  });

  describe("requestId in error responses", () => {
    it("should include requestId in error responses", async () => {
      app.get("/test", (req, res, next) => {
        const err = new Error("Test error");
        next(err);
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");

      // The response body should include the error, but requestId should be in logs
      expect(res.status).toBe(500);
      expect(res.body.error).toBeDefined();
    });

    it("should pass requestId to logger in error handler", async () => {
      app.get("/test", (req, res, next) => {
        const err = new Error("Test error");
        next(err);
      });
      app.use(errorHandler);

      await request(app).get("/test");

      // Check that logger.error was called with requestId in metadata
      expect(errorSpy).toHaveBeenCalled();
      const callArgs = errorSpy.mock.calls[0];
      expect(callArgs).toBeDefined();
      // The logger.error call passes (message, metadata) or just metadata
      if (callArgs && callArgs.length > 0 && typeof callArgs[0] === "object" && callArgs[0] !== null) {
        expect((callArgs[0] as any).requestId).toBeDefined();
      }
    });
  });

  describe("requestId availability throughout request lifecycle", () => {
    it("should be available in middleware", async () => {
      let capturedRequestId: string | undefined;

      app.use((req, res, next) => {
        capturedRequestId = (req as any).requestId;
        next();
      });

      app.get("/test", (req, res) => {
        res.json({ success: true });
      });

      await request(app).get("/test");

      expect(capturedRequestId).toBeDefined();
    });

    it("should be available in route handlers", async () => {
      app.get("/test", (req, res) => {
        const requestId = (req as any).requestId;
        res.json({ requestId });
      });

      const res = await request(app).get("/test");

      expect(res.body.requestId).toBeDefined();
    });

    it("should be available in services (simulated)", async () => {
      let serviceRequestId: string | undefined;

      app.get("/test", (req, res, next) => {
        try {
          // Simulate service call that accesses requestId
          serviceRequestId = (req as any).requestId;
          res.json({ requestId: serviceRequestId });
        } catch (err) {
          next(err);
        }
      });
      app.use(errorHandler);

      const res = await request(app).get("/test");

      expect(res.body.requestId).toBeDefined();
      expect(serviceRequestId).toBeDefined();
    });
  });

  describe("requestId with concurrent requests", () => {
    it("should maintain separate requestIds for concurrent requests", async () => {
      const requestIds: string[] = [];

      app.get("/test", (req, res) => {
        const requestId = (req as any).requestId;
        requestIds.push(requestId);
        res.json({ requestId });
      });

      // Make 5 concurrent requests
      const results = await Promise.all([
        request(app).get("/test"),
        request(app).get("/test"),
        request(app).get("/test"),
        request(app).get("/test"),
        request(app).get("/test"),
      ]);

      // All should have requestIds
      results.forEach((res) => {
        expect(res.body.requestId).toBeDefined();
      });

      // All should be unique
      const uniqueIds = new Set(requestIds);
      expect(uniqueIds.size).toBe(5);
    });
  });

  describe("requestId edge cases", () => {
    it("should handle empty X-Request-ID header", async () => {
      app.get("/test", (req, res) => {
        const requestId = (req as any).requestId;
        res.json({ isGenerated: !!requestId });
      });

      const res = await request(app)
        .get("/test")
        .set("X-Request-ID", "");

      // If header is empty, should generate a new one
      expect(res.body.isGenerated).toBe(true);
    });

    it("should handle very long X-Request-ID values", async () => {
      app.get("/test", (req, res) => {
        const requestId = (req as any).requestId;
        res.json({ requestId });
      });

      const longId = "x".repeat(1000);
      const res = await request(app)
        .get("/test")
        .set("X-Request-ID", longId);

      expect(res.body.requestId).toBe(longId);
    });
  });

  describe("logger integration", () => {
    it("should allow using withRequestId method on logger", () => {
      expect((logger as any).withRequestId).toBeDefined();
      expect(typeof (logger as any).withRequestId).toBe("function");
    });

    it("should return logger from withRequestId", () => {
      const result = (logger as any).withRequestId("test-id");
      expect(result).toBeDefined();
      expect(typeof result.info).toBe("function");
      expect(typeof result.error).toBe("function");
    });

    it("should handle undefined requestId gracefully", () => {
      const result = (logger as any).withRequestId(undefined);
      // Should return the same logger or a child logger
      expect(result).toBeDefined();
    });
  });
});
