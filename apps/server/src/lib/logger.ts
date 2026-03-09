import pino from "pino";
import { loadEnv } from "../config/env.js";

const { LOG_LEVEL } = loadEnv();

export const logger = pino({
  level: LOG_LEVEL,
  base: undefined,
});
