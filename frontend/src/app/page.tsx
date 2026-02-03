'use client';

import { useState, useEffect, useRef } from 'react';

const API_URL = 'http://localhost:3000';

export default function Home() {
  const [sessionId, setSessionId] = useState<string>('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [cameraMovement, setCameraMovement] = useState('zoom-in');
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [generatedAudio, setGeneratedAudio] = useState<string | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Generate session ID only on client side
  useEffect(() => {
    setSessionId(crypto.randomUUID());
  }, []);

  useEffect(() => {
    if (sessionId) {
      fetchConversations();
    }
  }, [sessionId]);

  const fetchConversations = async () => {
    try {
      const res = await fetch(`${API_URL}/api/conversations/${sessionId}`);
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        await transcribeAudio(audioBlob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      alert('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.wav');

      const res = await fetch(`${API_URL}/api/transcribe`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      setTranscript(data.transcript);
      await saveConversation(data.transcript, null, null, null);
    } catch (error) {
      alert('Transcription failed: ' + error);
    }
    setLoading(false);
  };

  const generateImage = async () => {
    if (!imagePrompt) return alert('Enter image prompt');
    
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imagePrompt }),
      });

      const data = await res.json();
      setGeneratedImage(data.imageUrl);
      await saveConversation(imagePrompt, null, data.imageUrl, null);
    } catch (error) {
      alert('Image generation failed: ' + error);
    }
    setLoading(false);
  };

  const generateSpeech = async () => {
    if (!transcript) return alert('No transcript to speak');
    
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/text-to-speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcript }),
      });

      const data = await res.json();
      setGeneratedAudio(data.audioUrl);
      await saveConversation(transcript, data.audioUrl, null, null);
    } catch (error) {
      alert('Speech generation failed: ' + error);
    }
    setLoading(false);
  };

  const saveConversation = async (message: string, audioUrl: string | null, imageUrl: string | null, videoUrl: string | null) => {
    try {
      await fetch(`${API_URL}/api/save-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          user_message: message,
          audio_url: audioUrl,
          image_url: imageUrl,
          video_url: videoUrl,
        }),
      });
      fetchConversations();
    } catch (error) {
      console.error('Save failed:', error);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'Arial, sans-serif', backgroundColor: '#f5f5f5' }}>
      <div style={{ flex: 1, padding: '20px', overflow: 'auto' }}>
        <h1 style={{ color: '#333', marginBottom: '20px' }}>AI Video Generator</h1>
        
        <div style={{ backgroundColor: 'white', border: '1px solid #ddd', padding: '20px', marginBottom: '20px', borderRadius: '8px' }}>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#333', fontWeight: 'bold' }}>Image Prompt:</label>
            <textarea
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              placeholder="A futuristic robot in a garden..."
              style={{ width: '100%', height: '80px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', color: '#333' }}
            />
            <button 
              onClick={generateImage} 
              disabled={loading}
              style={{ backgroundColor: '#007bff', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '4px', marginTop: '10px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
            >
              Generate Image
            </button>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#333', fontWeight: 'bold' }}>Camera Movement:</label>
            <select 
              value={cameraMovement} 
              onChange={(e) => setCameraMovement(e.target.value)}
              style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', color: '#333' }}
            >
              <option value="zoom-in">Zoom In</option>
              <option value="zoom-out">Zoom Out</option>
              <option value="pan-left">Pan Left</option>
              <option value="pan-right">Pan Right</option>
              <option value="rotate">Rotate</option>
            </select>
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#333', fontWeight: 'bold' }}>Audio Input:</label>
            <button 
              onClick={isRecording ? stopRecording : startRecording}
              style={{ 
                backgroundColor: isRecording ? '#dc3545' : '#28a745', 
                color: 'white', 
                padding: '10px 20px', 
                border: 'none', 
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </button>
            {transcript && (
              <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px', color: '#333' }}>
                <strong>Transcript:</strong> {transcript}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#333', fontWeight: 'bold' }}>Or type script:</label>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Enter text to convert to speech..."
              style={{ width: '100%', height: '60px', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', color: '#333' }}
            />
            <button 
              onClick={generateSpeech} 
              disabled={loading}
              style={{ backgroundColor: '#6f42c1', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '4px', marginTop: '10px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
            >
              Generate Speech
            </button>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', border: '1px solid #ddd', padding: '20px', borderRadius: '8px' }}>
          <h3 style={{ color: '#333', marginBottom: '15px' }}>Generated Assets</h3>
          
          {generatedImage && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ color: '#333' }}>Generated Image:</p>
              <img src={generatedImage} alt="Generated" style={{ maxWidth: '400px', borderRadius: '8px' }} />
            </div>
          )}

          {generatedAudio && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ color: '#333' }}>Generated Audio:</p>
              <audio controls src={generatedAudio} style={{ width: '100%' }} />
            </div>
          )}

          <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#fff3cd', borderRadius: '8px', color: '#856404' }}>
            <strong>Lip-Sync Video:</strong>
            <p>Status: Ready for integration</p>
          </div>
        </div>
      </div>

      <div style={{ width: '300px', borderLeft: '1px solid #ddd', padding: '20px', backgroundColor: 'white', overflow: 'auto' }}>
        <h3 style={{ color: '#333', marginBottom: '10px' }}>Conversation History</h3>
        <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>Session: {sessionId ? sessionId.slice(0,8) : '...'}...</p>
        
        {conversations.map((conv, idx) => (
          <div key={idx} style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '6px', fontSize: '14px' }}>
            <div style={{ color: '#666', fontSize: '12px', marginBottom: '5px' }}>
              {new Date(conv.created_at).toLocaleTimeString()}
            </div>
            <div style={{ color: '#333' }}>
              <strong>You:</strong> {conv.user_message.slice(0, 100)}...
            </div>
            {conv.image_url && <div style={{ color: '#28a745', fontSize: '12px', marginTop: '5px' }}>🖼️ Image generated</div>}
            {conv.audio_url && <div style={{ color: '#007bff', fontSize: '12px', marginTop: '5px' }}>🔊 Audio generated</div>}
          </div>
        ))}
      </div>

      {loading && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '24px',
          zIndex: 9999
        }}>
          Processing...
        </div>
      )}
    </div>
  );
}