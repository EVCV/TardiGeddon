import Capacitor
import UIKit

/// The game's screen: Capacitor's web view, full screen, with our own plugins.
class GameViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        // Our own plugins (Capacitor finds the npm ones by itself).
        bridge?.registerPluginInstance(AuthTokenPlugin())
        bridge?.registerPluginInstance(AppStorePlugin())
        bridge?.registerPluginInstance(ReviewPlugin())
        bridge?.registerPluginInstance(AppleSignInPlugin())
        bridge?.registerPluginInstance(AgeSignalsPlugin())
    }

    // A swipe in from an edge (aiming, scrolling the map) needs a second swipe to
    // leave the game. The home bar fading away is Capacitor's SystemBars, which
    // src/native.ts switches on (Capacitor already overrides that property).
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
}
