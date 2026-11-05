import session from "express-session";
import { query, one } from "./core.js";
export class SQLSessionStore extends session.Store {
  get(sid, cb) {
    one("SELECT data FROM orbit_sessions WHERE sid=? AND expires_at>NOW()", [
      sid,
    ]).then((r) => {
      let data;
      try {
        data = r ? JSON.parse(r.data) : null;
      } catch {
        return cb(new Error("Invalid stored session"));
      }
      cb(null, data);
    }, cb);
  }
  set(sid, data, cb) {
    query(
      "INSERT INTO orbit_sessions(sid,data,expires_at,user_id) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data),expires_at=VALUES(expires_at),user_id=VALUES(user_id)",
      [
        sid,
        JSON.stringify(data),
        new Date(data.cookie.expires || Date.now() + 8 * 3600000),
        data.uid || null,
      ],
    ).then(() => cb?.(), cb);
  }
  destroy(sid, cb) {
    query("DELETE FROM orbit_sessions WHERE sid=?", [sid]).then(
      () => cb?.(),
      cb,
    );
  }
  touch(sid, data, cb) {
    query("UPDATE orbit_sessions SET expires_at=? WHERE sid=?", [
      new Date(data.cookie.expires || Date.now() + 8 * 3600000),
      sid,
    ]).then(() => cb?.(), cb);
  }
}
