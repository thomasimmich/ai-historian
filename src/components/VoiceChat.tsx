import { useState, useCallback } from 'react';
import OpenAI from 'openai';

interface VoiceChatProps {
  apiKey: string;
}

const VoiceChat: React.FC<VoiceChatProps> = ({ apiKey }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);

  const openai = new OpenAI({
    apiKey: apiKey,
    dangerouslyAllowBrowser: true,
  });

  const speak = useCallback(async (text: string) => {
    try {
      setIsSpeaking(true);
      const mp3 = await openai.audio.speech.create({
        model: "tts-1",
        voice: "alloy",
        input: text,
      });

      const blob = await mp3.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
      };
      
      await audio.play();
    } catch (error) {
      console.error('Error generating speech:', error);
      setIsSpeaking(false);
      // Fallback to browser's speech synthesis if OpenAI TTS fails
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
      }
    }
  }, []);

  const startListening = useCallback(() => {
    if ('webkitSpeechRecognition' in window) {
      const recognition = new (window as any).webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US'; // Set language to English

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = async (event: any) => {
        const transcript = event.results[0][0].transcript;
        setTranscript(transcript);

        try {
          const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: transcript }],
            model: "gpt-3.5-turbo",
          });

          const aiResponse = completion.choices[0].message.content;
          setResponse(aiResponse || '');
          speak(aiResponse || '');
        } catch (error) {
          console.error('Error:', error);
          setResponse('Sorry, I encountered an error.');
          speak('Sorry, I encountered an error.');
        }
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } else {
      alert('Speech recognition is not supported in this browser.');
    }
  }, [speak]);

  return (
    <div className="voice-chat-container">
      <div className="status">
        {isListening ? 'Listening...' : isSpeaking ? 'Speaking...' : 'Ready'}
      </div>
      <button
        onClick={startListening}
        disabled={isListening || isSpeaking}
        className="start-button"
      >
        {isListening ? 'Listening...' : isSpeaking ? 'Speaking...' : 'Start Speaking'}
      </button>
      {transcript && (
        <div className="transcript">
          <h3>You said:</h3>
          <p>{transcript}</p>
        </div>
      )}
      {response && (
        <div className="response">
          <h3>Assistant:</h3>
          <p>{response}</p>
        </div>
      )}
    </div>
  );
};

export default VoiceChat; 