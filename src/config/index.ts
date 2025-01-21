export const DEFAULT_TIMEZONE = "America/Los_Angeles";

export const config = {
  timeZone: process.env.TIMEZONE || DEFAULT_TIMEZONE,
};
