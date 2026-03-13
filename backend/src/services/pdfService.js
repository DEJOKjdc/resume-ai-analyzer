import pdfParse from 'pdf-parse/lib/pdf-parse.js';

export async function extractTextFromPDF(buffer) {
  try {
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch (err) {
    throw new Error('Could not extract PDF text. Try pasting resume text directly.');
  }
}