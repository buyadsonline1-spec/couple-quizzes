#!/usr/bin/env node
// Generates the ES256 client-secret JWT that Supabase's "Sign in with
// Apple" provider needs in its "Secret Key (for OAuth)" field.
//
// Apple secret keys expire after a maximum of 6 months — re-run this
// whenever Supabase warns the key is expiring. The .p8 private key
// file itself doesn't expire and can be reused every time; only the
// generated JWT here has a lifetime.
//
// Usage:
//   node scripts/generate-apple-oauth-secret.js \
//     --team-id 86WJKTA2L8 \
//     --key-id 9N66W59668 \
//     --client-id com.couplequizzes.signin \
//     --key-file /path/to/AuthKey_9N66W59668.p8
//
// Prints the JWT to stdout — paste it into Supabase → Authentication →
// Providers → Apple → "Secret Key (for OAuth)".

const fs = require("fs");
const crypto = require("crypto");

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    args[key] = argv[i + 1];
  }
  return args;
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlFromBuffer(buf) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Apple's ES256 signature must be raw (r || s, 64 bytes), not the
// DER-encoded format Node's crypto.sign() produces by default.
function derToJoseES256(der) {
  // Minimal DER parser for an ECDSA signature (SEQUENCE of two INTEGERs).
  let offset = 2; // skip SEQUENCE tag + length byte
  if (der[0] !== 0x30) throw new Error("Unexpected DER signature format");

  function readInt() {
    if (der[offset] !== 0x02) throw new Error("Expected INTEGER in DER signature");
    offset += 1;
    let len = der[offset];
    offset += 1;
    let bytes = der.slice(offset, offset + len);
    offset += len;
    // Strip leading zero padding byte(s) added for sign bit.
    while (bytes.length > 32 && bytes[0] === 0x00) {
      bytes = bytes.slice(1);
    }
    // Left-pad to 32 bytes.
    if (bytes.length < 32) {
      bytes = Buffer.concat([Buffer.alloc(32 - bytes.length, 0), bytes]);
    }
    return bytes;
  }

  const r = readInt();
  const s = readInt();
  return Buffer.concat([r, s]);
}

function main() {
  const args = parseArgs();
  const teamId = args["team-id"];
  const keyId = args["key-id"];
  const clientId = args["client-id"];
  const keyFile = args["key-file"];

  if (!teamId || !keyId || !clientId || !keyFile) {
    console.error(
      "Usage: node generate-apple-oauth-secret.js --team-id <id> --key-id <id> --client-id <services-id> --key-file <path/to/AuthKey.p8>"
    );
    process.exit(1);
  }

  const privateKeyPem = fs.readFileSync(keyFile, "utf8");

  const now = Math.floor(Date.now() / 1000);
  // Apple allows up to 6 months (15777000s); use the max.
  const exp = now + 15777000;

  const header = { alg: "ES256", kid: keyId };
  const payload = {
    iss: teamId,
    iat: now,
    exp,
    aud: "https://appleid.apple.com",
    sub: clientId,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const sign = crypto.createSign("SHA256");
  sign.update(signingInput);
  sign.end();

  const derSignature = sign.sign(privateKeyPem);
  const joseSignature = derToJoseES256(derSignature);
  const encodedSignature = base64urlFromBuffer(joseSignature);

  const jwt = `${signingInput}.${encodedSignature}`;

  console.log(jwt);
  console.error(
    `\n(generated ${new Date(now * 1000).toISOString()}, expires ${new Date(
      exp * 1000
    ).toISOString()} — re-run this script before then)`
  );
}

main();
