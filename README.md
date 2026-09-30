# ComicCraft - AI Comic Story Creator using Gemini Models

ComicCraft turns a story idea into a four-panel comic with Gemini, then illustrates it using a Hugging Face image model. Preview and export the finished story as a print-ready, multi-page PDF.

## Run locally

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload
```

Open [http://localhost:8000](http://localhost:8000). Add `GEMINI_API_KEY` to `.env` to generate comics from user prompts and panel illustrations. Gemini image generation uses `GEMINI_IMAGE_MODEL`. Image generation requires available Gemini image quota or billing. Alternatively, add a Hugging Face access token as `HF_TOKEN` to use its image inference endpoint. Without a Gemini key, the studio clearly reports that generation is unavailable instead of substituting a canned story.

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `GEMINI_API_KEY` | Google AI Studio API key for Gemini | unset |
| `GEMINI_MODEL` | Gemini text model | `gemini-3.5-flash-lite` |
| `GEMINI_IMAGE_MODEL` | Gemini image-generation model | `gemini-3.1-flash-image` |
| `HF_TOKEN` | Hugging Face token with inference access | unset |
| `HF_IMAGE_MODEL` | Image model served by Hugging Face Inference | `stabilityai/stable-diffusion-xl-base-1.0` |

The Hugging Face image endpoint uses hosted inference; it does not download model weights or require a local GPU. Model availability and inference quotas depend on the provider account. Gemini and Hugging Face image generation both require an available model quota.

## API

- `GET /api/status` reports which generation providers are configured.
- `POST /api/generate` accepts `prompt`, `character`, `setting`, `tone`, and `style` and returns a comic with panel narration and optional image data.
- `POST /api/export` accepts a comic title and panels and returns a timestamped PDF download.

## Requirements

Python 3.10+, an internet connection for live AI generation, and a modern browser. The demo preview and PDF export work without provider keys.# ComicCraft-