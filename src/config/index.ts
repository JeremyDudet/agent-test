export const DEFAULT_TIMEZONE = "America/Los_Angeles";

export const config = {
  timezone: process.env.TIMEZONE || DEFAULT_TIMEZONE,
};
