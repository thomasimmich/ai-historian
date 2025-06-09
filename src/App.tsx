import VoiceChat from './components/VoiceChat'
import './App.css'

function App() {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY

  if (!apiKey) {
    return (
      <div className="app">
        <h1>AI Voice Assistant</h1>
        <div className="api-key-input">
          <p>Please create a .env file in the root directory with your OpenAI API key:</p>
          <pre>VITE_OPENAI_API_KEY=your_api_key_here</pre>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <h1>AI Voice Assistant</h1>
      <VoiceChat apiKey={apiKey} />
    </div>
  )
}

export default App
