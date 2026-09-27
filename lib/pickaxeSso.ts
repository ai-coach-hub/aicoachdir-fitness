import {
  createECDH,
  createPrivateKey,
  createPublicKey,
  hkdfSync,
  sign,
} from "node:crypto";
import {
  PICKAXE_SSO_ISSUER,
  PICKAXE_SSO_KEY_ID,
  PICKAXE_WORKSPACE_ID,
} from "@/lib/pickaxeConstants";

const P256_ORDER =
  BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");

function base64Url(input: Buffer | string) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buffer.toString("base64url");
}

function fixedLengthScalar(value: bigint) {
  const hex = value.toString(16).padStart(64, "0");
  return Buffer.from(hex, "hex");
}

function deriveSigningKey() {
  const rootSecret = process.env.CLERK_SECRET_KEY?.trim();
  if (!rootSecret) {
    throw new Error("Clerk server key is not configured.");
  }

  const material = Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(rootSecret, "utf8"),
      Buffer.from("aicoachdir-pickaxe-sso-salt-v1", "utf8"),
      Buffer.from("pickaxe-embed-sso-es256-v1", "utf8"),
      32,
    ),
  );

  const raw = BigInt(`0x${material.toString("hex")}`);
  const scalar = fixedLengthScalar((raw % (P256_ORDER - 1n)) + 1n);

  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(scalar);
  const publicPoint = ecdh.getPublicKey(undefined, "uncompressed");

  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: publicPoint.subarray(1, 33).toString("base64url"),
    y: publicPoint.subarray(33, 65).toString("base64url"),
    d: scalar.toString("base64url"),
  };

  const privateKey = createPrivateKey({ key: jwk, format: "jwk" });
  const publicKeyPem = createPublicKey(privateKey).export({
    type: "spki",
    format: "pem",
  });

  return {
    privateKey,
    publicKeyPem: String(publicKeyPem),
  };
}

export function getPickaxeSsoPublicKeyPem() {
  return deriveSigningKey().publicKeyPem;
}

export function createPickaxeEmbedJwt(args: {
  userId: string;
  email: string;
}) {
  const { privateKey } = deriveSigningKey();
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: "ES256",
    kid: PICKAXE_SSO_KEY_ID,
    typ: "JWT",
  };

  const payload = {
    iss: PICKAXE_SSO_ISSUER,
    aud: "pickaxe-embed",
    sub: args.userId,
    customer_id: PICKAXE_WORKSPACE_ID,
    email: args.email,
    external_user_id: args.userId,
    iat: now,
    exp: now + 300,
  };

  const signingInput =
    `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;

  const signature = sign("sha256", Buffer.from(signingInput, "utf8"), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });

  return `${signingInput}.${base64Url(signature)}`;
}
