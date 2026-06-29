import SwiftUI

struct ContentView: View {
    @StateObject private var gemmaService = GemmaService()
    
    var body: some View {
        ZStack {
            WebViewWrapper(gemmaService: gemmaService)
                .edgesIgnoringSafeArea(.all)
            
            // Native overlay for model downloading / loading state
            switch gemmaService.state {
            case .downloading(let progress):
                Color.black.opacity(0.85)
                    .ignoresSafeArea()
                VStack(spacing: 24) {
                    ProgressView(value: progress) {
                        Text("Downloading Local LLM Model...")
                            .font(.headline)
                            .foregroundColor(.white)
                    } currentValueLabel: {
                        Text("\(Int(progress * 100))%")
                            .foregroundColor(.white.opacity(0.8))
                    }
                    .progressViewStyle(.linear)
                    .padding()
                    
                    Text("This downloads a compact Gemma 4 model (~2.5 GB) for fully offline AI features. This only happens once.")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.6))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }
                .frame(maxWidth: 400)
                
            case .loading:
                Color.black.opacity(0.85)
                    .ignoresSafeArea()
                VStack(spacing: 16) {
                    ProgressView()
                        .tint(.white)
                        .scaleEffect(1.5)
                    Text("Loading model into memory...")
                        .font(.headline)
                        .foregroundColor(.white)
                }
                
            case .error(let message):
                Color.black.opacity(0.85)
                    .ignoresSafeArea()
                VStack(spacing: 16) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 50))
                        .foregroundColor(.red)
                    Text("Model Load Error")
                        .font(.headline)
                        .foregroundColor(.white)
                    Text(message)
                        .font(.body)
                        .foregroundColor(.white.opacity(0.8))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                    Button {
                        gemmaService.state = .idle
                    } label: {
                        Text("Dismiss")
                            .fontWeight(.semibold)
                            .padding()
                            .background(Color.blue)
                            .foregroundColor(.white)
                            .cornerRadius(10)
                    }
                }
                
            default:
                EmptyView()
            }
        }
    }
}
