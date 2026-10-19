import type { Logger } from "../application/ports.js";

function timestamp(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

export function createConsoleLogger(): Logger {
  return {
    info: (message) => console.log(`${timestamp()} [info] ${message}`),
    error: (message, error) => console.error(`${timestamp()} [erro] ${message}`, error),
  };
}
