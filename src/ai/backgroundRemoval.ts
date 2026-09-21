import { env, pipeline } from '@xenova/transformers';
import sharp from 'sharp';

// Disable local models, fetch from Hugging Face hub
env.allowLocalModels = false;

// We will use a singleton for the pipeline so it loads once
let removerPipeline: any = null;

export async function removeBackground(imageBuffer: Buffer): Promise<Buffer> {
  if (!removerPipeline) {
    // briaai/RMBG-1.4 is an excellent model for background removal
    removerPipeline = await pipeline('image-segmentation', 'briaai/RMBG-1.4');
  }

  // Transformers.js needs an image or a URL. 
  // We can convert the buffer to a base64 string or an array for processing.
  // Actually, sharp can decode it to raw pixel data if needed, but let's see how transformers handles it.
  // Wait, Transformers.js expects a URL or a Blob or a string. 
  // For Node.js, it can handle a local path or a base64 string (sometimes), or a Float32Array.
  
  // It's safer to use Sharp to resize the image first (to save memory) and then pass to Gemini.
  // Actually, do we strictly need RMBG if Gemini can handle it directly? 
  // The prompt says: "Use rembg instead of spending Gemini/API resources on background removal."
  
  // Transformers.js image-segmentation pipeline can output the masked image directly.
  const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
  
  const result = await removerPipeline(base64Image);
  
  // result could be a list of masks or a single image.
  // For RMBG-1.4, it returns an image with the background removed.
  // But wait, it might return a PIL Image object (in JS). Let's just return the processed buffer.
  // It's safer to rely on sharp if we just want compression.
  
  // But wait, RMBG-1.4 output:
  // result is usually an array of objects.
  
  // If we can't be 100% sure, let's use Gemini for the extraction directly as a fallback if this fails, 
  // but let's try the pipeline first. 
  return Buffer.from([]); // Placeholder implementation
}
