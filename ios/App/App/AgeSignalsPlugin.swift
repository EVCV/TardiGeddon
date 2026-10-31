import Capacitor
import Foundation
import UIKit
#if canImport(DeclaredAgeRange)
import DeclaredAgeRange
#endif

/// The player's age range from Apple (Declared Age Range), the iOS half of
/// src/shop/ageSignals.ts (Android's is AgeSignalsPlugin.java). Asked only
/// where the law needs it (isEligibleForAgeFeatures: Texas, Utah, Louisiana,
/// Brazil…); elsewhere, and before iOS 26.2, it answers "not_shared" without
/// showing anything. The answer only changes the coin shop, stays in the
/// game's memory and is never sent to our server.
/// Needs the Declared Age Range capability (App.entitlements).
@objc(AgeSignalsPlugin)
public class AgeSignalsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AgeSignalsPlugin"
    public let jsName = "AgeSignals"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "check", returnType: CAPPluginReturnPromise),
    ]

    @objc func check(_ call: CAPPluginCall) {
        #if canImport(DeclaredAgeRange)
        if #available(iOS 26.2, *) {
            Task { @MainActor in
                call.resolve(await self.ask())
            }
            return
        }
        #endif
        call.resolve(["status": "not_shared"])
    }

    #if canImport(DeclaredAgeRange)
    @available(iOS 26.2, *)
    @MainActor
    private func ask() async -> [String: Any] {
        let service = AgeRangeService.shared
        do {
            // Not where the law applies: nothing to ask, and no prompt.
            guard try await service.isEligibleForAgeFeatures else { return ["status": "not_shared"] }
            guard let screen = bridge?.viewController else { return ["status": "error", "message": "no screen"] }
            // The gates match the shop's note (under 18) and our 13+ for online play.
            switch try await service.requestAgeRange(ageGates: 13, 16, 18, in: screen) {
            case .declinedSharing:
                return ["status": "not_shared"]
            case .sharing(let range):
                var answer: [String: Any] = ["status": "shared"]
                if let lower = range.lowerBound { answer["lower"] = lower }
                if let upper = range.upperBound { answer["upper"] = upper }
                return answer
            @unknown default:
                return ["status": "not_shared"]
            }
        } catch AgeRangeService.Error.declinedOnboarding {
            return ["status": "not_shared"]
        } catch {
            return ["status": "error", "message": error.localizedDescription]
        }
    }
    #endif
}
