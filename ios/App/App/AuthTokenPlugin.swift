import Capacitor
import Foundation
import Security

/// Keeps the game server's sign-in token in the iOS Keychain: the native half
/// of src/account/token.ts. The iOS app can't use the server's sign-in cookie
/// (docs/IOS.md §2a), so it signs in with this token instead. Kept on this
/// device only: not synced to iCloud, not in backups restored to another phone.
@objc(AuthTokenPlugin)
public class AuthTokenPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AuthTokenPlugin"
    public let jsName = "AuthToken"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
    ]

    private let item: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.tardigeddon.app.signin",
        kSecAttrAccount as String: "session",
    ]

    @objc func get(_ call: CAPPluginCall) {
        var query = item
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var found: AnyObject?
        if SecItemCopyMatching(query as CFDictionary, &found) == errSecSuccess,
           let data = found as? Data, let value = String(data: data, encoding: .utf8) {
            call.resolve(["value": value])
        } else {
            call.resolve([:])
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let value = call.getString("value"), !value.isEmpty else {
            call.reject("No token.")
            return
        }
        SecItemDelete(item as CFDictionary)
        var add = item
        add[kSecValueData as String] = Data(value.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary, nil)
        if status == errSecSuccess {
            call.resolve()
        } else {
            call.reject("Couldn't save the sign-in (Keychain error \(status)).")
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        let status = SecItemDelete(item as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound {
            call.resolve()
        } else {
            call.reject("Couldn't forget the sign-in (Keychain error \(status)).")
        }
    }
}
