const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O, 1/I/L

function randomInts(n: number, max: number): number[] {
  const buf = new Uint32Array(n);
  globalThis.crypto.getRandomValues(buf);
  return [...buf].map((x) => x % max);
}

/** Six characters, easy to read aloud and type on a phone. */
export function roomCode(): string {
  return randomInts(6, CODE_ALPHABET.length).map((i) => CODE_ALPHABET[i]).join("");
}

export function isRoomCode(s: string): boolean {
  return /^[2-9A-HJKMNP-Z]{6}$/.test(s);
}

export function normalizeCode(s: string): string {
  return s.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 6);
}

export function eventId(): string {
  return `${Date.now().toString(36)}-${randomInts(2, 2 ** 31).map((x) => x.toString(36)).join("")}`;
}

export function userId(): string {
  return `u-${randomInts(3, 2 ** 31).map((x) => x.toString(36)).join("")}`;
}

export function groupIdFor(code: string): string {
  return `floor-${code}`;
}
