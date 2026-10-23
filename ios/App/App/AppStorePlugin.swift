import Capacitor
import Foundation
import StoreKit

/// Apple's in-app purchase for coin packs (StoreKit 2): the native half of
/// src/shop/appStore.ts. The app only starts purchases and passes on what Apple
/// signed; the game server checks the signature and grants the coins
/// (server/appStore.ts). A purchase is only finished once the server has it, so
/// one it never heard about comes back next time (Transaction.unfinished).
@objc(AppStorePlugin)
public class AppStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppStorePlugin"
    public let jsName = "AppStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "products", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "buy", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unfinished", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
    ]

    private var updates: Task<Void, Never>?

    override public func load() {
        // Purchases that complete outside a buy (a parent approved it with Ask to
        // Buy, a slow payment went through): the game sends them to the server.
        updates = Task { [weak self] in
            for await _ in Transaction.updates {
                self?.notifyListeners("purchasesUpdated", data: [:])
            }
        }
    }

    deinit {
        updates?.cancel()
    }

    /// Each pack's price as the App Store shows it to this player.
    @objc func products(_ call: CAPPluginCall) {
        let ids = call.getArray("ids", String.self) ?? []
        Task {
            do {
                let found = try await Product.products(for: ids)
                call.resolve(["products": found.map { ["id": $0.id, "price": $0.displayPrice] }])
            } catch {
                call.reject("Couldn't get prices from the App Store.")
            }
        }
    }

    /// Apple's payment sheet for one pack, tagged with the player's account (a UUID from a hash).
    @objc func buy(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let account = call.getString("account").flatMap(UUID.init(uuidString:)) else {
            call.reject("No such coin pack.")
            return
        }
        Task {
            do {
                guard let product = try await Product.products(for: [id]).first else {
                    call.reject("No such coin pack.")
                    return
                }
                switch try await product.purchase(options: [.appAccountToken(account)]) {
                case .success(let signed):
                    call.resolve(Self.describe(signed).merging(["status": "purchased"]) { _, new in new })
                case .pending:
                    call.resolve(["status": "pending"])
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                @unknown default:
                    call.resolve(["status": "pending"])
                }
            } catch {
                call.reject("The App Store couldn't take the payment. Please try again.")
            }
        }
    }

    /// Purchases not finished yet, as Apple signed them.
    @objc func unfinished(_ call: CAPPluginCall) {
        Task {
            var purchases: [[String: Any]] = []
            for await signed in Transaction.unfinished {
                purchases.append(Self.describe(signed))
            }
            call.resolve(["purchases": purchases])
        }
    }

    /// Done with: the server has granted it.
    @objc func finish(_ call: CAPPluginCall) {
        guard let id = call.getString("transactionId").flatMap(UInt64.init) else {
            call.reject("No such purchase.")
            return
        }
        Task {
            for await signed in Transaction.unfinished where signed.unsafePayloadValue.id == id {
                await signed.unsafePayloadValue.finish()
            }
            call.resolve()
        }
    }

    /// What the game needs: Apple's signed purchase (the server checks the
    /// signature, so the app doesn't need to), and its id and product to finish it.
    private static func describe(_ signed: VerificationResult<Transaction>) -> [String: Any] {
        let t = signed.unsafePayloadValue
        return ["id": t.productID, "transaction": signed.jwsRepresentation, "transactionId": String(t.id)]
    }
}
