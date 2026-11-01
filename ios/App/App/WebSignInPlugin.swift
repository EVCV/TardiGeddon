import AuthenticationServices
import Capacitor
import Foundation
import UIKit

/// Google sign-in in the iOS app, the native half of src/account/webSignIn.ts.
/// Google's page refuses to open inside the app's web view, but it allows
/// iOS's own sign-in sheet (ASWebAuthenticationSession, Safari underneath).
/// The sheet opens the server's /api/app/social, the player signs in with
/// Google there, and the server sends them back to
/// com.tardigeddon.app://signin?token=…, which the sheet catches and hands to
/// the game (the same hand-off as Apple's in the Android app; docs/ACCOUNTS.md).
/// The token only works with the verifier the game kept, so the link is safe
/// even if another app saw it.
@objc(WebSignInPlugin)
public class WebSignInPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "WebSignInPlugin"
    public let jsName = "WebSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
    ]

    /// The sheet open now (one at a time); kept so it isn't freed while open.
    private var session: ASWebAuthenticationSession?

    @objc func open(_ call: CAPPluginCall) {
        guard let address = call.getString("url"), let url = URL(string: address), url.scheme == "https",
              let scheme = call.getString("scheme"), !scheme.isEmpty else {
            call.resolve(["status": "error", "message": "bad url"])
            return
        }
        DispatchQueue.main.async {
            self.session?.cancel()
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] callback, error in
                self?.session = nil
                if let callback = callback {
                    call.resolve(["status": "ok", "url": callback.absoluteString])
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    call.resolve(["status": "cancelled"])
                } else {
                    call.resolve(["status": "error", "message": error?.localizedDescription ?? "no answer"])
                }
            }
            session.presentationContextProvider = self
            // A fresh browser each time: no "wants to use … to sign in" question, and
            // never someone else's leftover Google sign-in on a shared iPad.
            session.prefersEphemeralWebBrowserSession = true
            self.session = session
            if !session.start() {
                self.session = nil
                call.resolve(["status": "error", "message": "could not open"])
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}
