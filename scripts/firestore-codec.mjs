import admin from "firebase-admin";

const { Timestamp, GeoPoint, FieldValue } = admin.firestore;

/**
 * Firestore holds types that plain JSON cannot express (Timestamp, GeoPoint,
 * DocumentReference, Bytes). Both the pull and the seed script go through these
 * two functions so a value survives the round trip unchanged.
 */
export function encode(value) {
  if (value === null || value === undefined) return null;

  if (value instanceof Timestamp) {
    return { __t: "timestamp", seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (value instanceof GeoPoint) {
    return { __t: "geopoint", latitude: value.latitude, longitude: value.longitude };
  }
  if (value instanceof Buffer || value instanceof Uint8Array) {
    return { __t: "bytes", base64: Buffer.from(value).toString("base64") };
  }
  // DocumentReference — duck-typed, the class is not exported off the namespace.
  if (typeof value === "object" && value.firestore && typeof value.path === "string") {
    return { __t: "ref", path: value.path };
  }
  if (Array.isArray(value)) return value.map(encode);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
  }
  return value;
}

export function decode(value, db) {
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) return value.map((v) => decode(v, db));

  if (typeof value === "object") {
    switch (value.__t) {
      case "timestamp":
        return new Timestamp(value.seconds, value.nanoseconds);
      case "geopoint":
        return new GeoPoint(value.latitude, value.longitude);
      case "bytes":
        return Buffer.from(value.base64, "base64");
      case "ref":
        return db.doc(value.path);
      default:
        return Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, decode(v, db)])
        );
    }
  }
  return value;
}

export { FieldValue };
