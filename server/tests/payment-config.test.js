import test from "node:test";
import assert from "node:assert/strict";
import { paymentConfiguration } from "../routes/payments.js";

test("payments require explicit activation and complete safe collection details", () => {
  const keys = [
    "PAYMENT_ENABLED",
    "PAYMENT_HOLDER",
    "PAYMENT_BANK",
    "PAYMENT_ACCOUNT",
    "PAYMENT_QR_URL",
  ];
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  try {
    for (const key of keys) delete process.env[key];
    assert.deepEqual(paymentConfiguration(), { enabled: false, methods: [] });
    Object.assign(process.env, {
      PAYMENT_ENABLED: "true",
      PAYMENT_HOLDER: "ORBIT",
    });
    assert.equal(paymentConfiguration().enabled, false);
    for (const qr of [
      "javascript:alert(1)",
      "http://example.invalid/qr.png",
      "https://user:pass@example.invalid/qr.png",
      "uploads/x.svg",
      "img/../x.png",
    ]) {
      process.env.PAYMENT_QR_URL = qr;
      assert.equal(paymentConfiguration().enabled, false, qr);
    }
    process.env.PAYMENT_QR_URL = "img/qr.png";
    assert.deepEqual(paymentConfiguration().methods, ["qr"]);
    process.env.PAYMENT_BANK = "Banco de prueba";
    process.env.PAYMENT_ACCOUNT = "12345";
    assert.deepEqual(paymentConfiguration().methods, ["qr", "transferencia"]);
    process.env.PAYMENT_ENABLED = "false";
    assert.deepEqual(paymentConfiguration(), { enabled: false, methods: [] });
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
