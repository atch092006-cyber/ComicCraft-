import asyncio
import base64
import io
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fpdf import FPDF
from pydantic import BaseModel, Field

load_dotenv()

ROOT = Path(__file__).parent
app = FastAPI(title="ComicCraft - AI Comic Story Creator using Gemini Models")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


class ComicRequest(BaseModel):
    prompt: str = Field(min_length=8, max_length=1000)
    character: str = Field(default="Pip", max_length=60)
    setting: str = Field(default="Enchanted forest", max_length=100)
    tone: str = Field(default="Adventurous", max_length=50)
    style: str = Field(default="Storybook", max_length=50)


class Panel(BaseModel):
    title: str
    narration: str
    image_prompt: str


class Comic(BaseModel):
    title: str
    panels: list[Panel]


class ExportPanel(BaseModel):
    title: str = Field(max_length=120)
    narration: str = Field(max_length=2000)
    image: str | None = Field(default=None, max_length=12_000_000)


class ExportRequest(BaseModel):
    title: str = Field(max_length=120)
    panels: list[ExportPanel] = Field(min_length=1, max_length=6)


@app.get("/")
def home():
    return FileResponse(ROOT / "static" / "index.html")


@app.get("/api/status")
def status():
    return {
        "gemini": bool(os.getenv("GEMINI_API_KEY")),
        "images": bool(os.getenv("HF_TOKEN")),
        "model": os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
    }


def _make_story(request: ComicRequest) -> Comic:
    from google import genai

    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    prompt = f"""Create a cohesive, original four-panel comic for a general audience.
Story idea: {request.prompt}
Main character: {request.character}
Setting: {request.setting}
Tone: {request.tone}
Art style: {request.style}

Return only JSON with this exact shape:
{{"title":"short comic title","panels":[{{"title":"short panel heading","narration":"1-2 concise sentences of comic narration or dialogue","image_prompt":"visual description for one comic illustration; no text, letters, speech bubbles or watermark"}}]}}
Include exactly four panels. Keep the character and art direction visually consistent across every image_prompt."""
    result = client.models.generate_content(
        model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        contents=prompt,
        config={"response_mime_type": "application/json"},
    )
    payload = json.loads(result.text)
    comic = Comic.model_validate(payload)
    if len(comic.panels) != 4:
        raise ValueError("Gemini did not return exactly four panels.")
    return comic


def _make_image(image_prompt: str, style: str) -> str | None:
    token = os.getenv("HF_TOKEN")
    if not token:
        return None
    model = os.getenv("HF_IMAGE_MODEL", "stabilityai/stable-diffusion-xl-base-1.0")
    result = requests.post(
        f"https://router.huggingface.co/hf-inference/models/{model}",
        headers={"Authorization": f"Bearer {token}"},
        json={"inputs": f"{style} comic illustration, expressive inked lines, {image_prompt}"},
        timeout=90,
    )
    result.raise_for_status()
    if not result.headers.get("content-type", "").startswith("image/"):
        return None
    image_type = result.headers["content-type"].split(";")[0].split("/")[-1]
    encoded = base64.b64encode(result.content).decode("ascii")
    return f"data:image/{image_type};base64,{encoded}"


@app.post("/api/generate")
async def generate(request: ComicRequest):
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=503, detail="Add GEMINI_API_KEY to .env to enable Gemini generation.")
    try:
        comic = await asyncio.to_thread(_make_story, request)
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Story generation failed: {error}") from error

    images = await asyncio.gather(
        *(
            asyncio.to_thread(_make_image, panel.image_prompt, request.style)
            for panel in comic.panels
        ),
        return_exceptions=True,
    )
    panels = []
    for panel, image in zip(comic.panels, images):
        panel_data = panel.model_dump()
        panel_data["image"] = image if isinstance(image, str) else None
        panels.append(panel_data)
    return {"title": comic.title, "panels": panels}


def _pdf_text(text: str) -> str:
    return re.sub(r"[^\x00-\xff]", "?", text)


@app.post("/api/export")
def export_comic(request: ExportRequest):
    pdf = FPDF(format="A4")
    pdf.set_title(_pdf_text(request.title))
    for index, panel in enumerate(request.panels, start=1):
        pdf.add_page()
        pdf.set_margins(16, 18, 16)
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(50, 111, 95)
        pdf.cell(0, 8, _pdf_text(f"COMICCRAFT  /  PANEL {index:02d}"), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)
        pdf.set_text_color(28, 39, 38)
        pdf.set_font("Helvetica", "B", 26)
        pdf.multi_cell(0, 12, _pdf_text(panel.title))
        image_data = panel.image
        if image_data and image_data.startswith("data:image/") and "," in image_data:
            try:
                metadata, encoded = image_data.split(",", 1)
                image_bytes = base64.b64decode(encoded, validate=True)
                image_format = metadata.split("/", 1)[1].split(";", 1)[0].upper()
                if image_format in {"JPEG", "JPG", "PNG", "WEBP"}:
                    stream = io.BytesIO(image_bytes)
                    stream.name = f"panel.{image_format.lower()}"
                    pdf.image(stream, x=16, y=pdf.get_y() + 5, w=178, h=112, keep_aspect_ratio=True)
                    pdf.set_y(pdf.get_y() + 121)
            except (ValueError, OSError):
                pass
        pdf.ln(5)
        pdf.set_font("Helvetica", size=14)
        pdf.set_text_color(55, 64, 61)
        pdf.multi_cell(0, 8, _pdf_text(panel.narration))
    filename = f"comiccraft-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}.pdf"
    return Response(
        content=bytes(pdf.output()),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )