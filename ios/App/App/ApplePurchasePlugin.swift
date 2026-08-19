import Foundation
import Capacitor
import StoreKit

// Нативный мост к StoreKit 2 для Premium-подписки — Telegram Stars
// (openInvoice) в standalone iOS-сборке недоступен вообще (это
// Telegram-специфичный API), а Apple прямо требует, чтобы любая
// цифровая покупка внутри iOS-приложения шла через их собственный
// In-App Purchase (Guideline 3.1.1) — сторонний способ оплаты Apple
// отклонит на ревью.
//
// purchase(productId) возвращает подписанный Apple JWS
// (VerificationResult.jwsRepresentation) — сырую строку, а не уже
// распарсенные поля. Сервер (app/api/payments/apple-iap-verify,
// lib/server/apple-iap.ts) сам проверяет подпись и цепочку
// сертификатов до Apple Root CA — плагин намеренно не решает здесь,
// "настоящая" покупка или нет, это ответственность сервера.
@objc(ApplePurchasePlugin)
public class ApplePurchasePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ApplePurchasePlugin"
    public let jsName = "ApplePurchase"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise)
    ]

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId is required")
            return
        }

        Task {
            do {
                let products = try await Product.products(for: [productId])

                guard let product = products.first else {
                    call.reject("Product not found in App Store: \(productId)")
                    return
                }

                let result = try await product.purchase()

                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        // finish() до отправки на сервер: если сервер
                        // недоступен, транзакция всё равно не зависнет
                        // в очереди StoreKit — сервер идемпотентен
                        // (upsert по telegram_id), повторно
                        // засабмиченный jws безопасно перепроверить.
                        await transaction.finish()
                        call.resolve([
                            "jwsRepresentation": verification.jwsRepresentation,
                            "transactionId": String(transaction.id)
                        ])
                    case .unverified(_, let error):
                        call.reject("StoreKit could not verify the transaction: \(error.localizedDescription)")
                    }
                case .userCancelled:
                    call.reject("USER_CANCELLED")
                case .pending:
                    call.reject("PURCHASE_PENDING")
                @unknown default:
                    call.reject("Unknown purchase result")
                }
            } catch {
                call.reject("Purchase failed: \(error.localizedDescription)")
            }
        }
    }
}
