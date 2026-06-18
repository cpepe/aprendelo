import SwiftUI

struct ContentView: View {
    @StateObject private var llamaService = LlamaService()
    
    var body: some View {
        WebViewWrapper(llamaService: llamaService)
            .edgesIgnoringSafeArea(.all)
    }
}
