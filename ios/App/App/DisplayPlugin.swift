import Capacitor
import Foundation
import UIKit

/// The iPhone's or iPad's display and accessibility settings the game follows
/// (the iOS half of the Android app's DisplayPlugin.java):
/// - Text Size (Dynamic Type), for the game's "Text size: Auto" (src/ui/textSize.ts);
/// - Differentiate Without Color, which turns on the colour-blind team colours
///   (src/ui/access.ts);
/// - Dark Mode, for "Look: Auto" (the web view also tells the page itself).
/// The page asks again whenever the app comes back to the front.
@objc(DisplayPlugin)
public class DisplayPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DisplayPlugin"
    public let jsName = "Display"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "fontScale", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "accessibility", returnType: CAPPluginReturnPromise),
    ]

    /// Body text size at each Dynamic Type setting, in points (Apple's Human
    /// Interface Guidelines); "Large", 17pt, is the default and 100%.
    private static let bodyPoints: [UIContentSizeCategory: Double] = [
        .extraSmall: 14, .small: 15, .medium: 16, .large: 17,
        .extraLarge: 19, .extraExtraLarge: 21, .extraExtraExtraLarge: 23,
        .accessibilityMedium: 28, .accessibilityLarge: 33, .accessibilityExtraLarge: 40,
        .accessibilityExtraExtraLarge: 47, .accessibilityExtraExtraExtraLarge: 53,
    ]

    private func scale() -> Double {
        let size = UIApplication.shared.preferredContentSizeCategory
        return (DisplayPlugin.bodyPoints[size] ?? 17) / 17
    }

    @objc func fontScale(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["scale": self.scale()])
        }
    }

    @objc func accessibility(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let dark = self.bridge?.viewController?.traitCollection.userInterfaceStyle == .dark
            call.resolve([
                "fontScale": self.scale(),
                "noColour": UIAccessibility.shouldDifferentiateWithoutColor,
                "dark": dark,
                "contrast": UIAccessibility.isDarkerSystemColorsEnabled,
            ])
        }
    }
}
