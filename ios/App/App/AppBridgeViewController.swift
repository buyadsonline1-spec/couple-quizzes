import Capacitor

// Плагины из npm (например, @capacitor-community/apple-sign-in)
// Capacitor подхватывает сам через Package.swift. Плагин, написанный
// прямо в этом проекте (ApplePurchasePlugin), таким образом не
// находится — его нужно явно зарегистрировать. capacitorDidLoad() —
// официальный хук Capacitor для этого случая (см. их гайд "Custom
// Native iOS Code").
class AppBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(ApplePurchasePlugin())
    }
}
