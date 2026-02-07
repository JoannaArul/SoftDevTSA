const RAW = (import.meta.env.VITE_BACKEND_URL || "http://localhost:5174").replace(/\/$/, "");

export const BACKEND_HTTP = RAW;

export const BACKEND_WS = RAW.startsWith("https://")
  ? RAW.replace(/^https:/, "wss:")
  : RAW.startsWith("http://")
  ? RAW.replace(/^http:/, "ws:")
  : RAW;
