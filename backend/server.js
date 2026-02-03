import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { createClient as deepgramClient } from '@deepgram/sdk';
import fetch from 'node-fetch';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const upload = multer({ dest: 'uploads/' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const DEEPGRAM_KEY = process.env.DEEPGRAM_KEY;
const HF_KEY = process.env.HF_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const deepgram = deepgramClient(DEEPGRAM_KEY);

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'AI Video Backend Running' });
});

app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    const audioBuffer = fs.readFileSync(req.file.path);
    
    const { result } = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      {
        model: 'nova-2',
        smart_format: true,
        language: 'en',
      }
    );

    fs.unlinkSync(req.file.path);

    const transcript = result.results.channels[0].alternatives[0].transcript;
    
    res.json({ 
      transcript,
      confidence: result.results.channels[0].alternatives[0].confidence
    });

  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt required' });
    }

    console.log('Generating image for:', prompt);

    // Using a different model - SDXL through Hugging Face Inference API
    const response = await fetch(
      'https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          inputs: prompt
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('HF API error:', response.status, errorText);
      throw new Error(`HF API error: ${response.status}`);
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    const base64Image = imageBuffer.toString('base64');
    const imageUrl = `data:image/png;base64,${base64Image}`;

    console.log('Image generated successfully');
    res.json({ imageUrl, prompt });

  } catch (error) {
    console.error('Image generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/text-to-speech', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text required' });
    }

    const response = await fetch('https://api.deepgram.com/v1/speak', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${DEEPGRAM_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error(`TTS error: ${response.status}`);
    }

    const audioBuffer = await response.buffer();
    const base64Audio = audioBuffer.toString('base64');
    const audioUrl = `data:audio/wav;base64,${base64Audio}`;

    res.json({ audioUrl, text });

  } catch (error) {
    console.error('TTS error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    
    // Simple response for now - you can integrate Mistral/Llama later
    const response = `I received: "${message}". This is a demo response. In production, this would be an AI model response.`;
    
    res.json({ response });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/save-conversation', async (req, res) => {
  try {
    const { session_id, role, content, type, media_url } = req.body;

    const { data, error } = await supabase
      .from('conversations')
      .insert([
        { session_id, role, content, type, media_url }
      ])
      .select();

    if (error) throw error;

    res.json({ success: true, data });

  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/conversations/:session_id', async (req, res) => {
  try {
    const { session_id } = req.params;

    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('session_id', session_id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json({ conversations: data });

  } catch (error) {
    console.error('Fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});