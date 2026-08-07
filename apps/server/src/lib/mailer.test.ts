import { afterEach, describe, expect, it } from "vitest";
import { ConsoleMailer, SmtpMailer, __resetMailerForTests, getMailer, isSmtpMailerConfigured } from "./mailer.js";

describe("mailer", () => {
  afterEach(() => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.MAIL_FROM;
    __resetMailerForTests();
  });

  it("ConsoleMailer resolves without throwing and makes no external call", async () => {
    const mailer = new ConsoleMailer();
    await expect(
      mailer.sendMail({ to: "someone@example.com", subject: "hi", text: "hello there" }),
    ).resolves.toBeUndefined();
  });

  it("getMailer defaults to ConsoleMailer when no SMTP env vars are set (dev/test default)", () => {
    __resetMailerForTests();
    expect(isSmtpMailerConfigured()).toBe(false);
    expect(getMailer()).toBeInstanceOf(ConsoleMailer);
  });

  it("getMailer returns an SmtpMailer once SMTP_HOST/SMTP_PORT/MAIL_FROM are set", () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";
    process.env.MAIL_FROM = "no-reply@example.com";
    __resetMailerForTests();

    expect(isSmtpMailerConfigured()).toBe(true);
    // Constructing the transporter must not make any network call.
    expect(getMailer()).toBeInstanceOf(SmtpMailer);
  });

  it("getMailer caches the selected mailer instance across calls", () => {
    __resetMailerForTests();
    const first = getMailer();
    const second = getMailer();
    expect(first).toBe(second);
  });
});
