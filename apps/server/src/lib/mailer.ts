import nodemailer from "nodemailer";
import { logger } from "./logger.js";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  sendMail(message: MailMessage): Promise<void>;
}

/**
 * Default mailer for dev/test environments. Logs the email instead of sending it so the
 * test suite (and local dev without SMTP configured) never makes an external network call.
 */
export class ConsoleMailer implements Mailer {
  async sendMail(message: MailMessage): Promise<void> {
    logger.info(
      { to: message.to, subject: message.subject, text: message.text },
      "[ConsoleMailer] email not sent (no SMTP configured) — logging instead",
    );
  }
}

/**
 * Real SMTP-backed mailer, used when SMTP_* env vars are present (see isSmtpMailerConfigured
 * below, following the same env-driven feature-selection pattern as config/features.ts).
 */
export class SmtpMailer implements Mailer {
  private readonly transporter: ReturnType<typeof nodemailer.createTransport>;
  private readonly from: string;

  constructor(config: { host: string; port: number; user?: string; pass?: string; from: string }) {
    this.from = config.from;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    });
  }

  async sendMail(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

export function isSmtpMailerConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.MAIL_FROM);
}

let cachedMailer: Mailer | null = null;

/**
 * Returns the process-wide mailer instance: SMTP-backed if SMTP_HOST/SMTP_PORT/MAIL_FROM are
 * set, otherwise a console logger (dev/test default — no external service required).
 */
export function getMailer(): Mailer {
  if (cachedMailer) return cachedMailer;

  if (isSmtpMailerConfigured()) {
    cachedMailer = new SmtpMailer({
      host: process.env.SMTP_HOST!,
      port: Number.parseInt(process.env.SMTP_PORT!, 10),
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from: process.env.MAIL_FROM!,
    });
  } else {
    cachedMailer = new ConsoleMailer();
  }

  return cachedMailer;
}

/** Test-only hook to reset the cached mailer singleton between test cases. */
export function __resetMailerForTests(): void {
  cachedMailer = null;
}
