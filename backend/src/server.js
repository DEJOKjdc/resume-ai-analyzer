/**
 * server.js — ResuAI Pro v3 Express Server
 * ─────────────────────────────────────────────────────────────────────────
 * Single endpoint: POST /api/analyze
 * Accepts: multipart/form-data with resume file OR resumeText + geminiApiKey
 */
import express  from 'express';
import cors     from 'cors';
import multer   from 'multer';
import path     from 'path';
import { fileURLToPath } from 'url';

import { runPCAM }           from './agents/pcamOrchestrator.js';
import { extractTextFromPDF } from './services/pdfService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

// Serve the frontend
app.use(express.static(path.join(__dirname, '../../frontend')));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '3.0.0', architecture: 'PCAM', model: 'gemini-2.5-flash-preview-04-17' });
});

// ── Main analysis endpoint ────────────────────────────────────────────────────
app.post('/api/analyze', upload.single('resume'), async (req, res) => {
  const startTime = Date.now();

  try {
    // ── Extract API key ──────────────────────────────────────────────
    const geminiApiKey = req.body?.geminiApiKey?.trim();
    if (!geminiApiKey || geminiApiKey.length < 10) {
      return res.status(400).json({ success: false, error: 'Invalid or missing Gemini API key.' });
    }

    // ── Extract resume text ──────────────────────────────────────────
    let resumeText = '';
    if (req.file) {
      const mime = req.file.mimetype;
      if (mime === 'application/pdf') {
        resumeText = await extractTextFromPDF(req.file.buffer);
      } else if (mime === 'text/plain') {
        resumeText = req.file.buffer.toString('utf-8');
      } else if (mime.includes('word') || mime.includes('document')) {
        // Basic DOCX: extract raw text (some garbage chars expected)
        resumeText = req.file.buffer.toString('utf-8').replace(/[^\x20-\x7E\n]/g, ' ');
      } else {
        return res.status(400).json({ success: false, error: 'Unsupported file type. Use PDF, DOC, DOCX, or TXT.' });
      }
    } else if (req.body?.resumeText?.trim()) {
      resumeText = req.body.resumeText.trim();
    } else {
      return res.status(400).json({ success: false, error: 'No resume provided. Upload a file or paste text.' });
    }

    if (resumeText.length < 100) {
      return res.status(400).json({ success: false, error: 'Resume text too short. Please provide a complete resume.' });
    }

    const jobDescription = req.body?.jobDescription?.trim() || '';

    console.log(`\n[SERVER] /api/analyze — resume: ${resumeText.length} chars | JD: ${jobDescription.length} chars`);

    // ── Run PCAM pipeline ────────────────────────────────────────────
    const result = await runPCAM(resumeText, jobDescription, geminiApiKey);

    console.log(`[SERVER] Done — ${Date.now() - startTime}ms`);

    res.json({ success: true, data: result });

  } catch (err) {
    console.error('[SERVER] Error:', err.message);
    const code = err.message?.includes('API key') ? 401
               : err.message?.includes('quota')   ? 429
               : err.message?.includes('resume')  ? 400
               : 500;
    res.status(code).json({ success: false, error: err.message || 'Analysis failed.' });
  }
});

// Catch-all: serve frontend for any unknown route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════════╗`);
  console.log(`║  ResuAI Pro v3 — PCAM Architecture        ║`);
  console.log(`║  Server running on http://localhost:${PORT}   ║`);
  console.log(`║  Model: gemini-2.5-flash-preview-04-17    ║`);
  console.log(`╚════════════════════════════════════════════╝\n`);
});