import { fail } from "../core.js";

// multer.memoryStorage buffers a complete file. Bound simultaneous buffers
// before consuming multipart bodies, including concurrent requests from one user.
export function createUploadAdmission({
  maxConcurrent = 2,
  maxPerUser = 1,
} = {}) {
  let active = 0;
  const users = new Map();
  return (userId) => {
    const count = users.get(userId) || 0;
    if (active >= maxConcurrent || count >= maxPerUser)
      fail(
        429,
        "Hay una carga de archivos en curso. Espera a que termine e inténtalo de nuevo.",
      );
    active++;
    users.set(userId, count + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active--;
      const remaining = (users.get(userId) || 1) - 1;
      if (remaining) users.set(userId, remaining);
      else users.delete(userId);
    };
  };
}
