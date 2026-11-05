export function chromiumLaunchOptions() {
  const executablePath =
    process.env.CHROME_PATH ||
    (process.platform === "win32"
      ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
      : undefined);
  return { headless: true, ...(executablePath ? { executablePath } : {}) };
}
