import Capacitor
import UIKit

/// The game's screen: Capacitor's web view, full screen, with our own plugins.
class GameViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        // Our own plugins (Capacitor finds the npm ones by itself).
        bridge?.registerPluginInstance(AuthTokenPlugin())
    }

    // The home bar fades away while playing, and a swipe up from the bottom edge
    // (aiming, scrolling the map) needs a second swipe to leave the game.
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
}
