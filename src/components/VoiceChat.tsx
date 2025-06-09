import { useState, useCallback, useRef } from 'react';
import OpenAI from 'openai';

interface VoiceChatProps {
  apiKey: string;
}

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

const VoiceChat: React.FC<VoiceChatProps> = ({ apiKey }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [conversationHistory, setConversationHistory] = useState<Message[]>([]);
  const timeoutRef = useRef<number | null>(null);

  // Get the recognition language from environment variables, default to en-US
  const recognitionLang = import.meta.env.VITE_SPEECH_RECOGNITION_LANG || 'en-US';

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

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      console.log('Stopping recognition...');
      recognitionRef.current.stop();
      setIsListening(false);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }, []);

  const startListening = useCallback(() => {
    if (isSpeaking) return; // Don't start if we're speaking
    
    console.log('Starting recognition...');
    if ('webkitSpeechRecognition' in window) {
      try {
        // Stop any existing recognition
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }

        const recognition = new (window as any).webkitSpeechRecognition();
        recognitionRef.current = recognition;
        
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = recognitionLang;
        console.log('Using recognition language:', recognitionLang);

        recognition.onstart = () => {
          console.log('Recognition started');
          setIsListening(true);
        };

        recognition.onresult = async (event: any) => {
          console.log('Recognition result received');
          const transcript = event.results[0][0].transcript;
          console.log('Transcript:', transcript);
          
          // Only process if we have a non-empty transcript
          if (transcript.trim()) {
            setTranscript(transcript);
            stopListening();

            try {
              // Add user message to conversation history
              const updatedHistory = [...conversationHistory, { role: "user" as const, content: transcript }];
              setConversationHistory(updatedHistory);

              console.log('Sending to OpenAI...');
              const completion = await openai.chat.completions.create({
                messages: updatedHistory,
                model: "gpt-3.5-turbo",
              });

              const aiResponse = completion.choices[0].message.content;
              console.log('OpenAI response:', aiResponse);
              setResponse(aiResponse || '');
              
              // Add assistant response to conversation history
              setConversationHistory(prev => [...prev, { role: "assistant" as const, content: aiResponse || '' }]);
              
              speak(aiResponse || '');
            } catch (error) {
              console.error('OpenAI API error:', error);
              setResponse('Sorry, I encountered an error.');
              speak('Sorry, I encountered an error.');
            }
          }
        };

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          setIsListening(false);
          if (timeoutRef.current) {
            window.clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        };

        recognition.onend = () => {
          console.log('Recognition ended');
          setIsListening(false);
          recognitionRef.current = null;
          if (timeoutRef.current) {
            window.clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        };

        recognition.start();
      } catch (error) {
        console.error('Error setting up speech recognition:', error);
        alert('Error setting up speech recognition. Please try again.');
      }
    } else {
      alert('Speech recognition is not supported in this browser. Please try Chrome, Edge, or Safari.');
    }
  }, [speak, stopListening, conversationHistory, isSpeaking, recognitionLang]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault(); // Prevent default behavior
    startListening();
  }, [startListening]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault(); // Prevent default behavior
    stopListening();
  }, [stopListening]);

  return (
    <div className="voice-chat-container">
      <div className="status">
        {isListening ? 'Listening...' : isSpeaking ? 'Speaking...' : 'Ready'}
      </div>
      <button
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        disabled={isSpeaking}
        className="start-button"
        style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
      >
        {isListening ? 'Release to Stop' : isSpeaking ? 'Speaking...' : 'Press and Hold to Speak'}
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