import crypto from "crypto";

// Проверка подписанных StoreKit 2 транзакций (JWS) без похода к Apple
// за токеном — тот же подход, что в официальных примерах Apple.
// Транзакция приходит с клиента как compact JWS: header.payload.signature,
// где header.x5c — цепочка сертификатов (leaf -> intermediate),
// подводящая к публичному корневому Apple Root CA - G3. Мы:
//   1. проверяем, что цепочка сертификатов действительно ведёт к
//      настоящему корню Apple (а не к самодельному, который атакующий
//      мог бы подсунуть вместе с поддельной подписью);
//   2. проверяем подпись JWS публичным ключом листового сертификата;
//   3. только после этого доверяем payload (bundleId/productId/
//      expiresDate и т.д.).
// Корневой сертификат — публичный, скачан с
// https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
// (SHA-256 не секрет, его не нужно держать в .env).
const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

export interface AppleTransactionPayload {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  purchaseDate: number;
  originalPurchaseDate: number;
  expiresDate?: number;
  quantity: number;
  type: string;
  environment: "Sandbox" | "Production";
  revocationDate?: number;
  revocationReason?: number;
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

function toPem(base64Der: string): string {
  const lines = base64Der.match(/.{1,64}/g) ?? [base64Der];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----`;
}

// Возвращает decoded payload, только если подпись и вся цепочка
// сертификатов реально проверены — никогда не доверяем payload на
// слово. null означает "не смогли проверить", вызывающий код должен
// трактовать это как отказ (см. app/api/payments/apple-iap-verify).
export function verifyAppleSignedTransaction(
  signedTransaction: string
): AppleTransactionPayload | null {
  try {
    const parts = signedTransaction.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;

    const header = JSON.parse(base64UrlDecode(headerB64).toString("utf8"));
    const x5c: string[] | undefined = header.x5c;
    if (!Array.isArray(x5c) || x5c.length < 2) return null;
    if (header.alg !== "ES256") return null;

    const leafCert = new crypto.X509Certificate(toPem(x5c[0]));
    const intermediateCert = new crypto.X509Certificate(toPem(x5c[1]));
    const rootCert = new crypto.X509Certificate(APPLE_ROOT_CA_G3_PEM);

    // Цепочка доверия: leaf подписан intermediate, intermediate
    // подписан настоящим Apple Root CA G3 (сравниваем по самому
    // сертификату, а не только по имени — checkIssued проверяет
    // подпись, а не просто совпадение полей).
    if (!leafCert.checkIssued(intermediateCert)) return null;
    if (!intermediateCert.checkIssued(rootCert)) return null;
    if (!intermediateCert.verify(rootCert.publicKey)) return null;
    if (!leafCert.verify(intermediateCert.publicKey)) return null;

    const now = new Date();
    if (new Date(leafCert.validTo) < now || new Date(rootCert.validTo) < now) {
      return null;
    }

    const signingInput = `${headerB64}.${payloadB64}`;
    const signature = base64UrlDecode(signatureB64);
    const verified = crypto.verify(
      "sha256",
      Buffer.from(signingInput),
      { key: leafCert.publicKey, dsaEncoding: "ieee-p1363" },
      signature
    );
    if (!verified) return null;

    return JSON.parse(base64UrlDecode(payloadB64).toString("utf8"));
  } catch (err) {
    console.error("verifyAppleSignedTransaction error:", err);
    return null;
  }
}
