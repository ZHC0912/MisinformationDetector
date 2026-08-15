// ============================================================
// OCR MODAL — extract text from an uploaded / pasted / dropped image.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, TriangleAlert, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { extractText, ApiError } from "@/lib/api";

export interface OcrSuccess {
  text: string;
  wordCount: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (payload: OcrSuccess) => void;
}

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export default function OcrModal({ open, onOpenChange, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(
    null
  );
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!ALLOWED.includes(file.type)) {
        setError("Unsupported format. Please use JPG, PNG, WEBP, or GIF.");
        return;
      }
      setError("");
      setLoading(true);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return {
          url: URL.createObjectURL(file),
          name: file.name || "pasted image",
        };
      });
      try {
        const data = await extractText(file);
        if (data.extracted_text) {
          onSuccess({ text: data.extracted_text, wordCount: data.word_count });
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "OCR failed.");
      } finally {
        setLoading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [onSuccess]
  );

  // Ctrl+V paste support (only while the modal is open)
  useEffect(() => {
    if (!open) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) processFile(file);
          break;
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [open, processFile]);

  // Release the preview object URL on unmount
  useEffect(
    () => () => {
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
    },
    []
  );

  const reset = () => {
    setError("");
    setLoading(false);
    setDragging(false);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  const openPicker = () => {
    if (!loading) fileRef.current?.click();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (loading) return;
    const file = e.dataTransfer?.files?.[0];
    if (file) processFile(file);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Extract text from image</DialogTitle>
          <DialogDescription>
            Upload a screenshot or photo of an article to extract its text.
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input bg-muted/30 px-4 py-8 text-center transition-colors",
            "cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            dragging && "border-primary bg-accent",
            loading && "pointer-events-none opacity-70"
          )}
          role="button"
          tabIndex={0}
          aria-label="Upload an image: click, press Enter, drag and drop, or paste from clipboard"
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openPicker();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          {preview ? (
            <div className="flex w-full items-center gap-3 text-left">
              <img
                className="h-16 w-16 shrink-0 rounded-md border object-cover"
                src={preview.url}
                alt={`Preview of ${preview.name}`}
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {preview.name}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {loading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting
                      text…
                    </>
                  ) : (
                    "Click or drop another image to replace"
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              <Upload className="h-7 w-7 text-muted-foreground" />
              <div className="text-sm font-medium">
                Click to upload, or drag &amp; drop
              </div>
              <div className="text-xs text-muted-foreground">
                You can also press{" "}
                <kbd className="rounded border bg-muted px-1 font-mono text-[11px]">
                  Ctrl+V
                </kbd>{" "}
                to paste from clipboard
              </div>
              <div className="text-xs text-muted-foreground">
                JPG · PNG · WEBP · GIF · max 10 MB
              </div>
            </>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => processFile(e.target.files?.[0])}
        />

        {error && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
