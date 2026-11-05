import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { insert, hashPassword, pool, validate, email, text } from "../core.js";
// Password is supplied through an environment variable, never as a shell argument.
const input = createInterface({ input: stdin, output: stdout });
try {
  const address = await input.question("Correo del administrador: "),
    nombre = await input.question("Nombre: "),
    apellido = await input.question("Apellido: ");
  const data = validate(
    { email, nombre: text(80, true), apellido: text(80, true) },
    { email: address, nombre, apellido },
  );
  const password_hash = await hashPassword(process.env.ORBIT_ADMIN_PASSWORD);
  await insert("usuarios", { ...data, password_hash, rol: "admin", activo: 1 });
  console.log("Administrador creado. Borra ORBIT_ADMIN_PASSWORD de la sesión.");
} finally {
  input.close();
  await pool.end();
}
