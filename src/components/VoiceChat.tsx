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
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<Message[]>([]);
  const [lastRecording, setLastRecording] = useState<Blob | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const openai = new OpenAI({
    apiKey: apiKey,
    dangerouslyAllowBrowser: true,
  });

  const downloadRecording = useCallback(() => {
    if (lastRecording) {
      const url = URL.createObjectURL(lastRecording);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'recording.webm';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, [lastRecording]);

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

  const stopRecording = useCallback(async () => {
    if (mediaRecorderRef.current && isRecording) {
      console.log('Stopping recording...');
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const startRecording = useCallback(async () => {
    if (isSpeaking) return; // Don't start if we're speaking
    
    try {
      console.log('Starting recording...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        console.log('Data available:', event.data.size, 'bytes');
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('Recording stopped, processing audio...');
        console.log('Audio chunks:', audioChunksRef.current.length);
        console.log('Total audio size:', audioChunksRef.current.reduce((acc, chunk) => acc + chunk.size, 0), 'bytes');
        
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
        console.log('Audio blob size:', audioBlob.size, 'bytes');
        
        // Save the recording for potential download
        setLastRecording(audioBlob);
        
        try {
          // Create a File object from the Blob
          const audioFile = new File([audioBlob], 'audio.webm', { type: 'audio/webm;codecs=opus' });
          console.log('Audio file size:', audioFile.size, 'bytes');
          
          try {
            // Convert audio blob to base64
            const reader = new FileReader();
            const base64Audio = await new Promise<string>((resolve, reject) => {
              reader.onload = () => {
                // Keep the full data URL including the MIME type prefix
                const base64 = reader.result as string;
                resolve(base64);
              };
              reader.onerror = reject;
              reader.readAsDataURL(audioFile);
            });

            // Send audio to transcription endpoint
            const response = await fetch('https://automation.leanscope.ai/webhook-test/transcribe-audio', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                data: base64Audio // This will now include the full data URL with MIME type
              })
            });

            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            const transcript = result.speechInputText || '';
            console.log('Raw transcription:', transcript);
            
            if (transcript.trim()) {
              setTranscript(transcript);

              try {
                // Add user message to conversation history
                const updatedHistory = [...conversationHistory, { role: "user" as const, content: transcript }];
                setConversationHistory(updatedHistory);

                // Get response using the Responses API
                const response = await openai.responses.create({
                  model: "gpt-4.1",
                  input: updatedHistory.map(msg => ({
                    role: msg.role,
                    content: msg.content
                  }))
                });

                const aiResponse = response.output_text;
                console.log('OpenAI response:', aiResponse);
                setResponse(aiResponse);
                
                // Add assistant response to conversation history
                setConversationHistory(prev => [...prev, { role: "assistant" as const, content: aiResponse }]);
                
                speak(aiResponse);
              } catch (error) {
                console.error('OpenAI API error:', error);
                setResponse('Sorry, I encountered an error.');
                speak('Sorry, I encountered an error.');
              }
            } else {
              console.log('Empty transcript received');
            }
          } catch (error) {
            console.error('Error transcribing audio:', error);
            setResponse('Sorry, I had trouble understanding that.');
            speak('Sorry, I had trouble understanding that.');
          }
        } catch (error) {
          console.error('Error transcribing audio:', error);
          setResponse('Sorry, I had trouble understanding that.');
          speak('Sorry, I had trouble understanding that.');
        }

        // Stop all tracks in the stream
        stream.getTracks().forEach(track => track.stop());
      };

      // Start recording with a specific timeslice to get data more frequently
      mediaRecorder.start(100); // Get data every 100ms
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Error accessing microphone. Please make sure you have granted microphone permissions.');
    }
  }, [speak, conversationHistory, isSpeaking]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    startRecording();
  }, [startRecording]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    stopRecording();
  }, [stopRecording]);

  return (
    <div className="voice-chat-container">
      <div className="status">
        {isRecording ? 'Recording...' : isSpeaking ? 'Speaking...' : 'Ready'}
      </div>
      <button
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        disabled={isSpeaking}
        className="start-button"
        style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
      >
        {isRecording ? 'Release to Stop' : isSpeaking ? 'Speaking...' : 'Press and Hold to Speak'}
      </button>
      {lastRecording && (
        <button
          onClick={downloadRecording}
          className="download-button"
          style={{ marginTop: '10px' }}
        >
          Download Last Recording
        </button>
      )}
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