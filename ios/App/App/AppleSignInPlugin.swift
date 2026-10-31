import AuthenticationServices
import Capacitor
import Foundation
import UIKit

/// Sign in with Apple: iOS's own sheet, the native half of
/// src/account/appleSignIn.ts. Asks for the email only (new accounts get a
/// made-up player name) and hands back Apple's ID token, which the game sends
/// to the server to check. `nonce` is the SHA-256 the game made; Apple puts it
/// in the token. Needs the Sign in with Apple capability (App.entitlements).
@objc(AppleSignInPlugin)
public class AppleSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "AppleSignInPlugin"
    public let jsName = "AppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
    ]

    /// The sign-in under way (one at a time).
    private var pending: CAPPluginCall?

    @objc func signIn(_ call: CAPPluginCall) {
        guard let nonce = call.getString("nonce"), !nonce.isEmpty else {
            call.resolve(["status": "error", "message": "no nonce"])
            return
        }
        DispatchQueue.main.async {
            if let earlier = self.pending {
                earlier.resolve(["status": "cancelled"])
            }
            self.pending = call
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.email]
            request.nonce = nonce
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = pending else { return }
        pending = nil
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let data = credential.identityToken,
              let token = String(data: data, encoding: .utf8) else {
            call.resolve(["status": "error", "message": "no token"])
            return
        }
        call.resolve(["status": "ok", "idToken": token])
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = pending else { return }
        pending = nil
        let code = (error as? ASAuthorizationError)?.code
        if code == .canceled {
            call.resolve(["status": "cancelled"])
        } else {
            call.resolve(["status": "error", "message": error.localizedDescription])
        }
    }
}
