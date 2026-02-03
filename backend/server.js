import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { createClient as deepgramClient } from '@deepgram/sdk';
import FormData from 'form-data';
import fetch from 'node-fetch';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const upload = multer({ dest: 'uploads/' });

// Environment variables (no hardcoded secrets)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const DEEPGRAM_KEY = process.env.DEEPGRAM_KEY;
const HF_KEY = process.env.HF_KEY;

// Initialize clients
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const deepgram = deepgramClient(DEEPGRAM_KEY);

app.use(cors());
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'AI Video Backend Running' });
});

// 1. TRANSCRIBE AUDIO (Deepgram)
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
      confidence: result.results.channels[0].alternatives[0].confidence,
      words: result.results.channels[0].alternatives[0].words
    });

  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. GENERATE IMAGE (Hugging Face)
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt required' });
    }

    const response = await fetch(
      'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          inputs: prompt,
          parameters: {
            num_inference_steps: 30,
            guidance_scale: 7.5
          }
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HF API error: ${response.status}`);
    }

    const imageBuffer = await response.buffer();
    const base64Image = imageBuffer.toString('base64');
    const imageUrl = `data:image/png;base64,${base64Image}`;

    res.json({ imageUrl, prompt });

  } catch (error) {
    console.error('Image generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3. TEXT TO SPEECH (Deepgram)
app.post('/api/text-to-speech', async (req, res) => {
  try {
    const { text, voice = 'aura-luna-en' } = req.body;
    
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

// 4. SAVE CONVERSATION (Supabase)
app.post('/api/save-conversation', async (req, res) => {
  try {
    const { session_id, user_message, ai_response, image_url, video_url, audio_url } = req.body;

    const { data, error } = await supabase
      .from('conversations')
      .insert([
        { session_id, user_message, ai_response, image_url, video_url, audio_url }
      ])
      .select();

    if (error) throw error;

    res.json({ success: true, data });

  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5. GET CONVERSATION HISTORY
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

// 6. LIP SYNC (Placeholder)
app.post('/api/lip-sync', upload.fields([{ name: 'image' }, { name: 'audio' }]), async (req, res) => {
  try {
    res.json({ 
      message: 'Lip-sync endpoint ready',
      note: 'For demo, use pre-generated video or integrate Wav2Lip space',
      imageReceived: !!req.files.image,
      audioReceived: !!req.files.audio
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});