'use client';

import { useState, useEffect, useRef } from 'react';

const API_URL = 'http://localhost:3000';

export default function Home() {
  const [sessionId, setSessionId] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'create'>('chat');
  
  // Chat state
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<Array<{role: string, content: string, type?: string, media_url?: string}>>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Creation state
  const [imagePrompt, setImagePrompt] = useState('');
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [generatedAudio, setGeneratedAudio] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    setSessionId(crypto.randomUUID());
  }, []);

  useEffect(() => {
    if (sessionId) {
      fetchConversations();
    }
  }, [sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchConversations = async () => {
    try {
      const res = await fetch(`${API_URL}/api/conversations/${sessionId}`);
      const data = await res.json();
      setMessages(data.conversations || []);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const sendMessage = async () => {
    if (!chatInput.trim()) return;
    
    const userMessage = chatInput;
    setChatInput('');
    setIsLoading(true);
    
    // Add user message immediately
    const newMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    
    // Save to database
    await fetch(`${API_URL}/api/save-conversation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        role: 'user',
        content: userMessage,
        type: 'text'
      }),
    });

    // Get AI response
    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, history: messages }),
      });
      
      const data = await res.json();
      
      // Add AI response
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      
      // Save AI response
      await fetch(`${API_URL}/api/save-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          role: 'assistant',
          content: data.response,
          type: 'text'
        }),
      });
      
    } catch (error) {
      console.error('Chat error:', error);
    }
    
    setIsLoading(false);
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
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.wav');

      const res = await fetch(`${API_URL}/api/transcribe`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      setTranscript(data.transcript);
      
      await fetch(`${API_URL}/api/save-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          role: 'user',
          content: data.transcript,
          type: 'transcript'
        }),
      });
      
      fetchConversations();
    } catch (error) {
      alert('Transcription failed: ' + error);
    }
    setIsLoading(false);
  };

  const generateImage = async () => {
    if (!imagePrompt) return alert('Enter image prompt');
    
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imagePrompt }),
      });

      const data = await res.json();
      setGeneratedImage(data.imageUrl);
      
      // Add to chat
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Generated image: ${imagePrompt}`,
        type: 'image',
        media_url: data.imageUrl
      }]);
      
      await fetch(`${API_URL}/api/save-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          role: 'assistant',
          content: imagePrompt,
          type: 'image',
          media_url: data.imageUrl
        }),
      });
      
      fetchConversations();
    } catch (error) {
      alert('Image generation failed: ' + error);
    }
    setIsLoading(false);
  };

  const generateSpeech = async () => {
    if (!transcript) return alert('No transcript to speak');
    
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/text-to-speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: transcript }),
      });

      const data = await res.json();
      setGeneratedAudio(data.audioUrl);
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Generated speech: "${transcript.substring(0, 50)}..."`,
        type: 'audio',
        media_url: data.audioUrl
      }]);
      
      await fetch(`${API_URL}/api/save-conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          role: 'assistant',
          content: transcript,
          type: 'audio',
          media_url: data.audioUrl
        }),
      });
      
      fetchConversations();
    } catch (error) {
      alert('Speech generation failed: ' + error);
    }
    setIsLoading(false);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'Arial, sans-serif', backgroundColor: '#343541' }}>
      {/* Collapsible Sidebar */}
      <div style={{ 
        width: sidebarOpen ? '260px' : '0px', 
        backgroundColor: '#202123',
        borderRight: '1px solid #4d4d4f',
        transition: 'width 0.3s',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ padding: '10px', borderBottom: '1px solid #4d4d4f' }}>
          <button 
            onClick={() => setActiveTab('chat')}
            style={{
              width: '100%',
              padding: '10px',
              marginBottom: '5px',
              backgroundColor: activeTab === 'chat' ? '#40414f' : 'transparent',
              color: 'white',
              border: '1px solid #4d4d4f',
              borderRadius: '6px',
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            💬 Chat
          </button>
          <button 
            onClick={() => setActiveTab('create')}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: activeTab === 'create' ? '#40414f' : 'transparent',
              color: 'white',
              border: '1px solid #4d4d4f',
              borderRadius: '6px',
              cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            🎨 Create Video
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '10px' }}>
          <div style={{ color: '#8e8ea0', fontSize: '12px', marginBottom: '10px' }}>
            Session: {sessionId.slice(0, 8)}...
          </div>
          
          {messages.map((msg, idx) => (
            <div 
              key={idx}
              onClick={() => {
                if (msg.media_url) {
                  if (msg.type === 'image') setGeneratedImage(msg.media_url);
                  if (msg.type === 'audio') setGeneratedAudio(msg.media_url);
                  setActiveTab('create');
                }
              }}
              style={{
                padding: '10px',
                marginBottom: '5px',
                backgroundColor: msg.role === 'user' ? '#343541' : '#40414f',
                borderRadius: '6px',
                cursor: msg.media_url ? 'pointer' : 'default',
                fontSize: '13px',
                color: '#ececf1',
                border: '1px solid transparent',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (msg.media_url) {
                  e.currentTarget.style.borderColor = '#10a37f';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'transparent';
              }}
            >
              <div style={{ fontSize: '11px', color: '#8e8ea0', marginBottom: '3px' }}>
                {msg.role === 'user' ? 'You' : 'AI'} • {msg.type || 'text'}
              </div>
              <div style={{ 
                overflow: 'hidden', 
                textOverflow: 'ellipsis', 
                whiteSpace: 'nowrap' 
              }}>
                {msg.content}
              </div>
              {msg.media_url && (
                <div style={{ fontSize: '11px', color: '#10a37f', marginTop: '5px' }}>
                  📎 Click to view
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ 
          padding: '10px 20px', 
          backgroundColor: '#343541',
          borderBottom: '1px solid #4d4d4f',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              backgroundColor: 'transparent',
              border: '1px solid #4d4d4f',
              color: 'white',
              padding: '8px 12px',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            {sidebarOpen ? '←' : '→'}
          </button>
          <h1 style={{ color: 'white', margin: 0, fontSize: '18px' }}>
            {activeTab === 'chat' ? 'AI Chat' : 'AI Video Generator'}
          </h1>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
          {activeTab === 'chat' ? (
            // Chat Interface
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
              <div style={{ marginBottom: '20px' }}>
                {messages.filter(m => m.type === 'text' || !m.type).map((msg, idx) => (
                  <div 
                    key={idx}
                    style={{
                      padding: '15px 20px',
                      backgroundColor: msg.role === 'user' ? '#343541' : '#444654',
                      borderBottom: '1px solid #4d4d4f',
                      color: '#ececf1'
                    }}
                  >
                    <div style={{ fontWeight: 'bold', marginBottom: '5px', color: msg.role === 'user' ? '#fff' : '#10a37f' }}>
                      {msg.role === 'user' ? 'You' : 'AI'}
                    </div>
                    <div style={{ lineHeight: '1.5' }}>{msg.content}</div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input */}
              <div style={{ 
                position: 'sticky', 
                bottom: '20px', 
                backgroundColor: '#40414f',
                borderRadius: '12px',
                padding: '10px',
                display: 'flex',
                gap: '10px',
                border: '1px solid #4d4d4f'
              }}>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Message..."
                  style={{
                    flex: 1,
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: 'white',
                    fontSize: '16px',
                    outline: 'none',
                    padding: '5px'
                  }}
                />
                <button 
                  onClick={sendMessage}
                  disabled={isLoading || !chatInput.trim()}
                  style={{
                    backgroundColor: '#10a37f',
                    color: 'white',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    opacity: isLoading ? 0.6 : 1
                  }}
                >
                  {isLoading ? '...' : '➤'}
                </button>
              </div>
            </div>
          ) : (
            // Create Video Interface
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
              <div style={{ backgroundColor: '#40414f', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
                <h2 style={{ color: 'white', marginBottom: '20px' }}>Create Video</h2>
                
                {/* Image Generation */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', color: '#ececf1', marginBottom: '8px', fontWeight: 'bold' }}>
                    Image Prompt:
                  </label>
                  <textarea
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    placeholder="A futuristic robot in a garden..."
                    style={{
                      width: '100%',
                      height: '80px',
                      padding: '10px',
                      backgroundColor: '#343541',
                      border: '1px solid #4d4d4f',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '14px',
                      resize: 'vertical'
                    }}
                  />
                  <button 
                    onClick={generateImage}
                    disabled={isLoading}
                    style={{
                      backgroundColor: '#10a37f',
                      color: 'white',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '8px',
                      marginTop: '10px',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      opacity: isLoading ? 0.6 : 1
                    }}
                  >
                    Generate Image
                  </button>
                </div>

                {/* Audio Input */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', color: '#ececf1', marginBottom: '8px', fontWeight: 'bold' }}>
                    Audio / Script:
                  </label>
                  <button 
                    onClick={isRecording ? stopRecording : startRecording}
                    style={{
                      backgroundColor: isRecording ? '#dc3545' : '#6f42c1',
                      color: 'white',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      marginRight: '10px'
                    }}
                  >
                    {isRecording ? '⏹ Stop Recording' : '🎤 Start Recording'}
                  </button>
                  
                  {transcript && (
                    <div style={{ 
                      marginTop: '10px', 
                      padding: '10px', 
                      backgroundColor: '#343541',
                      borderRadius: '8px',
                      color: '#ececf1'
                    }}>
                      <strong>Transcript:</strong> {transcript}
                    </div>
                  )}
                </div>

                {/* Script Input */}
                <div style={{ marginBottom: '20px' }}>
                  <textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder="Or type your script here..."
                    style={{
                      width: '100%',
                      height: '60px',
                      padding: '10px',
                      backgroundColor: '#343541',
                      border: '1px solid #4d4d4f',
                      borderRadius: '8px',
                      color: 'white',
                      fontSize: '14px',
                      resize: 'vertical'
                    }}
                  />
                  <button 
                    onClick={generateSpeech}
                    disabled={isLoading || !transcript}
                    style={{
                      backgroundColor: '#007bff',
                      color: 'white',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '8px',
                      marginTop: '10px',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      opacity: isLoading ? 0.6 : 1
                    }}
                  >
                    Generate Speech
                  </button>
                </div>
              </div>

              {/* Generated Assets */}
              <div style={{ backgroundColor: '#40414f', padding: '20px', borderRadius: '12px' }}>
                <h3 style={{ color: 'white', marginBottom: '15px' }}>Generated Assets</h3>
                
                {generatedImage && (
                  <div style={{ marginBottom: '20px' }}>
                    <p style={{ color: '#ececf1', marginBottom: '10px' }}>Generated Image:</p>
                    <img 
                      src={generatedImage} 
                      alt="Generated" 
                      style={{ maxWidth: '100%', borderRadius: '8px', border: '1px solid #4d4d4f' }} 
                    />
                  </div>
                )}

                {generatedAudio && (
                  <div style={{ marginBottom: '20px' }}>
                    <p style={{ color: '#ececf1', marginBottom: '10px' }}>Generated Audio:</p>
                    <audio 
                      controls 
                      src={generatedAudio} 
                      style={{ width: '100%' }}
                    />
                  </div>
                )}

                {!generatedImage && !generatedAudio && (
                  <p style={{ color: '#8e8ea0', textAlign: 'center', padding: '40px' }}>
                    Generated content will appear here
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '18px',
          zIndex: 9999
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: '10px' }}>Processing...</div>
            <div style={{ fontSize: '14px', color: '#8e8ea0' }}>This may take a moment</div>
          </div>
        </div>
      )}
    </div>
  );
}