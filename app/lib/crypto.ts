export function hex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}
export const randomToken = () =>
  hex(crypto.getRandomValues(new Uint8Array(32)));
export async function sha(value: string) {
  return hex(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}
export async function verifyPassword(password: string, encoded: string) {
  const [kind, rounds, salt, expected] = encoded.split("$");
  if (
    kind !== "pbkdf2-sha256" ||
    rounds !== "100000" ||
    !/^[0-9a-f]{32}$/.test(salt ?? "") ||
    !/^[0-9a-f]{64}$/.test(expected ?? "")
  )
    throw new Error("비밀번호 해시 설정이 올바르지 않습니다.");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bytes = Uint8Array.from(salt.match(/.{2}/g)!, (v) => parseInt(v, 16));
  const actual = hex(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: bytes, iterations: 100000, hash: "SHA-256" },
      key,
      256,
    ),
  );
  let diff = 0;
  for (let i = 0; i < expected.length; i++)
    diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
