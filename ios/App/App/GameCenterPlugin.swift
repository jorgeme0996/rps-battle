import Capacitor
import GameKit

/// Signs the player in to Game Center and returns their alias, so the game
/// never has to ask for a name (JS: `Capacitor.Plugins.GameCenter.signIn()`).
@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "GameCenterPlugin"
    public let jsName = "GameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCalls: [CAPPluginCall] = []
    private var handlerInstalled = false

    @objc func signIn(_ call: CAPPluginCall) {
        let player = GKLocalPlayer.local
        if player.isAuthenticated {
            call.resolve(info(player))
            return
        }
        DispatchQueue.main.async {
            self.pendingCalls.append(call)
            // Game Center calls this handler again whenever the auth state changes,
            // so it is installed only once.
            guard !self.handlerInstalled else { return }
            self.handlerInstalled = true
            player.authenticateHandler = { [weak self] viewController, error in
                guard let self = self else { return }
                if let viewController = viewController {
                    // Game Center wants to show its sign-in sheet
                    self.bridge?.viewController?.present(viewController, animated: true)
                    return
                }
                let calls = self.pendingCalls
                self.pendingCalls.removeAll()
                if player.isAuthenticated {
                    calls.forEach { $0.resolve(self.info(player)) }
                } else {
                    let message = error?.localizedDescription ?? "Game Center is not available"
                    calls.forEach { $0.reject(message) }
                }
            }
        }
    }

    private func info(_ player: GKLocalPlayer) -> [String: Any] {
        return [
            "alias": player.alias,
            "displayName": player.displayName,
            "playerId": player.gamePlayerID
        ]
    }
}
