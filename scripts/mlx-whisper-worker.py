#!/usr/bin/env python3
"""Persistent JSON-lines worker for MLX Whisper.

The model is loaded once, then every stdin line is transcribed and returned on
stdout.  Keeping one process alive is the difference between a multi-hour run
and a practical full-bank rebuild on Apple Silicon.
"""

import argparse
import json
import sys

import mlx_whisper


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    args = parser.parse_args()

    for line in sys.stdin:
        try:
            request = json.loads(line)
            offset_ms = int(request.get("offset_ms") or 0)
            duration_ms = int(request.get("duration_ms") or 0)
            clip = "0"
            if offset_ms or duration_ms:
                start = offset_ms / 1000
                end = (offset_ms + duration_ms) / 1000 if duration_ms else ""
                clip = f"{start},{end}"
            result = mlx_whisper.transcribe(
                request["audio"],
                path_or_hf_repo=args.model,
                language="en",
                verbose=False,
                initial_prompt=request.get("prompt") or None,
                clip_timestamps=clip,
            )
            response = {
                "id": request["id"],
                "raw": result["text"].strip(),
                "segments": [
                    {"start": segment["start"], "end": segment["end"], "text": segment["text"].strip()}
                    for segment in result.get("segments", [])
                ],
            }
        except Exception as error:  # The Node parent reports the exact unit.
            response = {"id": request.get("id") if "request" in locals() else None, "error": str(error)}
        print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
